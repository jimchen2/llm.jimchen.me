// app/api/settings/route.js
import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

// Simple token authentication check against env or fixed key
function isAuthorized(request) {
  const token = request.headers.get('x-db-token');
  const validToken = process.env.DB_PASSWORD || 'your-default-password';
  return token === validToken;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const raw = await redis.get('app_llm_settings');
    const data = raw ? JSON.parse(raw) : null;
    return NextResponse.json({ settings: data });
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
    
    const payload = JSON.stringify({ apiKey, model, systemPrompt });
    await redis.set('app_llm_settings', payload);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
