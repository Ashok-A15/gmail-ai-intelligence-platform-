import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const REQUIRED_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY',
  'NVIDIA_API_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET'
];

export async function GET() {
  const status: Record<string, boolean> = {};
  
  REQUIRED_KEYS.forEach(key => {
    status[key] = !!process.env[key];
  });

  return NextResponse.json({
    configured: REQUIRED_KEYS.every(key => !!process.env[key]),
    status
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const envPath = path.join(process.cwd(), '.env.local');
    
    // Read current .env.local file if it exists
    let currentEnvContent = '';
    if (fs.existsSync(envPath)) {
      currentEnvContent = fs.readFileSync(envPath, 'utf8');
    }

    // Parse existing lines
    const lines = currentEnvContent.split('\n').filter(line => line.trim() !== '');
    const envMap: Record<string, string> = {};
    
    lines.forEach(line => {
      const equalsIndex = line.indexOf('=');
      if (equalsIndex > -1) {
        const key = line.substring(0, equalsIndex).trim();
        const val = line.substring(equalsIndex + 1).trim();
        envMap[key] = val;
      }
    });

    // Update with new values and update in-memory process.env
    REQUIRED_KEYS.forEach(key => {
      if (body[key] !== undefined && body[key] !== null) {
        const val = body[key].toString().trim();
        envMap[key] = val;
        process.env[key] = val; // Set dynamically for immediate API calls
      }
    });

    // Reconstruct .env.local content
    const newEnvContent = REQUIRED_KEYS
      .map(key => `${key}=${envMap[key] || ''}`)
      .join('\n') + '\n';

    fs.writeFileSync(envPath, newEnvContent, 'utf8');

    return NextResponse.json({ success: true, message: 'Settings saved successfully.' });
  } catch (error: any) {
    console.error('Error saving config:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
