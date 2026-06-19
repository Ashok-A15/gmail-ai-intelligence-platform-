import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { GoogleGenAI } from '@google/genai';
import { generateEmbedding } from '@/lib/ai';
import { deduplicateNewsletters } from '@/lib/dedup';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const userEmail = cookieStore.get('user_email')?.value;

    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { query, history = [] } = await request.json();

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is not configured.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // 1. Query Parsing: Ask Gemini to classify user intent and extract filters
    console.log(`[Chat Agent] Parsing query intent: "${query}"`);
    const parsingPrompt = `Analyze the user's email-related query and extract structured query filters.
Response format: JSON object only, with no markdown code blocks, no preamble, and no explanation.

JSON keys:
- "intent": "news_digest" | "sender_summary" | "category_query" | "general_rag"
- "senderQuery": string or null (extract search name if they ask about emails from a specific company, person, or sender, e.g. "Acme Corp", "Google", "Alice")
- "category": "Newsletters" | "Job / Recruitment" | "Finance" | "Notifications" | "Personal" | "Work / Professional" | null
- "timeframeDays": number or null (e.g. 4 if they say "past 4 days", 30 if "this month", null if general)
- "searchKeywords": array of strings (extract important search term keywords, e.g. ["Kubernetes", "data migration"])
- "isDeduplicationRequest": boolean (true if they specifically ask to list, summarize or digest tech news / newsletters with duplicates removed)

User Query: "${query}"`;

    let filters = {
      intent: 'general_rag',
      senderQuery: null,
      category: null,
      timeframeDays: null,
      searchKeywords: [],
      isDeduplicationRequest: false
    };

    try {
      const parseResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: parsingPrompt
      });

      const parsedText = parseResponse.text?.trim() || '{}';
      // Clean possible JSON markers
      const cleanedJson = parsedText.replace(/```json/g, '').replace(/```/g, '').trim();
      filters = JSON.parse(cleanedJson);
      console.log(`[Chat Agent] Parsed filters:`, filters);
    } catch (parseErr) {
      console.warn('[Chat Agent] Failed to parse query parameters, defaulting to general RAG:', parseErr);
    }

    let answerText = '';
    const sources: Array<{ thread_id: string; subject: string; sender: string; date: string }> = [];

    // 2. Route Execution based on intent
    
    // Case 1: Newsletter news digest / deduplication request
    if (filters.intent === 'news_digest' || filters.isDeduplicationRequest || (filters.category === 'Newsletters' && query.toLowerCase().includes('news'))) {
      const days = filters.timeframeDays || 4; // Default to past 4 days
      const dateCutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      console.log(`[Chat Agent] Executing newsletter digest for past ${days} days...`);
      
      const { data: newsletterEmails, error: dbErr } = await supabase
        .from('emails')
        .select('id, subject, from_name, from_email, body_text, date')
        .eq('user_id', userEmail)
        .eq('category', 'Newsletters')
        .gte('date', dateCutoff);

      if (dbErr) throw dbErr;

      if (!newsletterEmails || newsletterEmails.length === 0) {
        answerText = `No newsletter emails were found in your inbox from the past ${days} days.`;
      } else {
        // Collect sources
        newsletterEmails.forEach(e => {
          sources.push({
            thread_id: e.id, // Direct message link fallback
            subject: e.subject,
            sender: e.from_name || e.from_email,
            date: new Date(e.date).toLocaleDateString()
          });
        });

        // Run deduplication
        answerText = await deduplicateNewsletters(newsletterEmails);
      }
    } 
    // Case 2: Specific Sender Summary
    else if (filters.intent === 'sender_summary' && filters.senderQuery) {
      console.log(`[Chat Agent] Summarizing emails from sender: ${filters.senderQuery}`);
      
      const { data: senderEmails, error: dbErr } = await supabase
        .from('emails')
        .select('id, thread_id, subject, from_name, from_email, summary, date')
        .eq('user_id', userEmail)
        .or(`from_name.ilike.%${filters.senderQuery}%,from_email.ilike.%${filters.senderQuery}%`)
        .order('date', { ascending: false })
        .limit(15);

      if (dbErr) throw dbErr;

      if (!senderEmails || senderEmails.length === 0) {
        answerText = `I couldn't find any emails from "${filters.senderQuery}" in your database.`;
      } else {
        senderEmails.forEach(e => {
          if (!sources.some(s => s.thread_id === e.thread_id)) {
            sources.push({
              thread_id: e.thread_id,
              subject: e.subject,
              sender: e.from_name || e.from_email,
              date: new Date(e.date).toLocaleDateString()
            });
          }
        });

        const compiledEmails = senderEmails
          .map(e => `- Date: ${new Date(e.date).toLocaleDateString()}\n  From: ${e.from_name} <${e.from_email}>\n  Subject: ${e.subject}\n  Summary: ${e.summary}`)
          .join('\n\n');

        const synthesisPrompt = `You are a helpful AI email assistant. Summarize the following emails from "${filters.senderQuery}" for the user. 
Synthesize the key topics discussed, any open requests, decisions, and deadlines. State clearly the dates and subjects of the emails.
Do not hallucinate. Use only the provided emails context.

Emails from "${filters.senderQuery}":
"""
${compiledEmails}
"""`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: synthesisPrompt
        });

        answerText = response.text || 'Sponsorship compilation failed.';
      }
    }
    // Case 3: Category Query
    else if (filters.intent === 'category_query' && filters.category) {
      console.log(`[Chat Agent] Querying emails in category: ${filters.category}`);
      
      const { data: categoryEmails, error: dbErr } = await supabase
        .from('emails')
        .select('id, thread_id, subject, from_name, from_email, summary, date')
        .eq('user_id', userEmail)
        .eq('category', filters.category)
        .order('date', { ascending: false })
        .limit(15);

      if (dbErr) throw dbErr;

      if (!categoryEmails || categoryEmails.length === 0) {
        answerText = `I couldn't find any emails labeled under the "${filters.category}" category.`;
      } else {
        categoryEmails.forEach(e => {
          if (!sources.some(s => s.thread_id === e.thread_id)) {
            sources.push({
              thread_id: e.thread_id,
              subject: e.subject,
              sender: e.from_name || e.from_email,
              date: new Date(e.date).toLocaleDateString()
            });
          }
        });

        const compiledEmails = categoryEmails
          .map(e => `- Date: ${new Date(e.date).toLocaleDateString()}\n  From: ${e.from_name} <${e.from_email}>\n  Subject: ${e.subject}\n  Summary: ${e.summary}`)
          .join('\n\n');

        const synthesisPrompt = `You are a helpful AI email assistant. Answer the user's query based on these emails from their "${filters.category}" category.
Be objective and base your answer strictly on the email summaries. If the information isn't here, explain that clearly.

Category Emails:
"""
${compiledEmails}
"""

User Query: "${query}"`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: synthesisPrompt
        });

        answerText = response.text || 'Category synthesis failed.';
      }
    }
    // Case 4: General RAG search (Default)
    else {
      console.log(`[Chat Agent] Performing general RAG vector search for: "${query}"`);
      
      // Generate query embedding
      const queryVector = await generateEmbedding(query);

      // Search Supabase embeddings table
      const { data: ragResults, error: rpcErr } = await supabase.rpc('match_email_embeddings', {
        query_embedding: queryVector,
        match_threshold: 0.2, // Low threshold to get relevant context
        match_count: 8,
        p_user_id: userEmail
      });

      if (rpcErr) throw rpcErr;

      console.log(`[Chat Agent] Found ${ragResults?.length || 0} matching semantic chunks.`);

      if (!ragResults || ragResults.length === 0) {
        // Fallback: Fetch latest 5 threads as context
        const { data: recentThreads } = await supabase
          .from('threads')
          .select('id, subject, summary, last_updated_at')
          .eq('user_id', userEmail)
          .order('last_updated_at', { ascending: false })
          .limit(5);

        const recentContext = recentThreads
          ? recentThreads.map(t => `- Thread Subject: ${t.subject}\n  Summary: ${t.summary}`).join('\n')
          : 'None';

        answerText = `I couldn't find any specific emails semantically matching your question. Here is a summary of your recent inbox threads just in case:\n\n${recentContext}\n\nCould you rephrase your question or provide more details?`;
      } else {
        // Fetch full email details for RAG matches to display accurate sources
        const matchedEmailIds = ragResults.map((r: any) => r.email_id);
        const { data: matchedEmails } = await supabase
          .from('emails')
          .select('id, thread_id, subject, from_name, from_email, date')
          .in('id', matchedEmailIds);

        matchedEmails?.forEach(e => {
          if (!sources.some(s => s.thread_id === e.thread_id)) {
            sources.push({
              thread_id: e.thread_id,
              subject: e.subject,
              sender: e.from_name || e.from_email,
              date: new Date(e.date).toLocaleDateString()
            });
          }
        });

        // Compile RAG context
        const contextText = ragResults
          .map((r: any, idx: number) => {
            const emailInfo = matchedEmails?.find(e => e.id === r.email_id);
            const sourceStr = emailInfo 
              ? `From: ${emailInfo.from_name} <${emailInfo.from_email}>, Subject: ${emailInfo.subject}, Date: ${new Date(emailInfo.date).toLocaleDateString()}`
              : 'Unknown';
            return `--- Context Chunk #${idx + 1} (${sourceStr}) ---\n${r.chunk_text}`;
          })
          .join('\n\n');

        // Compile conversation history
        const formattedHistory = history
          .map((h: any) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`)
          .join('\n');

        const ragPrompt = `You are a knowledgeable AI assistant. You have read all of the user's emails.
Answer the user's query based ONLY on the provided email context chunks.
Do not hallucinate. If the answer is not present in the context, say "I couldn't find any information about that in your emails." and do not speculate.
Maintain source clarity: when discussing facts from an email, attribute them clearly to the sender, date, or subject.

Provided Email Context Chunks:
"""
${contextText}
"""

Ongoing Conversation History:
${formattedHistory}

User Query: "${query}"`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: ragPrompt
        });

        answerText = response.text || 'RAG response compilation failed.';
      }
    }

    return NextResponse.json({
      success: true,
      text: answerText,
      sources,
    });
  } catch (err: any) {
    console.error('Chat API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
