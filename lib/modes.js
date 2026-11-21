// lib/modes.js

// Modes share the same model and API key (see lib/llm.js). They differ by
// their system prompt and by how much conversation history they keep.
export const MODES = {
  default: {
    label: 'Default mode',
    systemPromptEnv: 'DEFAULT_MODE_SYSTEM_PROMPT',
    // Unlimited conversation memory: the full message chain is sent to the LLM.
    memory: Infinity,
    defaultSystemPrompt:
      'You are a technical/research assistant. Only answer questions related to math, cs. Be concise, do not make assumptions, and do not answer any off-topic queries.',
  },
  // Random mode is disabled for now. The route files (app/random/**) are still
  // in the repo, commented out, so this can be turned back on easily.
  // Any conversation stored with mode "random" now falls back to DEFAULT_MODE
  // via normalizeMode() below.
  // random: {
  //   label: 'Random mode',
  //   systemPromptEnv: 'RANDOM_MODE_SYSTEM_PROMPT',
  //   // One-off mode: memory = 0 means the LLM sees only the current message,
  //   // with no previous conversation context — every prompt starts fresh.
  //   // (This reverts PR #25, which had restored full memory; see PR #24.)
  //   memory: 0,
  //   defaultSystemPrompt: 'answer very short and concisely, do not make it too long or too complicated',
  // },
  grammar: {
    label: 'Russian mode',
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
  practical: {
    // Keep the existing key and route so saved conversations and bookmarks work.
    label: 'Short conversation mode',
    systemPromptEnv: 'PRACTICAL_MODE_SYSTEM_PROMPT',
    // A conversation is limited to five user/assistant exchanges (ten messages).
    // At that size, all messages in the conversation fit in the model context.
    memory: 9,
    maxMessages: 10,
    defaultSystemPrompt:
      'Be conversational and answer very shortly and concisely. Keep replies simple and avoid unnecessary detail.',
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
// Infinity = full conversation history; 0 = only the current message.
export function getModeMemory(mode) {
  const resolvedMode = normalizeMode(mode);
  return MODES[resolvedMode]?.memory ?? Infinity;
}

// Maximum message count on a conversation's active ancestry. Most modes are
// unlimited; short conversation mode allows five user/assistant exchanges.
export function getModeMaxMessages(mode) {
  const resolvedMode = normalizeMode(mode);
  return MODES[resolvedMode]?.maxMessages ?? Infinity;
}

// Build the context from the current message back through its active ancestry,
// truncated to the mode's memory and conversation limit. A mode with memory = 0
// would return only the current message, so no earlier messages are sent.
export function getModeMessages(mode, messages, currentId) {
  const path = [];
  let curr = currentId;
  let remaining = Math.min(getModeMemory(mode) + 1, getModeMaxMessages(mode)); // current + previous messages
  while (curr && messages[curr] && remaining > 0) {
    path.unshift({ role: messages[curr].role, content: messages[curr].content });
    curr = messages[curr].parent_id;
    remaining--;
  }
  return path;
}
