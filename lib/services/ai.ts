/**
 * Groq AI service — powers the real-time chat in the AI Assistant screen.
 *
 * Uses Groq's OpenAI-compatible Chat Completions endpoint. The API key comes
 * from EXPO_PUBLIC_GROQ_API_KEY (see .env.example). Because EXPO_PUBLIC_* vars
 * are inlined into the client bundle, ship a backend proxy for production so
 * the key is never exposed on-device.
 */

const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** Current Groq production model (131K context). */
const GROQ_MODEL = 'llama-3.3-70b-versatile';

/** True when a Groq key is present, so callers can fall back gracefully. */
export const isAiConfigured = Boolean(GROQ_API_KEY);

export type ChatRole = 'system' | 'user' | 'assistant';
export type ChatMessage = { role: ChatRole; content: string };

/** Default persona for the timetable/study-planner assistant. */
export const AI_SYSTEM_PROMPT =
  "You are the built-in AI assistant for an AI Timetable Planner study app. " +
  "Help the student plan their day, break tasks into steps, build balanced " +
  "study schedules and share practical study tips. Keep replies concise, " +
  "friendly and actionable. Respond in plain text without markdown headings.";

/**
 * Send a conversation to Groq and return the assistant's reply text.
 * Throws on network errors or non-2xx responses so the caller can show a
 * friendly fallback message.
 */
export async function chatWithGroq(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error('Groq API key is not configured (EXPO_PUBLIC_GROQ_API_KEY).');
  }

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    }),
    signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Groq request failed (${res.status}). ${detail}`.trim());
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error('Groq returned an empty response.');
  return reply;
}
