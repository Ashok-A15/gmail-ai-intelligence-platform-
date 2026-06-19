import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Google OAuth Client ID or Client Secret is not configured. Please visit the setup page first.' },
      { status: 400 }
    );
  }

  // Determine redirect URI - default to localhost:3000
  const redirectUri = 'http://localhost:3000/api/auth/callback';

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  // Scopes needed for syncing emails, sending replies, and getting user email address
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.email',
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Required to get a refresh token
    prompt: 'consent',     // Forces consent screen to ensure refresh token is returned
    scope: scopes,
  });

  return NextResponse.json({ url: authUrl });
}
