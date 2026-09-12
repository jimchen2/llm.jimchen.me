// lib/llm.js

import { DEFAULT_MODEL, isMockEnabled, MODES } from '@/lib/config';

const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fixed fake reply used for test runs (dev without API keys): it only tells you
// which mode the conversation is in.
function getMockReply(mode) {
  if (mode === MODES.RANDOM) {
    return "You are in **Mode 2 (Random)** — no system prompt, random-mode API key. *(fixed test reply)*";
  }
  return "You are in **Mode 1 (Tech)** — tech system prompt, tech-mode API key. *(fixed test reply)*";
}

// Streams a fixed reply word by word, mimicking the real LLM streaming path.
async function callMockLLM({ mode, onChunk, onDone, onError }) {
  try {
    const text = getMockReply(mode);
    const tokens = text.match(/\S+\s*/g) || [text];
    let fullText = '';
    for (const token of tokens) {
      await sleep(40);
      fullText += token;
      await onChunk(token);
    }
    await onDone(fullText);
  } catch (error) {
    await onError(error);
  }
}

export async function callLLM({
  apiKey,
  model = DEFAULT_MODEL,
  messages,
  systemPrompt = null, // null/undefined => no system prompt (random mode)
  thinkingLevel = 'low', // Accepts: 'minimal', 'low', 'medium', 'high'
  mode = MODES.TECH,
  onChunk,
  onDone,
  onError
}) {
  // Test run: no keys required outside production, just a fixed reply.
  if (isMockEnabled()) {
    await callMockLLM({ mode, onChunk, onDone, onError });
    return;
  }

  if (!apiKey) {
    await onError(new Error(`No API key configured for mode "${mode}" (set it in .env)`));
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000); // 180s timeout

  try {
    // Map standard messages (role/content) to Gemini's format.
    // System prompts are passed separately via systemInstruction, not as messages.
    const formattedMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

    const payload = {
      contents: formattedMessages,
      generationConfig: {
        thinkingConfig: {
          thinkingLevel: thinkingLevel
        }
      }
    };

    if (systemPrompt) {
      payload.systemInstruction = {
        parts: [{ text: systemPrompt }]
      };
    }

    // Use streamGenerateContent with ?alt=sse for easy chunk parsing
    const url = `${GEMINI_API_ENDPOINT}/${model}:streamGenerateContent?alt=sse`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!res.ok) throw new Error(`API Error: ${res.statusText}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');

    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));

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

    // Return just the final string, exactly like your original setup
    await onDone(fullText);
  } catch (error) {
    await onError(error);
  } finally {
    clearTimeout(timeoutId);
  }
}
