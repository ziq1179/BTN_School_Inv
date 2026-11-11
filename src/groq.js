// Minimal Groq client (OpenAI-compatible Chat Completions API).
// Returns null when GROQ_API_KEY is unset — AI endpoints then answer 503.
export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

export function groqEnabled() {
  return Boolean(process.env.GROQ_API_KEY);
}

export async function groqChat(messages, { temperature = 0.4, maxTokens = 1024 } = {}) {
  if (!groqEnabled()) {
    const err = new Error('AI features are not configured');
    err.status = 503;
    throw err;
  }
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`AI request failed (${res.status})`);
    err.status = 502;
    err.detail = text.slice(0, 500);
    throw err;
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || '';
}
