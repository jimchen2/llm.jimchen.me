// lib/grammar.js
//
// Shared helpers for the /grammar page.
// Deliberately dependency-free so it can be imported from both the API route
// (server) and the page (client bundle).

// The system prompt, kept verbatim from the spec. The only addition is the
// final line telling the model to return *only* the corrected text, because
// the page renders the answer directly (there is no chat bubble to explain
// things in).
export const GRAMMAR_SYSTEM_PROMPT = `Сначала исправьте грамматические ошибки, затем ответьте.

Как исправить грамматику? (если по русскому)

1. Мужской род для пользователя.

2. Перепиши предложение с исправлениями прямо в тексте:

- Выдели неправильные слова ~~зачеркиванием~~ (тильда с обеих сторон)

- Сразу после напиши правильное слово **жирным шрифтом** (звёздочки с обеих сторон)

3. Знаки препинания исправляй или добавляй без выделений (не используй для них ~~зачеркивание~~ и **жирный шрифт**).

Пример:

Ввод: Я пошла в магазине и купила хлеб а потом пошла спать.

Вывод: Я ~~пошла~~ **пошёл** в ~~магазине~~ **магазин** и ~~купила~~ **купил** хлеб, а потом ~~пошла~~ **пошёл** спать.

Если текст не на русском языке, или есть английские слова, отвечайте прямо и на русском языке.

Выведи только исправленный текст — без пояснений, вступлений, комментариев и заголовков.`;

// Server-side guard: reject absurd payloads (the client also clamps to this).
export const GRAMMAR_MAX_CHARS = 8000;

// ---------------------------------------------------------------- text utils

