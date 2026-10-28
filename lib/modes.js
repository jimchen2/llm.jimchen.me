// lib/modes.js

// Modes differ only by their system prompt. The model and the API key are
// shared by all of them (see lib/llm.js), so there is nothing per-mode to set
// besides the prompt.
export const MODES = {
  default: {
    label: 'Default mode',
    systemPromptEnv: 'DEFAULT_MODE_SYSTEM_PROMPT',
    // Unlimited conversation memory: the full message chain is sent to the LLM.
    memory: Infinity,
    defaultSystemPrompt:
      'You are a technical/research assistant. Only answer questions related to math, cs. Be concise, do not make assumptions, and do not answer any off-topic queries.',
  },
  random: {
    label: 'Random mode',
    systemPromptEnv: 'RANDOM_MODE_SYSTEM_PROMPT',
    // One-off mode: memory = 0 means the LLM sees only the current message,
    // with no previous conversation context — every prompt starts fresh.
    memory: 0,
    defaultSystemPrompt: 'answer very short and concisely, do not make it too long or too complicated',
  },
  grammar: {
    label: 'Grammar mode',
    systemPromptEnv: 'GRAMMAR_MODE_SYSTEM_PROMPT',
    // Unlimited conversation memory: the full message chain is sent to the LLM.
    memory: Infinity,
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

export function normalizeMode(mode) {
  return mode && Object.prototype.hasOwnProperty.call(MODES, mode) ? mode : DEFAULT_MODE;
}

// Resolves a mode's system prompt from the environment, falling back to the
// mode's built-in default when the env var is empty.
export function getModeConfig(mode) {
  const resolvedMode = normalizeMode(mode);
  const m = MODES[resolvedMode];
  const envPrompt = (process.env[m.systemPromptEnv] || '').trim();
  return {
    mode: resolvedMode,
    label: m.label,
    systemPrompt: envPrompt || m.defaultSystemPrompt || '',
  };
}

// Returns how many *previous* messages to keep in the LLM context for a mode.
// Infinity = full conversation history (default, grammar). 1 = one-off: only
// the immediately previous message plus the current one (random).
export function getModeMemory(mode) {
  const resolvedMode = normalizeMode(mode);
  return MODES[resolvedMode]?.memory ?? Infinity;
}
