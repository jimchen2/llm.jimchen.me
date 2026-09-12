// lib/constants.js
// Shared between client and server — keep free of any secrets.

export const DEFAULT_MODEL = 'gemini-3.8-flash';

// Conversation modes.
// Mode 1 "tech"   — always runs with the SYSTEM_PROMPT_TECH env prompt.
// Mode 2 "random" — no system prompt at all, talk about anything.
export const MODE_TECH = 'tech';
export const MODE_RANDOM = 'random';
export const DEFAULT_MODE = MODE_TECH;

// Anything that isn't explicitly 'random' falls back to 'tech',
// so old/missing records always default to a tech conversation.
export function normalizeMode(mode) {
  return mode === MODE_RANDOM ? MODE_RANDOM : MODE_TECH;
}
