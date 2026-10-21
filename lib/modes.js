// lib/modes.js

export const MODES = {
  default: {
    label: 'Default mode',
    apiKeyEnv: 'DEFAULT_MODE_API_KEY',
    systemPromptEnv: 'DEFAULT_MODE_SYSTEM_PROMPT',
    defaultSystemPrompt:
      'You are a technical/research assistant. Only answer questions related to math and cs. Be concise, do not make assumptions, and do not answer any off-topic queries.',
  },
  random: {
    label: 'Random mode',
    apiKeyEnv: 'RANDOM_MODE_API_KEY',
    systemPromptEnv: 'RANDOM_MODE_SYSTEM_PROMPT',
    defaultSystemPrompt: 'answer very short and concisely, do not make it too long or too complicated',
  },
  grammar: {
    label: 'Grammar mode',
    apiKeyEnv: 'GRAMMAR_MODE_API_KEY',
    systemPromptEnv: 'GRAMMAR_MODE_SYSTEM_PROMPT',
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

// Resolves a mode's config straight from the environment.
// Falls back to the mode's defaultSystemPrompt when env is empty.
// Falls back to DEFAULT_MODE_API_KEY when a mode has no dedicated key, so
// adding a new mode can never silently send an empty API key (which Google
// answers with 403 Forbidden).
export function getModeConfig(mode) {
  const resolvedMode = normalizeMode(mode);
  const m = MODES[resolvedMode];
  const envPrompt = (process.env[m.systemPromptEnv] || '').trim();
  const modeKey = (process.env[m.apiKeyEnv] || '').trim();
  const fallbackKey = (process.env.DEFAULT_MODE_API_KEY || '').trim();
  return {
    mode: resolvedMode,
    label: m.label,
    apiKey: modeKey || fallbackKey,
    apiKeyEnv: m.apiKeyEnv,
    systemPrompt: envPrompt || m.defaultSystemPrompt || '',
  };
}
