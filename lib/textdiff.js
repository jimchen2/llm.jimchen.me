// lib/textdiff.js
// Word-level diff between an original paragraph and the minimally corrected
// text returned by the grammar model. The model no longer marks edits with
// ~~original~~ **replacement**; instead it returns clean corrected text and
// the page computes the changes itself (a "manual diff"). Corrections are
// minimal by prompt design, so the edit distance is almost always tiny and a
// Myers O(ND) diff is cheap. Everything here is client-safe (no Node APIs).

const TOKEN_RE = /\p{L}[\p{L}\p{M}\d_'’-]*|\d[\d.,]*|\s+|[^\s\p{L}\p{M}\d]/gu;

// Largest middle (after common prefix/suffix is trimmed) that we align token
// by token. Longer middles fall back to one whole-range replacement issue.
const MAX_MIDDLE_TOKENS = 1200;
// Bail-out for the Myers walk when the texts diverge too much.
const MAX_EDIT_DISTANCE = 400;
// If a paragraph's suggestions exceed this, the correction is treated as a
// rewrite, not a fix, and collapsed into a single replace issue.
const MAX_ISSUES_PER_PARAGRAPH = 40;

// Split text into words, numbers, whitespace runs, and single punctuation
// characters, keeping each token's character offsets. Concatenating all
// tokens reproduces the input exactly.
export function tokenize(text) {
  const tokens = [];
  TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    tokens.push({ str: match[0], start: match.index, end: match.index + match[0].length });
  }
  return tokens;
}

// Classic Myers O(ND) greedy diff over two string arrays. Returns a flat list
// of ops ("eq" | "del" | "ins") paired by index: del consumes a[i], ins
// consumes b[j], eq consumes both. Returns null when the texts differ too
// much to align cheaply.
function myersOps(a, b) {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, MAX_EDIT_DISTANCE);
  const trace = [];
  let v = { 1: 0 };
  let found = false;

  for (let d = 0; d <= max; d++) {
    trace.push(v);
    const next = {};
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && (v[k - 1] || 0) < (v[k + 1] || 0))) {
        x = v[k + 1] || 0;
      } else {
        x = (v[k - 1] || 0) + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      next[k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
    v = next;
    if (found) break;
  }
  if (!found) return null;

  const ops = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const prev = trace[d];
    const k = x - y;
    let prevK;
    if (k === -d || (k !== d && (prev[k - 1] || 0) < (prev[k + 1] || 0))) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = prev[prevK] || 0;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push("eq");
      x--;
      y--;
    }
    if (x === prevX) {
      ops.push("ins");
      y--;
    } else {
      ops.push("del");
      x--;
    }
  }
  while (x > 0 && y > 0) {
    ops.push("eq");
    x--;
    y--;
  }
  ops.reverse();
  return ops;
}

// Merge neighboring issues separated only by whitespace-equal runs so a fix
// spanning a whole short phrase reads as one change instead of fragments.
function mergeRuns(runs, aTok, bTok) {
  if (runs.length < 2) return runs;
  const merged = [runs[0]];
  for (let i = 1; i < runs.length; i++) {
    const prev = merged[merged.length - 1];
    const next = runs[i];
    const aGap = aTok.slice(prev.aEnd, next.aStart);
    const bGap = bTok.slice(prev.bEnd, next.bStart);
    const whitespaceOnly =
      aGap.length > 0 &&
      aGap.every((t) => !t.str.trim()) &&
      bGap.every((t) => !t.str.trim());
    if (whitespaceOnly) {
      prev.aEnd = next.aEnd;
      prev.bEnd = next.bEnd;
    } else {
      merged.push(next);
    }
  }
  return merged;
}

