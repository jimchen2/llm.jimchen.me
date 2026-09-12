// app/api/settings/route.js
//
// Per-user settings only. API keys and system prompts are *not* settable from
// the browser anymore: they live in the server environment (see .env.example)
// and are resolved per mode in lib/llm.js / lib/prompts.js.

import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { DEFAULT_MODEL, isModeMocked, resolveModel } from '@/lib/llm';
import { DEFAULT_MODE, MODE_LIST, normalizeMode } from '@/lib/modes';
import { hasSystemPrompt } from '@/lib/prompts';
import { IS_DEV } from '@/lib/config';
import { isAuthorized, unauthorized } from '@/lib/auth';

function describeModes() {
  return MODE_LIST.map((mode) => ({
    id: mode.id,
    number: mode.number,
    label: mode.label,
    icon: mode.icon,
    hint: mode.hint,
    model: resolveModel(mode.id),
    apiKeyEnv: mode.apiKeyEnv,
    systemPromptEnv: mode.id === 'random' ? 'SYSTEM_PROMPT_RANDOM' : 'SYSTEM_PROMPT_TECH',
    hasSystemPrompt: hasSystemPrompt(mode.id),
    mocked: isModeMocked(mode.id),
  }));
}

export async function GET(request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const rawConfig = await redis.get('app_llm_settings');
    const config = rawConfig ? JSON.parse(rawConfig) : {};

    return NextResponse.json({
      settings: {
        // Optional: force one model for both modes (empty = use the .env default).
        modelOverride: config.modelOverride ?? '',
        defaultModel: DEFAULT_MODEL,
        defaultMode: normalizeMode(config.defaultMode || DEFAULT_MODE),
        modes: describeModes(),
        devMode: IS_DEV,
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
    const { modelOverride } = body;

    await redis.set('app_llm_settings', JSON.stringify({ modelOverride: (modelOverride || '').trim() }));

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
