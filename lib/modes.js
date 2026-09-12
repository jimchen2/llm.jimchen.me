// lib/modes.js

export const MODES = {
  default: {
    label: 'Default mode',
    apiKeyEnv: 'DEFAULT_MODE_API_KEY',
    systemPromptEnv: 'DEFAULT_MODE_SYSTEM_PROMPT',
  },
  random: {
    label: 'Random mode',
    apiKeyEnv: 'RANDOM_MODE_API_KEY',
    systemPromptEnv: 'RANDOM_MODE_SYSTEM_PROMPT',
  },
};

export const DEFAULT_MODE = 'default';

export function normalizeMode(mode) {
  return mode && Object.prototype.hasOwnProperty.call(MODES, mode) ? mode : DEFAULT_MODE;
}

// Resolves a mode's config straight from the environment.
// An empty/undefined system prompt is a valid "no system prompt" result.
export function getModeConfig(mode) {
  const resolvedMode = normalizeMode(mode);
  const m = MODES[resolvedMode];
  return {
    mode: resolvedMode,
    label: m.label,
    apiKey: (process.env[m.apiKeyEnv] || '').trim(),
    systemPrompt: (process.env[m.systemPromptEnv] || '').trim(),
  };
}
