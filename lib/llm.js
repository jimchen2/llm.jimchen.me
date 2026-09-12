// lib/llm.js

import { DEFAULT_MODEL, MODE_RANDOM, normalizeMode } from '@/lib/constants';

const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// Non-production runs (`next dev`) are test runs: no API keys are needed and
// the LLM always answers with a fixed reply describing the current mode.
const IS_DEV = process.env.NODE_ENV !== 'production';

// Two separate Gemini API keys, one per mode, so each mode's usage is
// calculated and billed separately in the backend.
export function getApiKey(mode) {
  return normalizeMode(mode) === MODE_RANDOM
    ? process.env.GEMINI_API_KEY_RANDOM
    : process.env.GEMINI_API_KEY_TECH;
}

// The system prompt is set per conversation (by its mode) and never expires:
//   - tech mode   → always the SYSTEM_PROMPT_TECH prompt from the environment
//   - random mode → no system prompt at all
export function getSystemPrompt(mode) {
  if (normalizeMode(mode) === MODE_RANDOM) return null;
  const prompt = (process.env.SYSTEM_PROMPT_TECH || '').trim();
  return prompt || null;
}

async function callGemini({ apiKey, model, systemPrompt, messages, thinkingLevel, onChunk, onDone }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000); // 180s timeout

  try {
    // Map standard messages (role/content) to Gemini's format.
    // The system prompt is NOT part of contents — it goes into systemInstruction.
    const formattedMessages = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const payload = {
      contents: formattedMessages,
      generationConfig: {
        thinkingConfig: {
          thinkingLevel: thinkingLevel,
        },
      },
    };

    if (systemPrompt) {
      payload.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    // Use streamGenerateContent with ?alt=sse for easy chunk parsing
    const url = `${GEMINI_API_ENDPOINT}/${model}:streamGenerateContent?alt=sse`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`API Error: ${res.statusText}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');

    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter((line) => line.trim().startsWith('data: '));

      for (const line of lines) {
        const dataStr = line.replace('data: ', '').trim();
        if (dataStr === '[DONE]') continue;

        try {
          const data = JSON.parse(dataStr);
          const parts = data.candidates?.[0]?.content?.parts || [];

          for (const part of parts) {
            if (!part.text) continue;

            // Explicitly throw away any thoughts if they somehow get returned
            if (part.thought) continue;

            // Only process and stream the actual answer
            fullText += part.text;
            await onChunk(part.text);
          }
        } catch (e) { /* ignore parse errors for partial chunks */ }
      }
    }

    await onDone(fullText);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Fixed-reply LLM used for non-production test runs: no matter what the user
// asks, it replies with which mode the conversation is in.
async function callMockLLM({ mode, systemPrompt, onChunk, onDone }) {
  const isRandom = normalizeMode(mode) === MODE_RANDOM;

  const reply = isRandom
    ? '🎲 **Test run** — you are in **Mode 2 (Random)**.\n\nThis conversation has no system prompt at all, and it would be billed on the random-mode API key. Ask me anything!'
    : `🔧 **Test run** — you are in **Mode 1 (Tech)**.\n\nThis conversation runs with the tech system prompt${
        systemPrompt ? '' : ' (warning: `SYSTEM_PROMPT_TECH` is not set in `.env` — copy the `export` lines from `.env.example`)'
      }, and it would be billed on the tech-mode API key. Only math & CS questions, please!`;

  const tokens = reply.match(/\S+\s*/g) || [reply];
  let fullText = '';
  for (const token of tokens) {
    fullText += token;
    await onChunk(token);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await onDone(fullText);
}

export async function callLLM({
  apiKey,
  model = DEFAULT_MODEL,
  systemPrompt = null,
  mode,
  messages,
  thinkingLevel = 'low', // Accepts: 'minimal', 'low', 'medium', 'high'
  onChunk,
  onDone,
  onError,
}) {
  try {
    if (IS_DEV) {
      // Test run: no keys needed, the LLM returns a fixed reply.
      await callMockLLM({ mode, systemPrompt, onChunk, onDone });
      return;
    }

    if (!apiKey) {
      throw new Error(
        'Missing Gemini API key for this mode — set GEMINI_API_KEY_TECH / GEMINI_API_KEY_RANDOM in .env'
      );
    }

    await callGemini({ apiKey, model, systemPrompt, messages, thinkingLevel, onChunk, onDone });
  } catch (error) {
    await onError(error);
  }
}
