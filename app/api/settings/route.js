// app/api/settings/route.js
import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { DEFAULT_MODEL, GEMINI_API_KEY } from '@/lib/config';

function isAuthorized(request) {
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
        apiKey: config.apiKey ?? '',
        model: config.model ?? DEFAULT_MODEL,
        // Lets the client know it can skip entering a key (server env has one).
        hasServerApiKey: GEMINI_API_KEY !== '',
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
    const { apiKey, model } = body;

    // Save general settings persistently (system prompts now live in env).
    await redis.set('app_llm_settings', JSON.stringify({ apiKey, model }));

    // Hygiene: remove the legacy 3-minute temporary prompt key if it exists.
    await redis.del('app_llm_temp_system_prompt');

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
