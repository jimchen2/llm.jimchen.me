// lib/config.js
// Central server-side configuration, exported from environment variables.
// See `.env.example` for all available options.

export const TECH_SYSTEM_PROMPT =
  process.env.TECH_SYSTEM_PROMPT ||
  "You are a technical/research assistant. Only answer questions related to math and cs. Be concise, do not make assumptions, and do not answer any off-topic queries.";

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

export const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "gemini-3.8-flash";

// The two supported chat modes. Tech mode uses TECH_SYSTEM_PROMPT,
// random mode uses no system prompt at all. Defaults to tech.
export const MODES = Object.freeze({ TECH: "tech", RANDOM: "random" });

export function normalizeMode(mode) {
  return mode === MODES.RANDOM ? MODES.RANDOM : MODES.TECH;
}
