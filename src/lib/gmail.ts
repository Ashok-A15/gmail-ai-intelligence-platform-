import { google } from 'googleapis';
import { supabase } from './supabase';

/**
 * Exponential backoff wrapper to handle rate limits (429) and temporary server issues (5xx).
 */
export async function executeWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 5,
  delay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const status = error.status || error.code || (error.response && error.response.status);
    
    // Check if the error is retryable (Rate Limit 429 or Server Error 5xx)
    if (retries > 0 && (status === 429 || status >= 500)) {
      console.warn(`[Gmail API] Rate limited (429) or Server error (${status}). Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return executeWithBackoff(fn, retries - 1, delay * 2);
    }
    
    throw error;
  }
}

/**
 * Retrieves the Google OAuth Client Credentials and returns a refreshed Gmail API client.
 */
export async function getGmailClient(userEmail: string) {
  // 1. Fetch user OAuth credentials from Supabase
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userEmail)
    .single();

  if (error || !user) {
    throw new Error(`User not found or database error: ${error?.message || 'Empty result'}`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = 'http://localhost:3000/api/auth/callback';

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured. Please complete setup.');
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  oauth2Client.setCredentials({
    access_token: user.gmail_access_token,
    refresh_token: user.gmail_refresh_token,
  });

  // 2. Check if access token is expired or expiring in the next 60 seconds
  const expiryTime = user.gmail_token_expires_at ? new Date(user.gmail_token_expires_at).getTime() : 0;
  const isExpired = Date.now() + 60000 >= expiryTime;

  if (isExpired) {
    if (!user.gmail_refresh_token) {
      throw new Error('OAuth token expired and no refresh token is stored. User must re-authenticate.');
    }

    console.log(`[OAuth] Access token expired for ${userEmail}. Refreshing...`);
    
    const refreshedCredentials = await executeWithBackoff(async () => {
      const { credentials } = await oauth2Client.refreshAccessToken();
      return credentials;
    });

    oauth2Client.setCredentials(refreshedCredentials);

    const newExpiresAt = refreshedCredentials.expiry_date
      ? new Date(refreshedCredentials.expiry_date).toISOString()
      : new Date(Date.now() + 3500 * 1000).toISOString();

    // Update new access token in Supabase
    const updatePayload: any = {
      gmail_access_token: refreshedCredentials.access_token,
      gmail_token_expires_at: newExpiresAt,
    };
    if (refreshedCredentials.refresh_token) {
      updatePayload.gmail_refresh_token = refreshedCredentials.refresh_token;
    }

    const { error: updateError } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', userEmail);

    if (updateError) {
      console.error('[OAuth] Failed to update refreshed tokens in database:', updateError);
    } else {
      console.log(`[OAuth] Successfully refreshed access token for ${userEmail}`);
    }
  }

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Formats raw email body parts to extract HTML or plaintext content.
 */
export function parseEmailBody(payload: any): { text: string; html: string } {
  let text = '';
  let html = '';

  const decodeBase64 = (data: string) => {
    return Buffer.from(data, 'base64').toString('utf8');
  };

  const traverse = (part: any) => {
    if (part.mimeType === 'text/plain' && part.body && part.body.data) {
      text += decodeBase64(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
      html += decodeBase64(part.body.data);
    } else if (part.parts) {
      part.parts.forEach(traverse);
    }
  };

  if (payload) {
    if (payload.parts) {
      payload.parts.forEach(traverse);
    } else if (payload.body && payload.body.data) {
      const bodyText = decodeBase64(payload.body.data);
      if (payload.mimeType === 'text/html') {
        html = bodyText;
      } else {
        text = bodyText;
      }
    }
  }

  // Fallback to text if html is empty and vice versa
  if (!text && html) {
    // Basic HTML tag stripping for text fallback
    text = html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
  }
  if (!html && text) {
    html = `<div style="white-space: pre-wrap; font-family: sans-serif;">${text}</div>`;
  }

  return { text: text.trim(), html: html.trim() };
}

/**
 * Formats header structures from the Gmail API payload.
 */
export function getHeader(headers: any[], name: string): string {
  const header = headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value || '';
}

/**
 * Builds and sends a raw MIME email (necessary to preserve conversation threading).
 */
export async function sendMimeEmail(
  gmail: any,
  to: string,
  subject: string,
  bodyText: string,
  headers: Record<string, string> = {},
  threadId?: string
) {
  const emailLines: string[] = [];

  // Add standard headers
  emailLines.push(`To: ${to}`);
  emailLines.push(`Subject: ${subject}`);
  emailLines.push('Content-Type: text/plain; charset=utf-8');
  emailLines.push('MIME-Version: 1.0');

  // Inject additional custom headers (e.g., In-Reply-To, References, Message-ID)
  Object.entries(headers).forEach(([key, val]) => {
    emailLines.push(`${key}: ${val}`);
  });

  // End of headers boundary
  emailLines.push('');
  emailLines.push(bodyText);

  // Encode in safe base64url format
  const rawContent = Buffer.from(emailLines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, ''); // Base64URL encoding

  return await executeWithBackoff(async () => {
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawContent,
        threadId: threadId,
      },
    });
    return res.data;
  });
}