// Compute the list of corrections that turns `original` into `corrected`.
// Each issue: { start, end, original, suggestion } with character offsets in
// `original`. A pure insertion has start === end and original ""; a pure
// deletion has suggestion "".
export function computeIssues(original, corrected) {
  if (typeof original !== "string" || typeof corrected !== "string") return [];
  if (!original || original === corrected) return [];

  const aTok = tokenize(original);
  const bTok = tokenize(corrected);

  // Trim the common prefix and suffix so the expensive part only sees the
  // tokens around actual edits.
  let pre = 0;
  while (pre < aTok.length && pre < bTok.length && aTok[pre].str === bTok[pre].str) pre++;
  let suf = 0;
  while (
    suf < aTok.length - pre &&
    suf < bTok.length - pre &&
    aTok[aTok.length - 1 - suf].str === bTok[bTok.length - 1 - suf].str
  ) {
    suf++;
  }

  const aMid = aTok.slice(pre, aTok.length - suf);
  const bMid = bTok.slice(pre, bTok.length - suf);
  if (!aMid.length && !bMid.length) return [];

  const middleStartChar = pre > 0 ? aTok[pre - 1].end : 0;
  const endFallback = aTok.length - suf > pre ? aTok[aTok.length - suf - 1].end : middleStartChar;
  const bStartChar = pre > 0 ? bTok[pre - 1].end : 0;
  const bEndChar = bTok.length - suf > pre ? bTok[bTok.length - suf - 1].end : bStartChar;

  const collapseToOne = () => [
    {
      start: middleStartChar,
      end: endFallback,
      original: original.slice(middleStartChar, endFallback),
      suggestion: corrected.slice(bStartChar, bEndChar),
    },
  ];

  let ops = null;
  if (aMid.length + bMid.length <= MAX_MIDDLE_TOKENS) {
    ops = myersOps(
      aMid.map((t) => t.str),
      bMid.map((t) => t.str)
    );
  }
  if (!ops) return collapseToOne();

  // Group consecutive del/ins ops into change runs.
  const runs = [];
  let ai = 0;
  let bi = 0;
  let cur = null;
  for (const op of ops) {
    if (op === "eq") {
      if (cur) {
        runs.push(cur);
        cur = null;
      }
      ai++;
      bi++;
    } else {
      if (!cur) cur = { aStart: ai, aEnd: ai, bStart: bi, bEnd: bi };
      if (op === "del") {
        ai++;
        cur.aEnd = ai;
      } else {
        bi++;
        cur.bEnd = bi;
      }
    }
  }
  if (cur) runs.push(cur);
  if (!runs.length) return [];

  const merged = mergeRuns(runs, aMid, bMid);

  const issues = [];
  for (const run of merged) {
    let start =
      run.aStart < run.aEnd
        ? aMid[run.aStart].start
        : run.aStart > 0
          ? aMid[run.aStart - 1].end
          : middleStartChar;
    let end = run.aEnd > run.aStart ? aMid[run.aEnd - 1].end : start;
    let sugStart =
      run.bStart < run.bEnd
        ? bMid[run.bStart].start
        : run.bStart > 0
          ? bMid[run.bStart - 1].end
          : bStartChar;
    let sugEnd = run.bEnd > run.bStart ? bMid[run.bEnd - 1].end : sugStart;

    // Keep shared boundary whitespace out of the highlighted spans so the
    // inline marks stay tight around the characters that really changed.
    let orig = original.slice(start, end);
    let sugg = corrected.slice(sugStart, sugEnd);
    while (orig.length && sugg.length && /^\s/.test(orig) && /^\s/.test(sugg)) {
      orig = orig.slice(1);
      sugg = sugg.slice(1);
      start++;
      sugStart++;
    }
    while (orig.length && sugg.length && /\s$/.test(orig) && /\s$/.test(sugg)) {
      orig = orig.slice(0, -1);
      sugg = sugg.slice(0, -1);
      end--;
      sugEnd--;
    }
    if (orig === sugg) continue;
    // Whitespace-only changes are invisible in the editor and confusing in
    // the list, so they are skipped.
    if (!orig.trim() && !sugg.trim()) continue;
    issues.push({ start, end, original: orig, suggestion: sugg });
  }

  if (issues.length > MAX_ISSUES_PER_PARAGRAPH) return collapseToOne();
  return issues.sort((a, b) => a.start - b.start);
}

// Apply a set of issues to a text (used by "copy corrected"). Issues whose
// span no longer matches the text are skipped.
export function applyIssues(text, issues) {
  let result = text;
  const ordered = [...issues].sort((a, b) => b.start - a.start);
  for (const issue of ordered) {
    if (result.slice(issue.start, issue.end) !== issue.original) continue;
    result = result.slice(0, issue.start) + issue.suggestion + result.slice(issue.end);
  }
  return result;
}
