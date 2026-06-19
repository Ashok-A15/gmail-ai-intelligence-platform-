import { GoogleGenAI } from '@google/genai';

export async function deduplicateNewsletters(
  emails: Array<{ id: string; subject: string; from_name: string; body_text: string; date: string }>
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key is required for deduplication');
  }

  const ai = new GoogleGenAI({ apiKey });

  // 1. Group emails by subject / sender to show source variety
  const emailSources = emails.map(e => ({
    id: e.id,
    source: e.from_name || e.subject,
    date: e.date,
    contentSnippet: e.body_text.slice(0, 3000) // Truncate to fit context constraints
  }));

  // 2. Draft the extraction and clustering prompt for Gemini
  const prompt = `You are a news curator and semantic deduplication expert. I am providing you with a list of newsletter emails received recently. 
Your task is to:
1. Extract the main news items, articles, stories, or announcements from these newsletter contents.
2. Identify which stories are duplicates or discuss the exact same news event (e.g., "NVIDIA launches Llama NIM" in TLDR and "NVIDIA's new LLM microservices" in Import AI).
3. Cluster and merge these duplicate items.
4. Synthesize a single clean digest where each unique news story is listed only once.
5. For each story, provide:
   - A bold, clear headline
   - A 1-2 sentence summary of what happened
   - A "Sources" attribution listing which newsletters reported it. Use the newsletter name (e.g., TLDR, Import AI) or subject as attribution.

Here are the newsletter email snippets:
${JSON.stringify(emailSources, null, 2)}

Format the final output as a clean, modern Markdown list with sections. If there are no news items found, output: "No news stories could be extracted from the newsletters."`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    return response.text?.trim() || 'Newsletter deduplication returned no results.';
  } catch (error: any) {
    console.error('[Dedup] Error during newsletter deduplication:', error);
    throw error;
  }
}
