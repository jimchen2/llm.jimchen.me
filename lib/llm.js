// lib/llm.js
//
// The only place that talks to Gemini. Everything mode related (which system
// prompt, which API key, which model) is resolved here, on the server, so the
// browser never sees a key and never has to know about modes/billing.

import { FALLBACK_MODEL, IS_DEV } from './config';
import { DEFAULT_MODE, MODES, normalizeMode } from './modes';
import { getSystemPrompt } from './prompts';
import { buildMockReply, streamMockReply } from './mock-llm';

const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export { FALLBACK_MODEL };
export const DEFAULT_MODEL = (process.env.GEMINI_MODEL || '').trim() || FALLBACK_MODEL;

/** The model for a mode: explicit override > mode specific env > global env. */
export function resolveModel(mode, override) {
  const normalized = normalizeMode(mode);
  const perMode = (process.env[MODES[normalized].modelEnv] || '').trim();
  return (override || '').trim() || perMode || DEFAULT_MODEL;
}

/**
 * The API key for a mode. Mode 1 and mode 2 use separate Gemini API keys so
 * usage/cost can be attributed (and billed) per mode on the backend.
 * `GEMINI_API_KEY` is an optional fallback for both.
 */
export function resolveApiKey(mode) {
  const normalized = normalizeMode(mode);
  const perMode = (process.env[MODES[normalized].apiKeyEnv] || '').trim();
  return perMode || (process.env.GEMINI_API_KEY || '').trim() || null;
}

/** True when this mode has no key configured: dev answers with a fixed mock. */
export function isModeMocked(mode) {
  const flag = (process.env.LLM_MOCK || '').trim().toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  // Without keys there is nothing to call: in development that is fine (mock),
  // in production it is a configuration error, surfaced as a normal error.
  return !resolveApiKey(mode);
}

/**
 * Runs one completion. `messages` never contains a system message: the system
 * prompt is injected here, straight from the environment, for the mode of the
 * conversation being answered.
 */
export async function callLLM({
  mode = DEFAULT_MODE,
  model,
  messages,
  thinkingLevel = 'low', // 'minimal' | 'low' | 'medium' | 'high'
  onChunk,
  onDone,
  onError,
}) {
  const normalizedMode = normalizeMode(mode);
  const resolvedModel = model || resolveModel(normalizedMode);
  const systemPrompt = getSystemPrompt(normalizedMode); // null in mode 2 => no prompt at all
  const apiKey = resolveApiKey(normalizedMode);

  try {
    if (isModeMocked(normalizedMode)) {
      if (!IS_DEV) {
        throw new Error(
          `No API key for mode "${normalizedMode}". Set ${MODES[normalizedMode].apiKeyEnv} (see .env.example).`
        );
      }
      await streamMockReply({
        mode: normalizedMode,
        model: resolvedModel,
        messages,
        systemPrompt,
        onChunk,
        onDone,
      });
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 180s timeout

    try {
      // Map standard messages (role/content) to Gemini's format.
      const formattedMessages = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));

      const payload = {
        contents: formattedMessages,
        generationConfig: {
          thinkingConfig: { thinkingLevel },
        },
      };

      // A mode with no system prompt simply does not send this field.
      if (systemPrompt) {
        payload.systemInstruction = { parts: [{ text: systemPrompt }] };
      }

      // Use streamGenerateContent with ?alt=sse for easy chunk parsing
      const url = `${GEMINI_API_ENDPOINT}/${resolvedModel}:streamGenerateContent?alt=sse`;

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
        const detail = await res.text().catch(() => '');
        throw new Error(`API Error: ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ''}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');

      let fullText = '';
      let usage = null;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE events can be split across network chunks: only parse complete lines.
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim().startsWith('data: ')) continue;
          const dataStr = line.replace('data: ', '').trim();
          if (dataStr === '[DONE]') continue;

          try {
            const data = JSON.parse(dataStr);
            if (data.usageMetadata) usage = data.usageMetadata;

            const parts = data.candidates?.[0]?.content?.parts || [];
            for (const part of parts) {
              if (!part.text) continue;
              if (part.thought) continue; // throw away any thoughts if they get returned
              fullText += part.text;
              await onChunk(part.text);
            }
          } catch {
            /* ignore parse errors for partial chunks */
          }
        }
      }

      await onDone(fullText, { mode: normalizedMode, model: resolvedModel, usage });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    await onError(error);
  }
}
