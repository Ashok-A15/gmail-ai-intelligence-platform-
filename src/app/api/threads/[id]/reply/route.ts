import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { draftReply } from '@/lib/ai';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const userEmail = cookieStore.get('user_email')?.value;

    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: threadId } = await params;
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // 1. Fetch all emails in the thread, sorted by date (ascending)
    const { data: emails, error: emailsError } = await supabase
      .from('emails')
      .select('from_name, from_email, subject, body_text, date')
      .eq('thread_id', threadId)
      .eq('user_id', userEmail)
      .order('date', { ascending: true });

    if (emailsError || !emails || emails.length === 0) {
      return NextResponse.json({ error: 'No emails found in this thread' }, { status: 404 });
    }

    console.log(`[AI] Drafting reply for thread: ${threadId} with ${emails.length} messages context.`);
    
    // 2. Generate the reply using Gemini
    const replyBody = await draftReply(emails, prompt);

    return NextResponse.json({
      success: true,
      body: replyBody,
    });
  } catch (err: any) {
    console.error('Reply drafting API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
