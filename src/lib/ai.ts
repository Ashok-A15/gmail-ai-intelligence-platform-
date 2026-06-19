import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

// Helper to get Google Gemini Client
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Please set it in the configuration.');
  }
  return new GoogleGenAI({ apiKey });
}

// Helper to get NVIDIA NIM Client
function getNvidiaClient() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: apiKey,
  });
}

/**
 * Generates vector embeddings for a given text chunk using Gemini's text-embedding-004.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const ai = getGeminiClient();
    const response = await ai.models.embedContent({
      model: 'gemini-embedding-2',
      contents: text,
      config: {
        outputDimensionality: 768,
      }
    });
    const embedding = response.embeddings?.[0]?.values;
    if (!embedding) {
      throw new Error('No embedding returned from Gemini API.');
    }
    return embedding;
  } catch (error: any) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Generates a concise summary for a single email body.
 */
export async function summarizeEmail(body: string): Promise<string> {
  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are an expert email assistant. Summarize the following email content in 2-3 sentences. Capture the key sender details, requests, actions, and dates if any. Do not include signature information.
      
Email Content:
"""
${body.slice(0, 10000)}
"""`,
    });
    return response.text?.trim() || 'Summary generation failed.';
  } catch (error: any) {
    console.error('Error summarizing email:', error);
    return 'Failed to generate summary.';
  }
}

/**
 * Generates a thread-level summary that captures the full conversation flow.
 */
export async function summarizeThread(threadContentText: string): Promise<string> {
  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are an expert email assistant. Generate a summary of the following email thread. 
Explain the overall conversation arc: who started the conversation, what was discussed, what decisions were made, and any pending action items or deadlines. Keep it concise but comprehensive (max 100-150 words).

Email Thread:
"""
${threadContentText.slice(0, 20000)}
"""`,
    });
    return response.text?.trim() || 'Thread summary generation failed.';
  } catch (error: any) {
    console.error('Error summarizing thread:', error);
    return 'Failed to generate thread summary.';
  }
}

/**
 * Categorizes an email using NVIDIA NIM (with Gemini fallback).
 * Supported categories: Newsletters, Job / Recruitment, Finance, Notifications, Personal, Work / Professional.
 */
export async function categorizeEmail(
  from: string,
  subject: string,
  snippet: string,
  bodyText: string
): Promise<string> {
  const systemPrompt = `You are an automated email classifier. Categorize the given email into exactly ONE of the following categories:
- Newsletters (newsletters, blogs, digests, subscriptions, articles, tech updates, industry news)
- Job / Recruitment (job applications, screening, interview invites, rejections, job offers, hiring updates)
- Finance (bank statements, receipts, invoices, billing alerts, payment confirmation, subscription charges)
- Notifications (OTPs, password resets, system alerts, updates from Github/Jira, social notifications, calendar invites)
- Personal (direct human-to-human communication from personal contacts, non-work personal chats)
- Work / Professional (work project discussions, professional communication, business inquiries, client emails)

Response instructions:
- Output only the category name: "Newsletters", "Job / Recruitment", "Finance", "Notifications", "Personal", or "Work / Professional".
- Do not output explanations, markdown formatting, or preamble. Just the exact category string.`;

  const emailInfo = `From: ${from}\nSubject: ${subject}\nSnippet: ${snippet}\nBody: ${bodyText.slice(0, 3000)}`;

  // Try NVIDIA NIM
  const openai = getNvidiaClient();
  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: 'meta/llama-3.1-8b-instruct',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: emailInfo }
        ],
        temperature: 0.1,
        max_tokens: 20
      });
      const category = response.choices[0].message.content?.trim();
      if (category && isValidCategory(category)) {
        return category;
      }
    } catch (err) {
      console.warn('NVIDIA NIM categorization failed, falling back to Gemini:', err);
    }
  }

  // Fallback to Gemini
  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `${systemPrompt}\n\nEmail to classify:\n${emailInfo}`,
    });
    const category = response.text?.trim();
    if (category && isValidCategory(category)) {
      return category;
    }
    // Clean up category if model returned markdown
    const cleaned = cleanCategoryResponse(category || '');
    if (isValidCategory(cleaned)) return cleaned;
  } catch (error) {
    console.error('Gemini categorization fallback failed:', error);
  }

  return 'Work / Professional'; // Default fallback
}

function isValidCategory(cat: string): boolean {
  const valid = ['Newsletters', 'Job / Recruitment', 'Finance', 'Notifications', 'Personal', 'Work / Professional'];
  return valid.includes(cat);
}

function cleanCategoryResponse(response: string): string {
  const normalized = response.toLowerCase().replace(/[^a-z\s\/]/g, '').trim();
  if (normalized.includes('newsletter')) return 'Newsletters';
  if (normalized.includes('job') || normalized.includes('recruit')) return 'Job / Recruitment';
  if (normalized.includes('finance') || normalized.includes('pay') || normalized.includes('invoice')) return 'Finance';
  if (normalized.includes('notification') || normalized.includes('otp') || normalized.includes('alert')) return 'Notifications';
  if (normalized.includes('personal')) return 'Personal';
  if (normalized.includes('work') || normalized.includes('professional')) return 'Work / Professional';
  return '';
}

/**
 * Drafts a new email from a user natural language prompt.
 */
export async function draftEmail(prompt: string, context?: string): Promise<string> {
  try {
    const ai = getGeminiClient();
    const contents = `You are a professional email assistant. Draft a complete, professional, ready-to-send email based on the following user prompt.
${context ? `Use this context if relevant to the request: """${context}"""` : ''}

Prompt: "${prompt}"

Draft instructions:
- Provide a suitable, catchy Subject line at the beginning in format "Subject: [Subject text]"
- Write a professional, polite, and clear email body.
- Use placeholders like "[Your Name]" where personal information is required.
- Do not output any markdown formatting, headers, blockquotes or side notes. Output only:
Subject: [Subject]
[Body text]`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents
    });
    return response.text?.trim() || 'Failed to generate email draft.';
  } catch (error: any) {
    console.error('Error drafting email:', error);
    throw error;
  }
}

/**
 * Drafts a context-aware reply to an existing email thread.
 */
export async function draftReply(
  threadEmails: Array<{ from_name: string; from_email: string; subject: string; body_text: string; date: string }>,
  prompt: string
): Promise<string> {
  try {
    const ai = getGeminiClient();
    
    // Format thread context
    const formattedThread = threadEmails
      .map((m, idx) => `--- Message #${idx + 1} (${m.date}) ---\nFrom: ${m.from_name} <${m.from_email}>\nSubject: ${m.subject}\n\n${m.body_text}`)
      .join('\n\n');

    const contents = `You are a professional email assistant. Draft a reply to the following email thread based on the user's short prompt. 
You must take into account the entire history of the thread to ensure the reply matches the tone, style, and facts discussed.

Email Thread History:
"""
${formattedThread.slice(0, 15000)}
"""

User reply prompt: "${prompt}"

Draft instructions:
- Respond in a professional and helpful tone.
- Do not add "Subject: Re: ..." line. Write only the reply body.
- Sign off using a standard template placeholder.
- Output ONLY the raw text body of the reply. Do not include markdown, comments, or annotations.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents
    });
    return response.text?.trim() || 'Failed to generate reply draft.';
  } catch (error: any) {
    console.error('Error drafting reply:', error);
    throw error;
  }
}
