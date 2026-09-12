// lib/modes.js
// Modes are just different system prompts (plus their own API key / model).
// Everything is configured through environment variables, see .env.example.
// An empty system prompt is a valid configuration.

export const MODES = ['random', 'tech'];
export const DEFAULT_MODE = 'tech';

export function isValidMode(mode) {
  return MODES.includes(mode);
}

export function normalizeMode(mode) {
  return isValidMode(mode) ? mode : DEFAULT_MODE;
}

export const MODE_LABELS = {
  random: 'Random mode',
  tech: 'Tech mode',
};

// Env defaults for a mode. Missing values fall back to empty strings, which is valid.
export function getModeEnvDefaults(mode) {
  const prefix = mode.toUpperCase();
  return {
    apiKey: process.env[`${prefix}_MODE_API_KEY`] ?? '',
    model: process.env[`${prefix}_MODE_MODEL`] ?? process.env.DEFAULT_MODEL ?? 'gemini-3.8-flash',
    systemPrompt: process.env[`${prefix}_MODE_SYSTEM_PROMPT`] ?? '',
  };
}