// Characters that close a sentence. "…" and "..." are covered by [.!?…]+.
const SENTENCE_END = /[.!?…]+["'»”’)\]】」]*/g;
// A blank line counts as a paragraph break (and therefore as a safe cut).
const PARAGRAPH_BREAK = /\n[^\S\n]*\n[^\S\n]*/g;

/**
 * Returns the part of `text` that is safe to send to the model while the user
 * is still typing:
 *
 *   - everything up to the last completed sentence (a [.!?…] followed by
 *     whitespace, so "3.14" and "т.д." style abbreviations are not cut), and
 *   - everything up to the last paragraph break.
 *
 * The trailing fragment the user is still typing ("последние пару слов") is
 * intentionally dropped, so the model never "corrects" a half-written word.
 * Returns "" when nothing complete exists yet.
 */
export function getCheckablePrefix(text, maxChars = GRAMMAR_MAX_CHARS) {
  if (!text) return '';

  let cut = 0;
  let m;

  SENTENCE_END.lastIndex = 0;
  while ((m = SENTENCE_END.exec(text)) !== null) {
    const after = text.slice(m.index + m[0].length);
    // Only a terminator that is actually followed by a space/newline (or the
    // end of the text) ends a sentence.
    if (/^\s/.test(after) || after === '') {
      cut = Math.max(cut, m.index + m[0].length);
    }
  }

  PARAGRAPH_BREAK.lastIndex = 0;
  while ((m = PARAGRAPH_BREAK.exec(text)) !== null) {
    cut = Math.max(cut, m.index + m[0].length);
  }

  if (cut > maxChars) cut = lastBoundaryBefore(text, maxChars);
  if (cut <= 0) return '';

  return text.slice(0, cut).replace(/\s+$/, '');
}

// Largest sentence/paragraph boundary at or before `limit`.
function lastBoundaryBefore(text, limit) {
  const head = text.slice(0, limit);
  let cut = 0;
  let m;

  SENTENCE_END.lastIndex = 0;
  while ((m = SENTENCE_END.exec(head)) !== null) {
    const after = head.slice(m.index + m[0].length);
    if (/^\s/.test(after) || after === '') {
      cut = Math.max(cut, m.index + m[0].length);
    }
  }

  PARAGRAPH_BREAK.lastIndex = 0;
  while ((m = PARAGRAPH_BREAK.exec(head)) !== null) {
    cut = Math.max(cut, m.index + m[0].length);
  }

  return cut > 0 ? cut : limit;
}

// Trim a payload down to the last sentence boundary before `maxChars`, so we
// never send a mangled word to the model.
export function clampToSentence(text, maxChars = GRAMMAR_MAX_CHARS) {
  if (!text || text.length <= maxChars) return text || '';
  return getCheckablePrefix(text.slice(0, maxChars), maxChars) || text.slice(0, maxChars);
}

/**
 * The decision the polling loop makes on every tick. Returns `null` when there
 * is nothing to do — which is the normal case on an idle page, so no request
 * is ever made for text that has not changed since the last check.
 *
 *   { target, force: false }  -> check finished sentences only
 *   { target, force: true }   -> nothing finished yet, but the text has settled,
 *                                so check it as a whole
 */
export function decideCheck({ text, lastRequested = null, stableTicks = 0 }) {
  const value = text || '';
  if (!value.trim()) return null;

  const prefix = getCheckablePrefix(value, GRAMMAR_MAX_CHARS);
  if (prefix) {
    return lastRequested === prefix ? null : { target: prefix, force: false };
  }

  // No finished sentence yet (e.g. a fragment pasted without a period). Once
  // the user has clearly stopped typing (a good few seconds of silence), check
  // it as a whole — otherwise a period-less text would never be checked.
  const whole = clampToSentence(value.trim(), GRAMMAR_MAX_CHARS);
  if (stableTicks >= 3 && lastRequested !== whole) {
    return { target: whole, force: true };
  }
  return null;
}

/**
 * Parses the model's markup (`~~wrong~~ **right**`) into a list of
 * suggestions for the side panel. `**inserted**` with no preceding `~~…~~`
 * becomes an "insert" suggestion, `~~removed~~` with no replacement becomes a
 * "delete".
 */
export function extractSuggestions(markdown) {
  if (!markdown) return [];
  const out = [];
  const re = /~~([\s\S]+?)~~(?:[ \t]*\*\*([\s\S]+?)\*\*)?|\*\*([\s\S]+?)\*\*/g;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    const plain = (s) => (s || '').replace(/\s+/g, ' ').trim();
    if (m[1] !== undefined) {
      const from = plain(m[1]);
      const to = plain(m[2]);
      if (!from && !to) continue;
      out.push({
        from,
        to,
        type: !to ? 'delete' : 'replace',
      });
    } else if (m[3] !== undefined) {
      const to = plain(m[3]);
      if (!to) continue;
      out.push({ from: '', to, type: 'insert' });
    }
  }
  return out;
}

/**
 * "Clean" version of the corrected text: the struck-through original is
 * dropped, the bold replacement keeps its formatting removed. Handy for
 * copying the final text or pasting it back into the editor.
 */
export function toCleanText(markdown) {
  if (!markdown) return '';
  return markdown
    .replace(/~~([\s\S]+?)~~(?:[ \t]*\*\*([\s\S]+?)\*\*)?/g, (_, _from, to) => (to ? ` ${to} ` : ' '))
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.;:!?…])/g, '$1')
    // ", ." / "; !" left behind by a deleted word
    .replace(/([,;:])[ \t]*([.!?…])/g, '$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Models sometimes wrap the answer in a fence or echo "Вывод:". Strip that.
export function normalizeModelOutput(raw) {
  let text = (raw || '').trim();
  if (!text) return '';

  text = text.replace(/^```[a-zA-Z-]*[ \t]*\n?/, '').replace(/\n?```$/, '').trim();
  text = text.replace(
    /^(?:вывод|исправленный текст|ответ|output|corrected(?: text)?|answer)\s*:\s*/i,
    ''
  );
  return text.trim();
}

export function countWords(text) {
  const t = (text || '').trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

export function countSentences(text) {
  const t = (text || '').trim();
  if (!t) return 0;
  const matches = t.match(/[.!?…]+(?:\s|$)/g);
  return matches ? matches.length : 0;
}
