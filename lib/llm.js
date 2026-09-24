// lib/llm.js
// Optimized streaming parser: uses buffered SSE parsing without per-chunk split+filter
// allocations and avoids repeated string trim/replace.

const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function callLLM({ 
  model = process.env.DEFAULT_MODEL || 'gemini-3.8-flash',
  messages, 
  thinkingLevel = 'low',
  apiKey = process.env.DEFAULT_MODE_API_KEY,
  onChunk, 
  onDone, 
  onError 
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000);

  try {
    // Faster mapping: preallocate array, avoid creating intermediate objects where possible
    const formattedMessages = new Array(messages.length);
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      formattedMessages[i] = {
        role: m.role === 'assistant' ? 'model' : 'user', 
        parts: [{ text: m.content }]
      };
    }

    const payload = {
      contents: formattedMessages,
      generationConfig: {
        thinkingConfig: { thinkingLevel }
      }
    };

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
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // flush any remaining buffered line
        if (buffer.length > 0 && buffer.startsWith('data: ')) {
          const dataStr = buffer.slice(6).trim();
          if (dataStr && dataStr !== '[DONE]') {
            try {
              const data = JSON.parse(dataStr);
              const parts = data.candidates?.[0]?.content?.parts;
              if (parts) {
                for (let p = 0; p < parts.length; p++) {
                  const part = parts[p];
                  if (!part.text || part.thought) continue;
                  fullText += part.text;
                  await onChunk(part.text);
                }
              }
            } catch {}
          }
        }
        break;
      }
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Parse buffer line-by-line without split() allocation.
      // Process complete lines delimited by \n, keep incomplete tail in buffer.
      let nlIdx;
      let start = 0;
      while ((nlIdx = buffer.indexOf('\n', start)) !== -1) {
        const line = buffer.slice(start, nlIdx);
        start = nlIdx + 1;
        // Fast prefix check without trim: SSE lines are "data: {...}"
        if (line.length < 6 || line[0] !== 'd') continue;
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6).trim();
        if (!dataStr || dataStr === '[DONE]') continue;
        
        try {
          const data = JSON.parse(dataStr);
          const parts = data.candidates?.[0]?.content?.parts;
          if (!parts) continue;
          for (let p = 0; p < parts.length; p++) {
            const part = parts[p];
            if (!part.text || part.thought) continue;
            fullText += part.text;
            await onChunk(part.text);
          }
        } catch (e) { /* ignore parse errors for partial chunks */ }
      }
      // Keep unprocessed tail
      if (start > 0) {
        buffer = buffer.slice(start);
        // Guard against runaway buffer (shouldn't happen with SSE)
        if (buffer.length > 1_000_000) buffer = '';
      }
    }
    
    await onDone(fullText);
  } catch (error) {
    await onError(error);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Exported for testing/benchmarking: fast SSE chunk extractor
export function parseSSEChunkFast(buffer) {
  const payloads = [];
  let start = 0;
  let nlIdx;
  while ((nlIdx = buffer.indexOf('\n', start)) !== -1) {
    const line = buffer.slice(start, nlIdx);
    start = nlIdx + 1;
    if (line.length >= 6 && line.startsWith('data: ')) {
      const d = line.slice(6).trim();
      if (d && d !== '[DONE]') payloads.push(d);
    }
  }
  return { payloads, remainder: buffer.slice(start) };
}

export function parseSSEChunkNaive(chunk) {
  return chunk.split('\n').filter(line => line.trim().startsWith('data: ')).map(l => l.replace('data: ', '').trim()).filter(Boolean);
}
