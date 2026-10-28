// lib/modes.js

// Modes differ only by their system prompt and how much conversation history
// the model is allowed to see. The model and the API key are shared by all of
// them (see lib/llm.js).
//
// `defaultMemory` is the number of *previous exchanges* kept as context:
//   0  -> strictly one-off, the model only ever sees the newest message
//   1  -> only the previous exchange (one user/assistant pair) is remembered
//  -1  -> unlimited, the whole message chain is sent
export const MODES = {
  default: {
    label: 'Default mode',
    systemPromptEnv: 'DEFAULT_MODE_SYSTEM_PROMPT',
    memoryEnv: 'DEFAULT_MODE_MEMORY',
    defaultMemory: -1,
    defaultSystemPrompt:
      'You are a technical/research assistant. Only answer questions related to math, cs. Be concise, do not make assumptions, and do not answer any off-topic queries.',
  },
  random: {
    label: 'Random mode',
    systemPromptEnv: 'RANDOM_MODE_SYSTEM_PROMPT',
    memoryEnv: 'RANDOM_MODE_MEMORY',
    // One-off mode: every turn is answered from the previous exchange only, so
    // you cannot just keep scrolling back through a long shared context.
    defaultMemory: 1,
    defaultSystemPrompt: 'answer very short and concisely, do not make it too long or too complicated',
  },
  grammar: {
    label: 'Grammar mode',
    systemPromptEnv: 'GRAMMAR_MODE_SYSTEM_PROMPT',
    memoryEnv: 'GRAMMAR_MODE_MEMORY',
    defaultMemory: -1,
    defaultSystemPrompt: `Сначала исправьте грамматические ошибки, затем ответьте.

Как исправить грамматику? (если по русскому)

1. Мужской род для пользователя. Игнорируй букву «ё»: если вместо «ё» написано «е», считай это правильным и не исправляй.

2. Перепиши предложение с исправлениями прямо в тексте:

- Выдели неправильные слова ~~зачеркиванием~~ (тильда с обеих сторон)

- Сразу после напиши правильное слово **жирным шрифтом** (звёздочки с обеих сторон)

3. Знаки препинания исправляй или добавляй без выделений (не используй для них ~~зачеркивание~~ и **жирный шрифт**).

Пример:

Ввод: Я пошла в магазине и купила хлеб а потом пошла спать.

Вывод: Я ~~пошла~~ **пошел** в ~~магазине~~ **магазин** и ~~купила~~ **купил** хлеб, а потом ~~пошла~~ **пошел** спать.

Если текст не на русском языке, или есть английские слова, отвечайте прямо и на русском языке.`,
  },
};

export const DEFAULT_MODE = 'default';

// A conversation is unlimited-history unless a mode says otherwise.
export const DEFAULT_MEMORY = -1;

export function normalizeMode(mode) {
  return mode && Object.prototype.hasOwnProperty.call(MODES, mode) ? mode : DEFAULT_MODE;
}

// lib/modes.js is imported by client components too, where there is no
// process.env — reading it has to stay behind this guard.
function readEnv(name) {
  if (!name || typeof process === 'undefined' || !process.env) return '';
  return (process.env[name] || '').trim();
}

// Memory (in exchanges) for a mode: the mode's default, overridable with the
// mode's env var (e.g. RANDOM_MODE_MEMORY=0 for strictly one-off answers).
// Any integer is accepted: 0 = no previous context, -1 (or invalid) = keep
// the whole conversation.
export function getModeMemory(mode) {
  const m = MODES[normalizeMode(mode)];
  const fromEnv = parseInt(readEnv(m.memoryEnv), 10);
  if (Number.isFinite(fromEnv)) return fromEnv;
  return typeof m.defaultMemory === 'number' ? m.defaultMemory : DEFAULT_MEMORY;
}

// Mode metadata that is safe to hand to the browser: labels and memory
// settings, never the resolved system prompts.
export function getModePublicConfig(mode) {
  const m = MODES[normalizeMode(mode)];
  return { label: m.label, memory: getModeMemory(mode) };
}

export function getPublicModeConfigs() {
  return Object.fromEntries(Object.keys(MODES).map((key) => [key, getModePublicConfig(key)]));
}

// Resolves a mode's system prompt from the environment, falling back to the
// mode's built-in default when the env var is empty.
export function getModeConfig(mode) {
  const resolvedMode = normalizeMode(mode);
  const m = MODES[resolvedMode];
  const envPrompt = readEnv(m.systemPromptEnv);
  return {
    mode: resolvedMode,
    label: m.label,
    systemPrompt: envPrompt || m.defaultSystemPrompt || '',
    memory: getModeMemory(resolvedMode),
  };
}

// Splits a message chain into exchanges: each one starts at a user message and
// runs up to (but not including) the next one. Messages before the first user
// prompt (rare: an orphan left behind by a delete) form their own leading group.
function splitIntoExchanges(list) {
  const groups = [];
  for (const m of list) {
    if (m.role === 'user' || groups.length === 0) groups.push([m]);
    else groups[groups.length - 1].push(m);
  }
  return groups;
}

// Keeps only the most recent `memory` exchanges of a message chain, so a mode
// like random behaves as one-off Q&A instead of a running conversation.
//
// The newest message (the one being answered) is always sent and never counts
// as memory. The messages before it are grouped into exchanges — a user prompt
// plus its reply, see splitIntoExchanges — and only the last `memory` of those
// survive:
//   memory = 0 -> strictly one-off: the new message alone, zero context
//   memory = 1 -> only the previous exchange is remembered (random mode)
//   memory < 0 -> unlimited, the whole chain is sent (the other modes)
// Retrying a bot message posts an empty assistant placeholder as the newest
// message, so it borrows the prompt above it and stays answerable even at
// memory = 0.
export function applyMemoryWindow(messages, memory) {
  const list = Array.isArray(messages)
    ? messages.filter((m) => m && typeof m.content === 'string' && m.role !== 'system')
    : [];
  if (!Number.isFinite(memory) || memory < 0 || list.length === 0) return list;

  const newest = list[list.length - 1];
  if (memory === 0) {
    if (newest.role === 'user') return [newest];
    for (let i = list.length - 2; i >= 0; i--) {
      if (list[i].role === 'user') return [list[i], newest]; // retry: keep its prompt
    }
    return [newest];
  }

  // The current exchange is the newest user prompt plus whatever follows it.
  const currentStart = newest.role === 'user' ? list.length - 1 : list.length;
  const groups = splitIntoExchanges(list.slice(0, currentStart));
  const kept = groups.slice(Math.max(0, groups.length - memory)).flat();
  return [...kept, ...list.slice(currentStart)];
}
