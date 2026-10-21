// Build grammar suggestions by comparing the original paragraph with the
// model's plain, corrected paragraph. The model never has to produce diff
// markup, so ordinary text (including Markdown punctuation) stays untouched.
import { diffArrays } from "diff";

// Keep words, whitespace, and punctuation as separate tokens. Unicode property
// escapes are important here: the built-in word diff treats Cyrillic text as
// individual characters, which turns a one-word correction into several edits.
const TOKEN_PATTERN = /[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*|\s+|[^\p{L}\p{M}\p{N}_\s]+/gu;

function tokenize(text) {
  return [...text.matchAll(TOKEN_PATTERN)].map((match) => match[0]);
}

export function findTextChanges(input, output) {
  if (input === output) return [];

  const parts = diffArrays(tokenize(input), tokenize(output));
  const changes = [];
  let inputCursor = 0;
  let pending = null;

  const flush = () => {
    // Pure whitespace changes produce nearly invisible, noisy suggestion cards.
    // They are not grammar corrections, so leave the author's spacing alone.
    if (pending && (pending.original.trim() || pending.suggestion.trim())) {
      changes.push(pending);
    }
    pending = null;
  };

  for (const part of parts) {
    const value = part.value.join("");

    if (!part.added && !part.removed) {
      flush();
      inputCursor += value.length;
      continue;
    }

    if (!pending) {
      pending = {
        start: inputCursor,
        end: inputCursor,
        original: "",
        suggestion: "",
      };
    }

    if (part.removed) {
      pending.original += value;
      inputCursor += value.length;
      pending.end = inputCursor;
    }
    if (part.added) {
      pending.suggestion += value;
    }
  }

  flush();
  return changes;
}

export function applyTextChanges(text, changes) {
  let result = text;
  const ordered = [...changes].sort(
    (a, b) => b.start - a.start || b.end - a.end
  );

  for (const change of ordered) {
    if (result.slice(change.start, change.end) !== change.original) continue;
    result =
      result.slice(0, change.start) +
      change.suggestion +
      result.slice(change.end);
  }

  return result;
}
