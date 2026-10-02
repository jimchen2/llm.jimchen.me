// lib/modes.js

export const MODES = {
  default: {
    label: 'Default mode',
    apiKeyEnv: 'DEFAULT_MODE_API_KEY',
    systemPromptEnv: 'DEFAULT_MODE_SYSTEM_PROMPT',
    defaultSystemPrompt:
      'You are a technical/research assistant. Only answer questions related to math and cs. Be concise, do not make assumptions, and do not answer any off-topic queries.',
  },
  random: {
    label: 'Random mode',
    apiKeyEnv: 'RANDOM_MODE_API_KEY',
    systemPromptEnv: 'RANDOM_MODE_SYSTEM_PROMPT',
    defaultSystemPrompt: 'answer very short and concisely, do not make it too long or too complicated',
  },
};

export const DEFAULT_MODE = 'default';

export function normalizeMode(mode) {
  return mode && Object.prototype.hasOwnProperty.call(MODES, mode) ? mode : DEFAULT_MODE;
}

// Resolves a mode's config straight from the environment.
// Falls back to the mode's defaultSystemPrompt when env is empty.
export function getModeConfig(mode) {
  const resolvedMode = normalizeMode(mode);
  const m = MODES[resolvedMode];
  const envPrompt = (process.env[m.systemPromptEnv] || '').trim();
  return {
    mode: resolvedMode,
    label: m.label,
    apiKey: (process.env[m.apiKeyEnv] || '').trim(),
    systemPrompt: envPrompt || m.defaultSystemPrompt || '',
  };
}
