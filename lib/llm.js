export async function callLLM({ apiBase, apiKey, model, messages, onChunk, onDone, onError }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout

  try {
    const res = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true
      }),
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
          const content = data.choices[0]?.delta?.content;
          if (content) {
            fullText += content;
            await onChunk(content);
          }
        } catch (e) { /* ignore parse errors for partial chunks */ }
      }
    }
    await onDone(fullText);
  } catch (error) {
    await onError(error);
  } finally {
    clearTimeout(timeoutId);
  }
}