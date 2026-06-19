import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { draftEmail } from '@/lib/ai';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const userEmail = cookieStore.get('user_email')?.value;

    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { prompt, context } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    console.log(`[AI] Drafting new email for user prompt: "${prompt}"`);
    const draftText = await draftEmail(prompt, context);

    // Parse Subject and Body if formatted as "Subject: [Subject]\n[Body]"
    let subject = 'No Subject';
    let body = draftText;

    const subjectMatch = draftText.match(/^Subject:\s*(.*)/i);
    if (subjectMatch) {
      subject = subjectMatch[1].trim();
      // Remove the subject line from the body
      body = draftText.replace(/^Subject:\s*(.*)\n*/i, '').trim();
    }

    return NextResponse.json({
      success: true,
      subject,
      body,
    });
  } catch (err: any) {
    console.error('Compose API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
