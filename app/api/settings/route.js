// app/api/settings/route.js
import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

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

    // Only the mode name is stored; system prompts and API keys come from the env.
    return NextResponse.json({
      settings: {
        model: config.model ?? process.env.DEFAULT_MODEL ?? 'gemini-3.8-flash',
        mode: config.mode === 'random' ? 'random' : 'default',
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

    // Do not persist prompts: a mode is resolved from the env on every request.
    await redis.set(
      'app_llm_settings',
      JSON.stringify({
        model,
        mode: mode === 'random' ? 'random' : 'default',
      })
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
