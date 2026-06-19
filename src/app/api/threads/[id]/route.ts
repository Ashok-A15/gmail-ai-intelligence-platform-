import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';

export async function GET(
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

    // Fetch the thread record
    const { data: thread, error: threadError } = await supabase
      .from('threads')
      .select('*')
      .eq('id', threadId)
      .eq('user_id', userEmail)
      .single();

    if (threadError || !thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    // Fetch all emails in this thread ordered by date
    const { data: emails, error: emailsError } = await supabase
      .from('emails')
      .select('*')
      .eq('thread_id', threadId)
      .eq('user_id', userEmail)
      .order('date', { ascending: true });

    if (emailsError) {
      return NextResponse.json({ error: emailsError.message }, { status: 500 });
    }

    return NextResponse.json({
      thread,
      emails,
    });
  } catch (err: any) {
    console.error('Thread detail API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
