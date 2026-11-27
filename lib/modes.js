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
  // Random mode means *no system prompt at all*: the model receives exactly the
  // conversation the user typed. It keeps the full history like the default
  // mode, so the only difference is the missing system prompt.
  //
  // Two extra rules apply to this mode:
  //   - writeRequiresComputer: the mode and its conversations are visible on
  //     every device, but a phone/tablet (including one requesting the "desktop
  //     site") can only read them — the composer and the message actions are
  //     disabled there, and the API refuses writes (see lib/desktopGate.js).
  //   - persistConversation: its conversations, messages and index entry never
  //     expire in Redis (see app/api/**/route.js and the helpers below).
  random: {
    label: 'Random mode',
    systemPromptEnv: 'RANDOM_MODE_SYSTEM_PROMPT',
    // Never send a system message for this mode, not even from the environment.
    noSystemPrompt: true,
    defaultSystemPrompt: '',
    // Unlimited conversation memory, like the default mode.
    memory: Infinity,
    // Visible everywhere; read-only on anything that is not a computer.
    writeRequiresComputer: true,
    persistConversation: true,
  },
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
// mode's built-in default when the env var is empty. Random mode opts out of
// system prompts entirely (noSystemPrompt), so it always resolves to ''.
export function getModeConfig(mode) {
  const resolvedMode = normalizeMode(mode);
  const m = MODES[resolvedMode];
  const envPrompt = m.noSystemPrompt ? '' : (process.env[m.systemPromptEnv] || '').trim();
  return {
    mode: resolvedMode,
    label: m.label,
    systemPrompt: m.noSystemPrompt ? '' : envPrompt || m.defaultSystemPrompt || '',
  };
}

// True for modes whose *writes* may only come from a computer (random mode).
// The mode itself is visible on every device; phones can read it but not type
// into it. The client half of the gate lives in lib/desktopGate.js; the server
// half only has the User-Agent and desktop-mode header to go on.
export function modeWriteRequiresComputer(mode) {
  return !!MODES[normalizeMode(mode)]?.writeRequiresComputer;
}

// True when this mode should render read-only on the current device: visible
// but with no composer and no edit/branch/delete actions.
export function modeIsReadOnlyOnDevice(mode, isComputer) {
  return modeWriteRequiresComputer(mode) && !isComputer;
}

// True for modes whose conversations are kept in Redis forever (no TTL).
export function modePersistsConversation(mode) {
  return !!MODES[normalizeMode(mode)]?.persistConversation;
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
