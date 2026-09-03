// app/api/settings/route.js
import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const DEFAULT_SYSTEM_PROMPT =
  "You are a technical/research assistant. Only answer questions related to math and cs. Be concise, do not make assumptions, and do not answer any off-topic queries.";

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

    // Check if custom prompt is still alive in Redis (expires after 3 minutes)
    const customPrompt = await redis.get('app_llm_temp_system_prompt');

    return NextResponse.json({
      settings: {
        apiKey: config.apiKey ?? '',
        model: config.model ?? 'gemini-3.7-flash',
        systemPrompt: customPrompt !== null ? customPrompt : DEFAULT_SYSTEM_PROMPT,
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
    const { apiKey, model, systemPrompt } = body;

    // 1. Save general settings persistently
    await redis.set('app_llm_settings', JSON.stringify({ apiKey, model }));

    // 2. Handle 3-minute temporary system prompt
    if (systemPrompt && systemPrompt.trim() !== '' && systemPrompt.trim() !== DEFAULT_SYSTEM_PROMPT) {
      // Set key with 180 seconds (3 minutes) TTL
      await redis.setex('app_llm_temp_system_prompt', 180, systemPrompt.trim());
    } else {
      // If cleared or reset to default, delete the temporary key immediately
      await redis.del('app_llm_temp_system_prompt');
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
