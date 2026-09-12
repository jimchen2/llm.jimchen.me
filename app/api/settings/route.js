// app/api/settings/route.js
import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { MODES, DEFAULT_MODE, normalizeMode } from '@/lib/modes';

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
        model: config.model ?? process.env.DEFAULT_MODEL ?? 'gemini-3.8-flash',
        mode: normalizeMode(config.mode),
        modes: MODES,
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
    const { model, mode } = body;

    // Save general settings persistently (mode only, not system prompts —
    // those live in the environment, never in Redis).
    await redis.set(
      'app_llm_settings',
      JSON.stringify({ model, mode: normalizeMode(mode || DEFAULT_MODE) })
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
