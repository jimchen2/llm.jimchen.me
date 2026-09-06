// app/api/settings/route.js
import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const DEFAULT_SYSTEM_PROMPT =
  "You are a technical/research assistant. Only answer questions related to math and cs. Be concise, do not make assumptions, and do not answer any off-topic queries.";

export const VALID_THINKING_LEVELS = ['minimal', 'low', 'medium', 'high'];
export const DEFAULT_MODEL = 'gemini-3.7-flash';

// Fail closed: auth is only possible when APP_PASSWORD is configured.
function isAuthorized(request) {
  const validToken = process.env.APP_PASSWORD;
  if (!validToken) return false;
  return request.headers.get('x-db-token') === validToken;
}

function unauthorized() {
  return NextResponse.json(
    { error: 'Unauthorized' },
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  );
}

export async function GET(request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const rawConfig = await redis.get('app_llm_settings');
    const config = rawConfig ? JSON.parse(rawConfig) : {};

    // A temporary system prompt may override the saved one (useful for short-lived experiments).
    const customPrompt = await redis.get('app_llm_temp_system_prompt');

    return NextResponse.json({
      settings: {
        apiKey: config.apiKey ?? '',
        model: config.model ?? DEFAULT_MODEL,
        thinkingLevel: VALID_THINKING_LEVELS.includes(config.thinkingLevel)
          ? config.thinkingLevel
          : 'low',
        systemPrompt: customPrompt ?? config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const body = await request.json();
    const {
      apiKey,
      model,
      systemPrompt,
      thinkingLevel = 'low',
    } = body;

    // 1. Save general settings persistently (prompt and thinking level included)
    await redis.set(
      'app_llm_settings',
      JSON.stringify({
        apiKey: apiKey ?? '',
        model: model || DEFAULT_MODEL,
        thinkingLevel: VALID_THINKING_LEVELS.includes(thinkingLevel) ? thinkingLevel : 'low',
        systemPrompt:
          systemPrompt && systemPrompt.trim() !== ''
            ? systemPrompt.trim()
            : DEFAULT_SYSTEM_PROMPT,
      })
    );

    // 2. Keep the 3-minute temporary prompt mechanism working:
    //    saving a custom prompt also stages it as the active prompt for 3 minutes.
    if (systemPrompt && systemPrompt.trim() !== '' && systemPrompt.trim() !== DEFAULT_SYSTEM_PROMPT) {
      await redis.set('app_llm_temp_system_prompt', systemPrompt.trim(), 'EX', 180);
    } else {
      await redis.del('app_llm_temp_system_prompt');
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
