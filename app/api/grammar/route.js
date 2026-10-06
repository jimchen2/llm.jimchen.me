// app/api/grammar/route.js
//
// POST /api/grammar  { text, model? }
//
// Single-shot (non-streaming) grammar check used by /grammar. It reuses the
// same pieces as the chat endpoints — the mode API key from lib/modes, the
// LLM caller from lib/llm and Redis for a shared cache — so the /grammar page
// authenticates with the exact same frontend secret as the chat page.
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { redis, CACHE_TTL_SECONDS } from '@/lib/redis';
import { callLLM } from '@/lib/llm';
import { getModeConfig } from '@/lib/modes';
import {
  GRAMMAR_SYSTEM_PROMPT,
  GRAMMAR_MAX_CHARS,
  normalizeModelOutput,
} from '@/lib/grammar';

// Same rule as /api/settings so a session that can open the chat page can
// always use the grammar page (and vice versa).
function isAuthorized(req) {
  const token = req.headers.get('x-db-token') || req.nextUrl.searchParams.get('dbToken');
  const validToken = process.env.APP_PASSWORD || 'your-default-password';
  return token === validToken;
}

// Redis is only a cache: if it is slow or down, the check must not wait for it.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('cache timeout')), ms).unref?.()
    ),
  ]);
}

function cacheKey(text, model) {
  const hash = createHash('sha256').update(`${model}\u0000${text}`).digest('hex');
  return `grammar:v1:${hash}`;
}

export async function POST(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: 'Unauthorized. Check your access password.' },
      { status: 401 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json({ error: 'Missing "text"' }, { status: 400 });
  }
  if (text.length > GRAMMAR_MAX_CHARS) {
    return NextResponse.json(
      { error: `Text too long (${text.length} > ${GRAMMAR_MAX_CHARS} chars)` },
      { status: 413 }
    );
  }

  const { apiKey: modeKey } = getModeConfig('default');
  const apiKey = (process.env.GRAMMAR_MODE_API_KEY || '').trim() || modeKey;
  const model =
    (typeof body?.model === 'string' && body.model.trim()) ||
    (process.env.GRAMMAR_MODEL || '').trim() ||
    process.env.DEFAULT_MODEL ||
    'gemini-3.8-flash';

  // 1. Shared cache: the same text (and model) is never checked twice, even
  //    across page reloads or devices.
  const key = cacheKey(text, model);
  try {
    const hit = await withTimeout(redis.get(key), 1500);
    if (hit) {
      const parsed = JSON.parse(hit);
      if (typeof parsed?.corrected === 'string') {
        return NextResponse.json({
          corrected: parsed.corrected,
          model,
          cached: true,
        });
      }
    }
  } catch (err) {
    // Redis is a nice-to-have here — never block a check on it.
    console.warn('[grammar] cache read failed:', err.message);
  }

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'No API key configured (set GRAMMAR_MODE_API_KEY or DEFAULT_MODE_API_KEY).',
      },
      { status: 500 }
    );
  }

  // 2. Single, non-streaming call. The prompt goes in as the first (only)
  //    user turn so the model cannot confuse it with text to correct.
  let corrected = '';
  let failure = null;

  await callLLM({
    model,
    apiKey,
    thinkingLevel: 'low',
    messages: [
      {
        role: 'user',
        content: `${GRAMMAR_SYSTEM_PROMPT}\n\n---\n\nТекст:\n${text}`,
      },
    ],
    onChunk: () => {},
    onDone: (fullText) => {
      corrected = normalizeModelOutput(fullText);
    },
    onError: (err) => {
      failure = err;
    },
  });

  if (failure) {
    return NextResponse.json(
      { error: failure.message || 'LLM request failed' },
      { status: 502 }
    );
  }
  if (!corrected) {
    return NextResponse.json({ error: 'Empty response from model' }, { status: 502 });
  }

  // 3. Best-effort cache write — never awaited, so a slow Redis cannot delay
  //    the answer the user is waiting for.
  Promise.resolve()
    .then(() => redis.set(key, JSON.stringify({ corrected }), 'EX', CACHE_TTL_SECONDS))
    .catch((err) => console.warn('[grammar] cache write failed:', err.message));

  return NextResponse.json({ corrected, model, cached: false });
}

// A single check is well under this, but the LLM caller has a 180s budget.
export const maxDuration = 180;
