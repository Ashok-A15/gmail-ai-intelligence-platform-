import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { getGmailClient, executeWithBackoff, parseEmailBody, getHeader } from '@/lib/gmail';
import { categorizeEmail, summarizeEmail, summarizeThread, generateEmbedding } from '@/lib/ai';

// Chunking helper for RAG embeddings
function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const chunk = text.slice(i, i + chunkSize).trim();
    if (chunk.length > 50) { // Only embed meaningful chunks
      chunks.push(chunk);
    }
    i += chunkSize - overlap;
    
    // Prevent infinite loop if text length is small or overlap equals chunk size
    if (chunkSize <= overlap) break;
  }
  return chunks;
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const userEmail = cookieStore.get('user_email')?.value;

    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
    }

    // 1. Get user record to read sync state
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userEmail)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User settings not found in database.' }, { status: 404 });
    }

    // 2. Initialize Gmail client
    const gmail = await getGmailClient(userEmail);

    // 3. Prepare Gmail query for incremental sync
    let query = 'in:inbox'; // Sync inbox threads
    if (user.last_sync_time) {
      const lastSyncSeconds = Math.floor(new Date(user.last_sync_time).getTime() / 1000);
      // Look back a bit further (e.g. 1 hour) to make sure we don't miss any emails due to clock skew
      const safeSyncSeconds = Math.max(0, lastSyncSeconds - 3600);
      query += ` after:${safeSyncSeconds}`;
    }

    console.log(`[Sync] Querying Gmail with query: "${query}"`);

    // 4. Fetch list of modified threads
    // Limit to 15 threads per sync call to prevent timeouts in serverless execution environments
    const threadsResponse = await executeWithBackoff(async () => {
      return await gmail.users.threads.list({
        userId: 'me',
        q: query,
        maxResults: 15,
      });
    });

    const gmailThreads = threadsResponse.data.threads || [];
    console.log(`[Sync] Found ${gmailThreads.length} threads to check.`);

    let threadsSynced = 0;
    let emailsSynced = 0;

    // 5. Fetch existing threads/emails from database to optimize sync
    const { data: existingThreads } = await supabase
      .from('threads')
      .select('id')
      .eq('user_id', userEmail);
    const existingThreadIds = new Set(existingThreads?.map((t) => t.id) || []);

    const { data: existingEmails } = await supabase
      .from('emails')
      .select('id')
      .eq('user_id', userEmail);
    const existingEmailIds = new Set(existingEmails?.map((e) => e.id) || []);

    // 6. Process threads sequentially to manage rate limits and API quotas safely
    for (const t of gmailThreads) {
      const threadId = t.id;
      if (!threadId) continue;

      console.log(`[Sync] Processing thread ID: ${threadId}`);

      // Fetch full thread details from Gmail
      const threadDetail = await executeWithBackoff(async () => {
        return await gmail.users.threads.get({
          userId: 'me',
          id: threadId,
        });
      });

      const messages = threadDetail.data.messages || [];
      if (messages.length === 0) continue;

      let newMessagesInThread = false;
      const parsedMessages: any[] = [];

      // Process messages in the thread
      for (const msg of messages) {
        const msgId = msg.id;
        if (!msgId) continue;

        // Skip if already stored in database
        if (existingEmailIds.has(msgId)) {
          continue;
        }

        newMessagesInThread = true;
        
        // Parse message fields
        const payload = msg.payload;
        const headers = payload?.headers || [];

        const from = getHeader(headers, 'from');
        const to = getHeader(headers, 'to');
        const subject = getHeader(headers, 'subject') || '(No Subject)';
        const dateStr = getHeader(headers, 'date');
        const date = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();
        const messageIdHeader = getHeader(headers, 'message-id');
        const inReplyToHeader = getHeader(headers, 'in-reply-to');
        const referencesHeader = getHeader(headers, 'references');
        const labelIds = msg.labelIds || [];
        const isRead = !labelIds.includes('UNREAD');
        const isSent = labelIds.includes('SENT');

        // Extract sender name and email
        let fromName = '';
        let fromEmail = '';
        const fromMatch = from.match(/^(.*?)\s*<([^>]+)>/);
        if (fromMatch) {
          fromName = fromMatch[1].replace(/['"]/g, '').trim();
          fromEmail = fromMatch[2].trim();
        } else {
          fromEmail = from.trim();
          fromName = fromEmail.split('@')[0];
        }

        // Extract recipient name and email
        let toName = '';
        let toEmail = '';
        const toMatch = to.match(/^(.*?)\s*<([^>]+)>/);
        if (toMatch) {
          toName = toMatch[1].replace(/['"]/g, '').trim();
          toEmail = toMatch[2].trim();
        } else {
          toEmail = to.trim();
          toName = toEmail.split('@')[0];
        }

        const snippet = msg.snippet || '';
        const { text: bodyText, html: bodyHtml } = parseEmailBody(payload);

        // Generate individual email classification and summary
        console.log(`[AI] Categorizing email ${msgId} from ${fromEmail}`);
        const category = await categorizeEmail(from, subject, snippet, bodyText);
        
        console.log(`[AI] Summarizing email ${msgId}`);
        const summary = await summarizeEmail(bodyText);

        parsedMessages.push({
          id: msgId,
          thread_id: threadId,
          user_id: userEmail,
          from_name: fromName,
          from_email: fromEmail,
          to_name: toName,
          to_email: toEmail,
          subject,
          body_text: bodyText,
          body_html: bodyHtml,
          snippet,
          date,
          category,
          summary,
          message_id_header: messageIdHeader,
          in_reply_to_header: inReplyToHeader,
          references_header: referencesHeader,
          is_read: isRead,
          is_sent: isSent,
        });

        emailsSynced++;
      }

      if (newMessagesInThread && parsedMessages.length > 0) {
        // First insert or ensure the thread exists in the database
        const latestMsg = parsedMessages[parsedMessages.length - 1];
        
        if (!existingThreadIds.has(threadId)) {
          // Create thread row
          const { error: threadInsError } = await supabase
            .from('threads')
            .insert({
              id: threadId,
              user_id: userEmail,
              subject: latestMsg.subject,
              category: latestMsg.category,
              last_updated_at: latestMsg.date,
            });
          
          if (threadInsError) {
            console.error(`Error inserting thread ${threadId}:`, threadInsError);
            continue;
          }
          existingThreadIds.add(threadId);
        }

        // Insert new emails
        const { error: emailsInsError } = await supabase
          .from('emails')
          .insert(parsedMessages);

        if (emailsInsError) {
          console.error(`Error inserting emails for thread ${threadId}:`, emailsInsError);
          continue;
        }

        // Generate embeddings for the new emails and store them in supabase
        for (const email of parsedMessages) {
          const chunks = chunkText(email.body_text);
          console.log(`[AI] Generating ${chunks.length} embeddings for email ${email.id}`);

          for (let i = 0; i < chunks.length; i++) {
            try {
              const vector = await generateEmbedding(chunks[i]);
              await supabase
                .from('email_embeddings')
                .insert({
                  email_id: email.id,
                  thread_id: threadId,
                  chunk_index: i,
                  chunk_text: chunks[i],
                  embedding: vector,
                });
            } catch (embedErr) {
              console.error(`[AI] Embedding generation failed for chunk ${i} of email ${email.id}:`, embedErr);
            }
          }
        }

        // Recompute thread-level summary and update category using all emails in database for this thread
        const { data: allThreadEmails } = await supabase
          .from('emails')
          .select('from_name, from_email, subject, summary, category, date')
          .eq('thread_id', threadId)
          .order('date', { ascending: true });

        if (allThreadEmails && allThreadEmails.length > 0) {
          // Thread summary text compiles summaries of all messages
          const compiledSummaries = allThreadEmails
            .map((m, idx) => `Email #${idx + 1} from ${m.from_name} (${m.date}): ${m.summary}`)
            .join('\n\n');

          console.log(`[AI] Generating thread summary for thread ${threadId}`);
          const threadSummaryText = await summarizeThread(compiledSummaries);

          // Get category of the latest email as the thread category
          const latestEmail = allThreadEmails[allThreadEmails.length - 1];

          await supabase
            .from('threads')
            .update({
              summary: threadSummaryText,
              category: latestEmail.category || latestMsg.category,
              last_updated_at: latestEmail.date,
            })
            .eq('id', threadId);
        }

        threadsSynced++;
      }
    }

    // 7. Update User Last Sync Time
    const currentSyncTime = new Date().toISOString();
    await supabase
      .from('users')
      .update({
        last_sync_time: currentSyncTime,
      })
      .eq('id', userEmail);

    console.log(`[Sync] Complete. Synced ${threadsSynced} threads and ${emailsSynced} emails.`);

    return NextResponse.json({
      success: true,
      threadsSynced,
      emailsSynced,
      lastSyncTime: currentSyncTime,
    });
  } catch (err: any) {
    console.error('[Sync] Sync API exception:', err);
    return NextResponse.json({ error: err.message || 'Sync failed.' }, { status: 500 });
  }
}
