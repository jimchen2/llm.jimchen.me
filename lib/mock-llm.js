// lib/mock-llm.js
//
// Fixed development answers. In development, when a mode has no API key (the
// normal case when you just cloned the repo and ran `npm run dev`), the app
// answers every question with a fixed text that says which mode you are in.
// Nothing is sent to Gemini, no key is required. Production never uses this.

import { MODES, normalizeMode } from './modes';

// Give the browser a moment to open the SSE stream before the first chunk.
const FIRST_CHUNK_DELAY_MS = 450;
const CHUNK_DELAY_MS = 18;
const CHUNK_SIZE = 16; // characters per streamed chunk

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function quote(text, limit = 160) {
  const flattened = String(text || '').replace(/\s+/g, ' ').trim();
  if (!flattened) return '*(empty message)*';
  return flattened.length > limit ? `${flattened.slice(0, limit)}…` : flattened;
}

export function buildMockReply({ mode, model, messages, systemPrompt }) {
  const normalized = normalizeMode(mode);
  const info = MODES[normalized];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const promptLine = systemPrompt
    ? `yes — \`SYSTEM_PROMPT_TECH\` is sent as the system instruction (${systemPrompt.length} chars)`
    : 'none — mode 2 sends no system prompt at all';

  return [
    `## 🧪 Mode ${info.number} · ${info.label} — fixed development reply`,
    '',
    `**You are in mode ${info.number} — ${info.label}.** No Gemini request was made: this server runs in development without an API key, so whatever you ask, this fixed text comes back.`,
    '',
    `| | |`,
    `| --- | --- |`,
    `| Mode | ${info.number} · ${info.label}${normalized === 'tech' ? ' (default)' : ''} |`,
    `| System prompt | ${promptLine} |`,
    `| Model | \`${model}\` |`,
    `| API key used | \`${info.apiKeyEnv}\` — not configured, so the mock answered |`,
    '',
    `Your message: "${quote(lastUser?.content)}"`,
    '',
    'Conversation mode',
    '',
    `- This mode is stored on the conversation itself, so when you come back to this chat later it is still **mode ${info.number} · ${info.label}**.`,
    `- Mode **1 · Tech** runs with the technical system prompt and \`GEMINI_API_KEY_TECH\`.`,
    `- Mode **2 · Random** runs with no system prompt and \`GEMINI_API_KEY_RANDOM\`.`,
    '- New chats always start in mode 1 · Tech.',
    '',
    '> Add your keys to `.env` (see `.env.example`) to replace this mock with real Gemini answers.',
  ].join('\n');
}

export async function streamMockReply({ mode, model, messages, systemPrompt, onChunk, onDone }) {
  const text = buildMockReply({ mode, model, messages, systemPrompt });

  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }

  await sleep(FIRST_CHUNK_DELAY_MS);
  for (const chunk of chunks) {
    await onChunk(chunk);
    await sleep(CHUNK_DELAY_MS);
  }

  const usage = {
    mocked: true,
    mode: normalizeMode(mode),
    model,
    promptTokenCount: Math.ceil((systemPrompt?.length || 0) / 4) + Math.ceil(text.length / 8),
    candidatesTokenCount: Math.ceil(text.length / 4),
  };
  usage.totalTokenCount = usage.promptTokenCount + usage.candidatesTokenCount;

  await onDone(text, { mode: normalizeMode(mode), model, usage });
}
