// app/api/settings/route.js
import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { DEFAULT_MODEL, normalizeMode } from '@/lib/constants';

// Development test runs are open: no access password required.
const IS_DEV = process.env.NODE_ENV !== 'production';

// The system prompt is no longer a user setting — it is fixed per conversation
// mode and lives in the environment (SYSTEM_PROMPT_TECH in .env). The API keys
// are also server-side environment variables (GEMINI_API_KEY_TECH / _RANDOM).
function isAuthorized(request) {
  if (IS_DEV) return true;

  const token = request.headers.get('x-db-token');
  const validToken = process.env.APP_PASSWORD || 'your-default-password';
  return token === validToken;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rawConfig = await redis.get('app_llm_settings');
    const config = rawConfig ? JSON.parse(rawConfig) : {};

    return NextResponse.json({
      settings: {
        model: config.model ?? DEFAULT_MODEL,
        // Default mode for NEW conversations (tech | random); each existing
        // conversation keeps its own stored mode.
        defaultMode: normalizeMode(config.defaultMode),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { model, defaultMode } = body;

    await redis.set(
      'app_llm_settings',
      JSON.stringify({ model: model || DEFAULT_MODEL, defaultMode: normalizeMode(defaultMode) })
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
