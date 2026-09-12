// lib/modes.js
//
// The two conversation modes. A mode is a property of a *conversation*, not of
// a single message, so reloading a conversation always gives you back the same
// mode. The mode decides, entirely on the backend:
//   1. which system prompt is used (mode 2 "random" sends none at all)
//   2. which Gemini API key is used (separate keys -> separate billing/usage)
//   3. which model is used (optional per-mode override)
//
// This file is safe to import from the browser: it contains no secrets, only
// labels plus the names of the env vars the backend reads.

export const MODE_TECH = 'tech';
export const MODE_RANDOM = 'random';

// Every brand new conversation starts in tech mode.
export const DEFAULT_MODE = MODE_TECH;

export const MODES = {
  [MODE_TECH]: {
    id: MODE_TECH,
    number: 1,
    label: 'Tech',
    icon: '🧑‍💻',
    hint: 'Mode 1 · tech: coding / math / research answers with the tech system prompt.',
    emptyState: 'Please only talk about coding',
    placeholder: 'Ask a coding, math or research question',
    apiKeyEnv: 'GEMINI_API_KEY_TECH',
    modelEnv: 'GEMINI_MODEL_TECH',
  },
  [MODE_RANDOM]: {
    id: MODE_RANDOM,
    number: 2,
    label: 'Random',
    icon: '🎲',
    hint: 'Mode 2 · random: anything goes, no system prompt is sent to the model.',
    emptyState: 'Ask me anything — this conversation has no system prompt',
    placeholder: 'Ask me anything',
    apiKeyEnv: 'GEMINI_API_KEY_RANDOM',
    modelEnv: 'GEMINI_MODEL_RANDOM',
  },
};

export const MODE_LIST = [MODES[MODE_TECH], MODES[MODE_RANDOM]];

// Unknown/legacy values (conversations created before modes existed) fall back
// to the default mode.
export function normalizeMode(mode) {
  return MODES[mode] ? mode : DEFAULT_MODE;
}

export function modeLabel(mode) {
  const m = MODES[normalizeMode(mode)];
  return `${m.number} · ${m.label}`;
}
