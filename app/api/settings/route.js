// app/api/settings/route.js
import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { MODES, DEFAULT_MODE, normalizeMode, isDesktopOnlyMode } from '@/lib/modes';
import { allowsRandomMode } from '@/lib/desktopGate';
import { isTestMode } from '@/lib/testMode';

function isAuthorized(request) {
  // Test mode (TEST_MODE=true) needs no password.
  if (isTestMode()) return true;
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
    const resolvedMode = normalizeMode(mode || DEFAULT_MODE);

    // Random mode is desktop-only (see lib/desktopGate.js): a request from a
    // phone, or one without the desktop-only Mode dropdown header, is not
    // allowed to make it the saved mode.
    if (isDesktopOnlyMode(resolvedMode) && !allowsRandomMode(request)) {
      return NextResponse.json({ error: 'random_mode_desktop_only' }, { status: 403 });
    }

    // Save general settings persistently (mode only, not system prompts —
    // those live in the environment, never in Redis).
    await redis.set(
      'app_llm_settings',
      JSON.stringify({ model, mode: resolvedMode })
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
