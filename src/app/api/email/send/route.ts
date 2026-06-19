import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { getGmailClient, sendMimeEmail } from '@/lib/gmail';
import { generateEmbedding, summarizeEmail } from '@/lib/ai';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const userEmail = cookieStore.get('user_email')?.value;

    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { to, subject, body, threadId } = await request.json();

    if (!to || !subject || !body) {
      return NextResponse.json({ error: 'To, Subject, and Body are required fields' }, { status: 400 });
    }

    // Initialize Gmail client
    const gmail = await getGmailClient(userEmail);

    let mimeHeaders: Record<string, string> = {};
    let finalSubject = subject;
    let finalThreadId = threadId;

    // If it's a thread reply, retrieve thread headers to preserve threading
    if (threadId) {
      const { data: lastEmail, error: lastEmailError } = await supabase
        .from('emails')
        .select('*')
        .eq('thread_id', threadId)
        .order('date', { ascending: false })
        .limit(1)
        .single();

      if (!lastEmailError && lastEmail) {
        // Build thread reference headers
        if (lastEmail.message_id_header) {
          mimeHeaders['In-Reply-To'] = lastEmail.message_id_header;
          
          const refs = lastEmail.references_header 
            ? `${lastEmail.references_header} ${lastEmail.message_id_header}`
            : lastEmail.message_id_header;
            
          mimeHeaders['References'] = refs;
        }

        // Align subject line
        if (!subject.toLowerCase().startsWith('re:')) {
          finalSubject = `Re: ${lastEmail.subject || subject}`;
        }
      }
    }

    console.log(`[Gmail] Sending email to: ${to}, Thread: ${threadId || 'new'}`);
    
    // Send email using Gmail API
    const sentMessage = await sendMimeEmail(
      gmail,
      to,
      finalSubject,
      body,
      mimeHeaders,
      threadId
    );

    const gmailMsgId = sentMessage.id;
    finalThreadId = sentMessage.threadId || threadId || finalThreadId;

    if (gmailMsgId && finalThreadId) {
      // 1. Summarize the sent email
      const summary = await summarizeEmail(body);

      // 2. Insert the sent message into Supabase
      const sentEmailPayload = {
        id: gmailMsgId,
        thread_id: finalThreadId,
        user_id: userEmail,
        from_name: 'Me',
        from_email: userEmail,
        to_name: to.split('@')[0],
        to_email: to,
        subject: finalSubject,
        body_text: body,
        body_html: `<div style="white-space: pre-wrap; font-family: sans-serif;">${body}</div>`,
        snippet: body.slice(0, 100),
        date: new Date().toISOString(),
        category: 'Work / Professional', // Composed mails default to Work/Professional
        summary: summary,
        is_read: true,
        is_sent: true,
      };

      // Ensure the thread exists in database if sending a new message which starts a thread
      if (!threadId) {
        await supabase
          .from('threads')
          .insert({
            id: finalThreadId,
            user_id: userEmail,
            subject: finalSubject,
            category: 'Work / Professional',
            last_updated_at: new Date().toISOString(),
            summary: summary,
          });
      }

      // Save email
      const { error: insError } = await supabase
        .from('emails')
        .insert(sentEmailPayload);

      if (insError) {
        console.error('[Gmail] Error saving sent email to Supabase:', insError);
      } else {
        // 3. Generate embeddings for sent email and save them
        const chunks = [body.slice(0, 1000)]; // Simple chunking for outgoing
        for (let i = 0; i < chunks.length; i++) {
          try {
            const vector = await generateEmbedding(chunks[i]);
            await supabase
              .from('email_embeddings')
              .insert({
                email_id: gmailMsgId,
                thread_id: finalThreadId,
                chunk_index: i,
                chunk_text: chunks[i],
                embedding: vector,
              });
          } catch (embedErr) {
            console.error('[Gmail] Embedding generation failed for sent email:', embedErr);
          }
        }

        // 4. Update the thread's last updated time
        await supabase
          .from('threads')
          .update({
            last_updated_at: new Date().toISOString(),
          })
          .eq('id', finalThreadId);
      }
    }

    return NextResponse.json({
      success: true,
      messageId: gmailMsgId,
      threadId: finalThreadId,
    });
  } catch (err: any) {
    console.error('Send API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
