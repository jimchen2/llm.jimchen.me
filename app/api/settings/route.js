// app/api/settings/route.js
import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { MODES, DEFAULT_MODE, normalizeMode, getModeEnvDefaults } from '@/lib/modes';

const SETTINGS_KEY = 'app_llm_settings';

function isAuthorized(request) {
  const token = request.headers.get('x-db-token');
  const validToken = process.env.APP_PASSWORD || 'your-default-password';
  return token === validToken;
}

async function readConfig() {
  const raw = await redis.get(SETTINGS_KEY);
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Merge stored config with env defaults. Stored values win, including an
// explicitly empty system prompt (empty prompt is a valid configuration).
function buildModes(config) {
  const stored = config.modes || {};
  const modes = {};
  for (const mode of MODES) {
    const envDefaults = getModeEnvDefaults(mode);
    const saved = stored[mode] || {};
    modes[mode] = {
      apiKey: saved.apiKey ?? envDefaults.apiKey,
      model: saved.model || envDefaults.model,
      systemPrompt: saved.systemPrompt ?? envDefaults.systemPrompt,
    };
  }
  return modes;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const config = await readConfig();
    const modes = buildModes(config);
    const activeMode = normalizeMode(config.activeMode || DEFAULT_MODE);

    return NextResponse.json({
      settings: {
        activeMode,
        modes,
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
    const config = await readConfig();
    const current = buildModes(config);

    const incoming = body.modes || {};
    const modes = {};
    for (const mode of MODES) {
      const patch = incoming[mode] || {};
      modes[mode] = {
        apiKey: patch.apiKey ?? current[mode].apiKey,
        model: patch.model ?? current[mode].model,
        // Empty string is meaningful: no system prompt for this mode.
        systemPrompt: patch.systemPrompt ?? current[mode].systemPrompt,
      };
    }

    const activeMode = normalizeMode(body.activeMode || config.activeMode || DEFAULT_MODE);

    await redis.set(SETTINGS_KEY, JSON.stringify({ activeMode, modes }));

    return NextResponse.json({ success: true, settings: { activeMode, modes } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
