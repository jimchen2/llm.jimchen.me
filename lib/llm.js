// lib/llm.js

// GEMINI_API_ENDPOINT can be overridden via env (useful for local testing/mocks).
const GEMINI_API_ENDPOINT =
  process.env.GEMINI_API_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta/models';

export async function callLLM({ 
  model = process.env.DEFAULT_MODEL || 'gemini-3.8-flash',
  messages, 
  thinkingLevel = 'low', // Accepts: 'minimal', 'low', 'medium', 'high'
  apiKey = process.env.DEFAULT_MODE_API_KEY,
  mode,
  onChunk, 
  onDone, 
  onError 
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000); // 180s timeout

  // An empty string is NOT replaced by the default above (defaults only apply
  // to `undefined`), so guard explicitly and say which env var is missing.
  const resolvedKey = (apiKey || '').trim();
  if (!resolvedKey) {
    await onError(
      new Error(
        `No API key configured${mode ? ` for ${mode} mode` : ''}. ` +
          `Set ${mode ? `${mode.toUpperCase()}_MODE_API_KEY` : 'DEFAULT_MODE_API_KEY'} ` +
          '(or DEFAULT_MODE_API_KEY as a shared fallback) in the environment.'
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
