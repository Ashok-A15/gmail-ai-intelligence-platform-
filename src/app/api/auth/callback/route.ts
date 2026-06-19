import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      console.error('Google OAuth error callback:', error);
      return NextResponse.redirect(new URL(`/setup?error=${error}`, request.url));
    }

    if (!code) {
      return NextResponse.json({ error: 'Authorization code missing' }, { status: 400 });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = 'http://localhost:3000/api/auth/callback';

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch user email using userinfo endpoint
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    if (!email) {
      throw new Error('Could not retrieve user email address from Google OAuth API.');
    }

    // Prepare token expiry date
    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : new Date(Date.now() + 3500 * 1000).toISOString(); // Default to ~1 hour

    // Build user record payload
    const userPayload: any = {
      id: email,
      email: email,
      gmail_access_token: tokens.access_token,
      gmail_token_expires_at: expiresAt,
    };

    // Note: Google only sends the refresh_token on the first authorization.
    // If it is provided, we save it. If not, we don't overwrite the existing one in the database.
    if (tokens.refresh_token) {
      userPayload.gmail_refresh_token = tokens.refresh_token;
    }

    // Upsert into Supabase users table
    const { error: upsertError } = await supabase
      .from('users')
      .upsert(userPayload, { onConflict: 'id' });

    if (upsertError) {
      console.error('Error saving user tokens to Supabase:', upsertError);
      throw new Error(`Database error: ${upsertError.message}`);
    }

    // Redirect to homepage and set user email cookie for authentication context
    const response = NextResponse.redirect(new URL('/', request.url));
    
    // Set cookie valid for 30 days
    response.cookies.set('user_email', email, {
      path: '/',
      httpOnly: false,
      maxAge: 30 * 24 * 60 * 60, // 30 days
      sameSite: 'lax',
    });

    return response;
  } catch (err: any) {
    console.error('OAuth Callback exception:', err);
    return NextResponse.redirect(
      new URL(`/setup?error=${encodeURIComponent(err.message || 'OAuth authentication failed')}`, request.url)
    );
  }
}
