import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const userEmail = cookieStore.get('user_email')?.value;

    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let query = supabase
      .from('threads')
      .select('*')
      .eq('user_id', userEmail)
      .order('last_updated_at', { ascending: false });

    if (category && category !== 'Inbox') {
      query = query.eq('category', category);
    }

    const { data: threads, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ threads });
  } catch (err: any) {
    console.error('Threads API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
