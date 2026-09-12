// app/api/settings/route.js
// Only stores the default model. API keys and system prompts live in env vars
// (see .env.example) and are resolved per mode in the backend.
import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { DEFAULT_MODEL } from '@/lib/config';

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
        model: config.model ?? DEFAULT_MODEL,
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
    const { model } = body;

    await redis.set('app_llm_settings', JSON.stringify({ model }));

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
