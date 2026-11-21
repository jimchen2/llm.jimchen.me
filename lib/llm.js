// lib/llm.js

import { isTestMode } from './testMode';

// GEMINI_API_ENDPOINT can be overridden via env (useful for local testing/mocks).
const GEMINI_API_ENDPOINT =
  process.env.GEMINI_API_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta/models';

// Every mode uses the same model and the same API key.
// API_KEY is the documented name; GEMINI_API_KEY and the old per-mode name
// DEFAULT_MODE_API_KEY are still read so existing deployments keep working.
const API_KEY_ENV_NAMES = ['API_KEY', 'GEMINI_API_KEY', 'DEFAULT_MODE_API_KEY'];

export function resolveApiKey() {
  for (const name of API_KEY_ENV_NAMES) {
    const value = (process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

export async function callLLM({ 
  model = process.env.DEFAULT_MODEL || 'gemini-3.8-flash',
  messages, 
  thinkingLevel = 'low', // Accepts: 'minimal', 'low', 'medium', 'high'
  apiKey,
  onChunk, 
  onDone, 
  onError 
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000); // 180s timeout

  // An empty string must be treated as missing (a default parameter would not
  // catch it), so guard explicitly instead of sending a blank key to Google.
  const resolvedKey = (apiKey ?? resolveApiKey()).trim();
  if (!resolvedKey) {
    // In test mode there is no API key on purpose: stream a canned reply so the
    // preview exercises the real streaming UI (send button, SSE, markdown).
    if (isTestMode()) {
      clearTimeout(timeoutId);
      await streamDemoReply({ onChunk, onDone });
      return;
    }
    await onError(
      new Error(
        'No API key configured. Set API_KEY (GEMINI_API_KEY / DEFAULT_MODE_API_KEY are also accepted) in the environment.'
      )
    );
    clearTimeout(timeoutId);
    return;
  }

  try {
    // Map standard messages (role/content) to Gemini's format
    const formattedMessages = messages.map(m => ({
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

    // Use streamGenerateContent with ?alt=sse for easy chunk parsing
    const url = `${GEMINI_API_ENDPOINT}/${model}:streamGenerateContent?alt=sse`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': resolvedKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!res.ok) {
      // Google returns the real reason (missing/invalid key, model access,
      // quota, region) in the body. Without it the UI only shows "Forbidden".
      let detail = '';
      try {
        const body = await res.text();
        try {
          detail = JSON.parse(body)?.error?.message || body;
        } catch {
          detail = body;
        }
      } catch {
        /* ignore unreadable body */
      }
      throw new Error(
        `API Error: ${res.status} ${res.statusText || ''}`.trim() +
          (detail ? ` — ${detail}` : '')
      );
    }

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

// Test mode has no API key by design, so replies are canned. Streaming them
// word by word keeps the preview honest: the real SSE path, markdown rendering
// and message actions all run exactly as they do against Gemini.
const DEMO_REPLY =
  '### Test mode preview\n\n' +
  'No `API_KEY` is configured, so this is a canned reply streamed locally — the page, ' +
  'streaming, markdown and the message actions all behave normally.\n\n' +
  '**What to look at:**\n\n' +
  '- The sidebar samples (code, KaTeX math, Russian grammar, short mode)\n' +
  '- `Copy`, `Edit`, `Branch`, `Retry` and `Delete` on any message\n' +
  '- Inline math such as $e^{i\\pi} + 1 = 0$\n\n' +
  '```js\n' +
  'const answer = 6 * 7; // 42\n' +
  '```\n\n' +
  'Set a real `API_KEY` in `.env` to talk to Gemini instead.';

async function streamDemoReply({ onChunk, onDone }) {
  const chunks = DEMO_REPLY.match(/\S+\s*/g) || [DEMO_REPLY];
  let full = '';
  // Gemini takes a moment to produce the first token. Waiting here gives the
  // browser time to open its SSE stream, so no leading words are published
  // before anyone is subscribed.
  await new Promise((resolve) => setTimeout(resolve, 600));
  for (const chunk of chunks) {
    full += chunk;
    await onChunk(chunk);
    await new Promise((resolve) => setTimeout(resolve, 18));
  }
  await onDone(full);
}
