// lib/prompts.js
//
// System prompts are configured in the environment (see .env.example) and are
// exported from here so the rest of the server code has a single import point.
//
//   SYSTEM_PROMPT_TECH    -> mode 1 "tech"   (the technical/research assistant)
//   SYSTEM_PROMPT_RANDOM  -> mode 2 "random" (empty by default => no prompt at all)
//
// Prompts are stored per conversation, not per message: because the mode of a
// conversation never changes, the prompt for that conversation never changes
// either (there is no expiry / temp-prompt logic anywhere anymore).

import { MODE_RANDOM, normalizeMode } from './modes';

function clean(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

// Mode 1 - tech mode: the existing technical/research system prompt.
export const TECH_SYSTEM_PROMPT = clean(process.env.SYSTEM_PROMPT_TECH);

// Mode 2 - random mode: deliberately empty, so the model gets *no system
// prompt at all*. Set SYSTEM_PROMPT_RANDOM if you ever want one.
export const RANDOM_SYSTEM_PROMPT = clean(process.env.SYSTEM_PROMPT_RANDOM);

/**
 * The system prompt for a given mode, or null when the mode is meant to run
 * with no system prompt (which is the default for mode 2).
 */
export function getSystemPrompt(mode) {
  return normalizeMode(mode) === MODE_RANDOM ? RANDOM_SYSTEM_PROMPT : TECH_SYSTEM_PROMPT;
}

export function hasSystemPrompt(mode) {
  return getSystemPrompt(mode) !== null;
}
