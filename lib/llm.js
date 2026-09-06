// lib/llm.js

// Overridable so self-hosted proxies (or tests) can point elsewhere.
const GEMINI_API_ENDPOINT =
  process.env.GEMINI_API_ENDPOINT ||
  'https://generativelanguage.googleapis.com/v1beta/models';

// Match the README's 120s timeout; override with LLM_TIMEOUT_MS if needed.
const DEFAULT_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '120000', 10);

export async function callLLM({
  apiKey,
  model = 'gemini-3.7-flash',
  messages,
  thinkingLevel = 'low', // Accepts: 'minimal', 'low', 'medium', 'high'
  onChunk,
  onDone,
  onError,
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    // Gemini wants the system prompt as a top-level field, not inside contents.
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    const formattedMessages = conversationMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const payload = {
      contents: formattedMessages,
      ...(systemMessage
        ? { systemInstruction: { parts: [{ text: systemMessage.content }] } }
        : {}),
      generationConfig: {
        thinkingConfig: { thinkingLevel },
      },
    };

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

    if (!res.ok) {
      let detail = '';
      try {
        const errBody = await res.json();
        detail = errBody?.error?.message || JSON.stringify(errBody);
      } catch {
        /* no body */
      }
      throw new Error(`API Error ${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');

    let fullText = '';
    // SSE lines can be split across network chunks, so we buffer instead of
    // splitting every chunk independently (the old code dropped partial lines).
    let buffer = '';

    const processLine = async (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return;
      const dataStr = trimmed.slice(5).trim();
      if (!dataStr || dataStr === '[DONE]') return;

      try {
        const data = JSON.parse(dataStr);
        const parts = data.candidates?.[0]?.content?.parts || [];

        for (const part of parts) {
          if (!part.text) continue;
          // Explicitly throw away any thoughts if they somehow get returned
          if (part.thought) continue;

          fullText += part.text;
          await onChunk?.(part.text);
        }
      } catch (e) {
        // A partial line can still slip through if the stream ends mid-line;
        // log it but keep going so the rest of the answer is not lost.
        console.warn('llm: skipped unparsable SSE line:', e.message);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // keep the incomplete tail for the next read
      for (const line of lines) await processLine(line);
    }
    if (buffer) await processLine(buffer);

    await onDone?.(fullText);
  } catch (error) {
    await onError?.(error instanceof Error ? error : new Error(String(error)));
  } finally {
    clearTimeout(timeoutId);
  }
}
