// lib/config.js
// Central place for mode definitions, prompts and API keys.
// Prompts and API keys live in environment variables (see .env.example).

export const MODES = {
  TECH: 'tech',
  RANDOM: 'random',
};

export const VALID_MODES = Object.values(MODES);

export const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'gemini-3.8-flash';

// In non-production runs the LLM is mocked with a fixed reply so no API keys are
// needed for a test run. Set MOCK_LLM=false to force real API calls in development.
export function isMockEnabled() {
  return process.env.NODE_ENV !== 'production' && process.env.MOCK_LLM !== 'false';
}

// Resolves the API key + system prompt for a conversation mode.
// Each mode has its own Gemini API key so usage/billing is tracked separately
// per mode in the backend. The frontend never sees any of this.
export function getModeConfig(mode) {
  const normalized = VALID_MODES.includes(mode) ? mode : MODES.TECH;
  const isRandom = normalized === MODES.RANDOM;

  return {
    mode: normalized,
    apiKey: isRandom ? process.env.RANDOM_MODE_API_KEY : process.env.TECH_MODE_API_KEY,
    // Random mode: no system prompt at all.
    systemPrompt: isRandom ? null : process.env.TECH_MODE_SYSTEM_PROMPT || null,
  };
}
