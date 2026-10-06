// app/grammar/page.jsx
"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const DRAFT_KEY = "grammar_draft";
const CACHE_KEY = "grammar_paragraph_cache_v1";
const PARAGRAPH_CHECK_DELAY_MS = 900;
const MAX_CACHE_ENTRIES = 100;
const MAX_CACHE_CHARS = 1_200_000;
const MAX_PARAGRAPH_CHARS = 30_000;
const PARALLEL_CHECKS = 3;
const CONTEXT_CHARS = 800;

const DEMO_TEXT =
  "I has a apple.\n\nShe go to school every day.\n\nWe was very happy.";

// These examples are deliberately available without an API call so the inline
// suggestions can be tried immediately, even in a local setup without an LLM key.
const DEMO_CORRECTIONS = {
  "I has a apple.": "I ~~has~~ **have** ~~a~~ **an** apple.",
  "She go to school every day.": "She ~~go~~ **goes** to school every day.",
  "We was very happy.": "We ~~was~~ **were** very happy.",
  "Yesterday I go to the store.":
    "Yesterday I ~~go~~ **went** to the store.",
  "They is ready for the test.":
    "They ~~is~~ **are** ready for the test.",
  "Я пошла в магазине и купила хлеб а потом пошла спать.":
    "Я ~~пошла~~ **пошёл** в ~~магазине~~ **магазин** и ~~купила~~ **купил** хлеб, а потом ~~пошла~~ **пошёл** спать.",
};

function cacheKey(input, model) {
  return JSON.stringify([model || "__default__", input]);
}

function normalizeDemoText(text) {
  return text.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

// Split on explicit line breaks, preserving each paragraph's offset in the
// editable document. Blank lines are kept in the editor but are not checked.
function splitParagraphs(text) {
  const paragraphs = [];
  let start = 0;

  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === "\n") {
      const paragraph = text.slice(start, i);
      if (paragraph.trim()) paragraphs.push({ text: paragraph, start });
      start = i + 1;
    }
  }

  return paragraphs;
}

// The model marks edits as ~~original~~ **replacement**. Convert those marks
// into offsets in the original paragraph for the editor overlay and issue list.
function parseMarkedCorrections(input, output) {
  const issues = [];
  const pattern = /~~([^~\n]+)~~\s*\*\*([^*\n]+)\*\*/g;
  let sourceCursor = 0;
  let match;

  while ((match = pattern.exec(output || "")) !== null) {
    const original = match[1];
    const suggestion = match[2];
    let start = input.indexOf(original, sourceCursor);

    // A model can occasionally repeat or lightly reformat a phrase. Fall back
    // to the first occurrence rather than dropping a useful suggestion.
    if (start < 0) start = input.indexOf(original);
    if (start < 0) continue;

    issues.push({
      start,
      end: start + original.length,
      original,
      suggestion,
    });
    sourceCursor = start + original.length;
  }

  return issues;
}

function acceptMarkedSuggestion(input, output, targetStart, targetOriginal, targetSuggestion) {
  const pattern = /~~([^~\n]+)~~\s*\*\*([^*\n]+)\*\*/g;
  let sourceCursor = 0;

  return (output || "").replace(pattern, (whole, original, suggestion) => {
    let start = input.indexOf(original, sourceCursor);
    if (start < 0) start = input.indexOf(original);
    if (start < 0) return whole;

    sourceCursor = start + original.length;
    if (
      start === targetStart &&
      original === targetOriginal &&
      suggestion === targetSuggestion
    ) {
      return suggestion;
    }
    return whole;
  });
}

function getDemoEntry(paragraph, demoCache) {
  const trimmed = paragraph.trim();
  if (!trimmed) return null;

  const entry = demoCache.get(normalizeDemoText(trimmed));
  if (!entry) return null;

  const leading = paragraph.length - paragraph.trimStart().length;
  const trailing = paragraph.slice(leading + trimmed.length);
  return {
    ...entry,
    input: paragraph,
    output: `${paragraph.slice(0, leading)}${entry.output}${trailing}`,
  };
}

function loadCorrectionCache(cacheRef, demoCacheRef) {
  const restored = new Map();

  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    if (Array.isArray(saved.entries)) {
      for (const item of saved.entries) {
        if (
          item &&
          typeof item.input === "string" &&
          typeof item.output === "string" &&
          typeof item.model === "string"
        ) {
          restored.set(cacheKey(item.input, item.model), {
            input: item.input,
            output: item.output,
            model: item.model,
            source: "llm",
          });
        }
      }
    }
  } catch {
    // A missing or malformed local cache should never prevent editing.
  }

  const demos = new Map();
  for (const [input, output] of Object.entries(DEMO_CORRECTIONS)) {
    const entry = { input, output, model: "__demo__", source: "demo" };
    demos.set(normalizeDemoText(input), entry);
    // Keep the fixed examples in the same in-memory paragraph cache as results
    // returned by the model; they are just tagged so we never persist them.
    restored.set(cacheKey(input, "__demo__"), entry);
  }

  cacheRef.current = restored;
  demoCacheRef.current = demos;
}

function persistCorrectionCache(cache) {
  try {
    const entries = [...cache.values()].filter((item) => item.source === "llm");
    let selected = entries.slice(-MAX_CACHE_ENTRIES);
    let totalChars = selected.reduce(
      (total, item) => total + item.input.length + item.output.length,
      0
    );

    while (selected.length && totalChars > MAX_CACHE_CHARS) {
      const removed = selected.shift();
      totalChars -= removed.input.length + removed.output.length;
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify({ version: 1, entries: selected }));
  } catch {
    // Storage can be disabled or full; the in-memory cache still works.
  }
}

function renderHighlightedText(text, issues, activeIssueId, issueRefs, handlers) {
  const nodes = [];
  let cursor = 0;

  for (const issue of issues) {
    if (issue.start < cursor || issue.end > text.length) continue;
    if (issue.start > cursor) nodes.push(text.slice(cursor, issue.start));

    const mark = text.slice(issue.start, issue.end);
    nodes.push(
      <span
        key={issue.id}
        ref={(node) => {
          if (node) issueRefs.current.set(issue.id, node);
          else issueRefs.current.delete(issue.id);
        }}
        className={`gram-inline-mark${activeIssueId === issue.id ? " is-active" : ""}`}
        onMouseEnter={() => handlers.onMarkEnter(issue.id)}
        onMouseLeave={() => handlers.onMarkLeave(issue.id)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => handlers.onMarkClick(event, issue)}
        title={`Suggested: ${issue.suggestion}`}
      >
        {mark}
      </span>
    );
    cursor = issue.end;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function applySuggestions(text, issues) {
  let result = text;
  const ordered = [...issues].sort((a, b) => b.start - a.start);

  for (const issue of ordered) {
    if (result.slice(issue.start, issue.end) !== issue.original) continue;
    result =
      result.slice(0, issue.start) +
      issue.suggestion +
      result.slice(issue.end);
  }

  return result;
}

export default function GrammarPage() {
  const [ready, setReady] = useState(false);
  const [model, setModel] = useState("");
  const [text, setText] = useState("");
  const [cacheVersion, setCacheVersion] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [requestError, setRequestError] = useState("");
  const [ignoredIssues, setIgnoredIssues] = useState(() => new Set());
  const [pinnedIssueId, setPinnedIssueId] = useState(null);
  const [hoveredIssueId, setHoveredIssueId] = useState(null);
  const [popoverPosition, setPopoverPosition] = useState(null);

  const taRef = useRef(null);
  const mirrorRef = useRef(null);
  const editorShellRef = useRef(null);
  const issueRefs = useRef(new Map());
  const cacheRef = useRef(new Map());
  const demoCacheRef = useRef(new Map());
  const pendingRef = useRef(new Map());
  const hoverTimerRef = useRef(null);
  const modelRef = useRef("");

  const paragraphs = useMemo(() => splitParagraphs(text), [text]);
  const issues = useMemo(() => {
    const allIssues = [];
    const selectedModel = model || "";

    for (const paragraph of paragraphs) {
      const entry =
        getDemoEntry(paragraph.text, demoCacheRef.current) ||
        cacheRef.current.get(cacheKey(paragraph.text, selectedModel));
      if (!entry) continue;

      for (const parsed of parseMarkedCorrections(paragraph.text, entry.output)) {
        const id = [
          paragraph.start,
          parsed.start,
          parsed.end,
          parsed.original,
          parsed.suggestion,
        ].join(":");
        if (ignoredIssues.has(id)) continue;

        allIssues.push({
          ...parsed,
          id,
          start: paragraph.start + parsed.start,
          end: paragraph.start + parsed.end,
          paragraphStart: paragraph.start,
          paragraphText: paragraph.text,
          paragraphNumber:
            paragraphs.findIndex((item) => item.start === paragraph.start) + 1,
          source: entry.source,
        });
      }
    }

    return allIssues.sort((a, b) => a.start - b.start);
  }, [paragraphs, model, cacheVersion, ignoredIssues]);

  const checkedParagraphCount = useMemo(() => {
    let count = 0;
    for (const paragraph of paragraphs) {
      if (
        getDemoEntry(paragraph.text, demoCacheRef.current) ||
        cacheRef.current.has(cacheKey(paragraph.text, model || ""))
      ) {
        count++;
      }
    }
    return count;
  }, [paragraphs, model, cacheVersion]);

  const activeIssueId = hoveredIssueId || pinnedIssueId;
  const activeIssue = issues.find((issue) => issue.id === activeIssueId) || null;

  /* ---------------- auth and local cache ---------------- */
  useEffect(() => {
    if (document.cookie.split("; ").find((row) => row.startsWith("theme=dark"))) {
      import("darkreader").then((darkreader) =>
        darkreader.enable({ brightness: 100, contrast: 90, sepia: 10 })
      );
    }

    const savedToken = localStorage.getItem("db_access_token");
    if (!savedToken) {
      window.location.replace("/");
      return;
    }

    const settingsPromise = fetch("/api/settings", {
      headers: { "x-db-token": savedToken },
    })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);

    Promise.race([
      settingsPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
    ]).then((data) => {
      loadCorrectionCache(cacheRef, demoCacheRef);
      const selectedModel = data?.settings?.model || "";
      modelRef.current = selectedModel;
      setModel(selectedModel);

      try {
        setText(localStorage.getItem(DRAFT_KEY) || "");
      } catch {
        setText("");
      }
      setReady(true);
    });
  }, []);

  /* ---------------- paragraph-by-paragraph checking ---------------- */
  const requestCorrection = useCallback((paragraph, context) => {
    const demo = getDemoEntry(paragraph, demoCacheRef.current);
    if (demo) return Promise.resolve(demo);

    const selectedModel = modelRef.current || "";
    const key = cacheKey(paragraph, selectedModel);
    const cached = cacheRef.current.get(key);
    if (cached) return Promise.resolve(cached);
    if (pendingRef.current.has(key)) return pendingRef.current.get(key);

    const task = (async () => {
      if (paragraph.length > MAX_PARAGRAPH_CHARS) {
        throw new Error("A paragraph is too long to check (30,000 characters max).");
      }

      const response = await fetch("/api/grammar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-db-token": localStorage.getItem("db_access_token") || "",
        },
        body: JSON.stringify({
          text: paragraph,
          context: context.slice(-CONTEXT_CHARS),
          model: selectedModel || undefined,
        }),
      });

      if (response.status === 401) {
        localStorage.removeItem("db_access_token");
        window.location.replace("/");
        throw new Error("Your session expired. Please sign in again.");
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`);
      }
      if (typeof data.corrected !== "string") {
        throw new Error("The grammar service returned an invalid response.");
      }

      const entry = {
        input: paragraph,
        output: data.corrected,
        model: selectedModel,
        source: "llm",
      };
      cacheRef.current.delete(key);
      cacheRef.current.set(key, entry);

      const dynamicEntries = [...cacheRef.current.entries()].filter(
        ([, item]) => item.source === "llm"
      );
      while (dynamicEntries.length > MAX_CACHE_ENTRIES) {
        const [oldestKey] = dynamicEntries.shift();
        cacheRef.current.delete(oldestKey);
      }

      persistCorrectionCache(cacheRef.current);
      setCacheVersion((version) => version + 1);
      return entry;
    })()
      .catch((error) => {
        const currentText = taRef.current?.value || "";
        const paragraphStillVisible = splitParagraphs(currentText).some(
          (item) => item.text === paragraph
        );
        if (paragraphStillVisible) {
          setRequestError(error.message || "The paragraph could not be checked.");
        }
        throw error;
      })
      .finally(() => {
        pendingRef.current.delete(key);
        setPendingCount(pendingRef.current.size);
      });

    pendingRef.current.set(key, task);
    setPendingCount(pendingRef.current.size);
    return task;
  }, []);

  const checkDocument = useCallback(
    async (documentText) => {
      const currentParagraphs = splitParagraphs(documentText);
      let nextIndex = 0;

      const worker = async () => {
        while (nextIndex < currentParagraphs.length) {
          const index = nextIndex++;
          const paragraph = currentParagraphs[index];
          const context = currentParagraphs
            .slice(0, index)
            .map((item) => item.text)
            .join("\n");

          try {
            await requestCorrection(paragraph.text, context);
          } catch {
            // The error is shown in the toolbar; other paragraphs can still finish.
          }
        }
      };

      await Promise.all(
        Array.from(
          { length: Math.min(PARALLEL_CHECKS, currentParagraphs.length) },
          () => worker()
        )
      );
    },
    [requestCorrection]
  );

  useEffect(() => {
    if (!ready) return undefined;

    try {
      localStorage.setItem(DRAFT_KEY, text);
    } catch {
      // Draft saving is best effort.
    }
    setRequestError("");

    const timer = window.setTimeout(() => {
      checkDocument(text);
    }, PARAGRAPH_CHECK_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [ready, text, checkDocument]);

  /* ---------------- editor selection, hover, and popup ---------------- */
  const updatePopoverPosition = useCallback((issueId) => {
    if (!issueId) {
      setPopoverPosition(null);
      return;
    }

    const marker = issueRefs.current.get(issueId);
    const shell = editorShellRef.current;
    if (!marker || !shell) return;

    const markerRect = marker.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const cardWidth = Math.min(300, shellRect.width - 20);
    const left = Math.max(
      10,
      Math.min(markerRect.left - shellRect.left, shellRect.width - cardWidth - 10)
    );
    const below = markerRect.bottom - shellRect.top + 8;
    const top =
      below + 150 < shellRect.height
        ? below
        : Math.max(8, markerRect.top - shellRect.top - 150);

    setPopoverPosition({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (!activeIssue) {
      setPopoverPosition(null);
      return;
    }
    updatePopoverPosition(activeIssue.id);
  }, [activeIssue, updatePopoverPosition]);

  useEffect(
    () => () => {
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    },
    []
  );

  useEffect(() => {
    const availableIds = new Set(issues.map((issue) => issue.id));
    if (pinnedIssueId && !availableIds.has(pinnedIssueId)) setPinnedIssueId(null);
    if (hoveredIssueId && !availableIds.has(hoveredIssueId)) setHoveredIssueId(null);
  }, [issues, pinnedIssueId, hoveredIssueId]);

  const cancelHoverClear = () => {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
  };

  const scheduleHoverClear = (issueId) => {
    cancelHoverClear();
    hoverTimerRef.current = window.setTimeout(() => {
      setHoveredIssueId((current) => (current === issueId ? null : current));
    }, 180);
  };

  const syncEditorScroll = () => {
    if (taRef.current && mirrorRef.current) {
      mirrorRef.current.scrollTop = taRef.current.scrollTop;
      mirrorRef.current.scrollLeft = taRef.current.scrollLeft;
    }
    if (activeIssueId) updatePopoverPosition(activeIssueId);
  };

  const focusIssue = (issue) => {
    setPinnedIssueId(issue.id);
    setHoveredIssueId(null);

    const editor = taRef.current;
    if (!editor) return;
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(issue.start, issue.end);

    window.requestAnimationFrame(() => {
      const marker = issueRefs.current.get(issue.id);
      const shell = editorShellRef.current;
      if (!editor || !marker || !shell) return;
      const markerRect = marker.getBoundingClientRect();
      const shellRect = shell.getBoundingClientRect();
      const delta = markerRect.top + markerRect.height / 2 - (shellRect.top + shellRect.height / 2);
      editor.scrollTop += delta;
      syncEditorScroll();
    });
  };

  const handleEditorSelection = () => {
    const editor = taRef.current;
    if (!editor) return;
    const caret = editor.selectionStart;
    const issue = issues.find((item) => caret >= item.start && caret <= item.end);
    setPinnedIssueId(issue?.id || null);
  };

  const handleMarkClick = (event, issue) => {
    event.preventDefault();
    focusIssue(issue);
  };

  /* ---------------- actions ---------------- */
  const handleAccept = (issue) => {
    if (text.slice(issue.start, issue.end) !== issue.original) return;

    const localStart = issue.start - issue.paragraphStart;
    const nextParagraph =
      issue.paragraphText.slice(0, localStart) +
      issue.suggestion +
      issue.paragraphText.slice(localStart + issue.original.length);
    const selectedModel = modelRef.current || "";
    const oldEntry =
      getDemoEntry(issue.paragraphText, demoCacheRef.current) ||
      cacheRef.current.get(cacheKey(issue.paragraphText, selectedModel));

    // Keep the other suggestions from this paragraph visible while the user
    // accepts fixes one by one. The accepted correction becomes plain text in
    // the cached output, and the new paragraph version is cached immediately.
    if (oldEntry) {
      const nextOutput = acceptMarkedSuggestion(
        issue.paragraphText,
        oldEntry.output,
        localStart,
        issue.original,
        issue.suggestion
      );
      const nextEntry = {
        input: nextParagraph,
        output: nextOutput,
        model: selectedModel,
        source: oldEntry.source,
      };
      const nextKey = cacheKey(nextParagraph, selectedModel);
      cacheRef.current.delete(nextKey);
      cacheRef.current.set(nextKey, nextEntry);
      persistCorrectionCache(cacheRef.current);
      setCacheVersion((version) => version + 1);
    }

    const nextText =
      text.slice(0, issue.start) +
      issue.suggestion +
      text.slice(issue.end);
    setText(nextText);
    setPinnedIssueId(null);
    setHoveredIssueId(null);
  };

  const handleIgnore = (issue) => {
    setIgnoredIssues((current) => new Set(current).add(issue.id));
    setPinnedIssueId(null);
    setHoveredIssueId(null);
  };

  const handleCopyCorrected = async () => {
    try {
      await navigator.clipboard.writeText(applySuggestions(text, issues));
    } catch {
      setRequestError("Clipboard access was blocked by the browser.");
    }
  };

  const handleClear = () => {
    setText("");
    setIgnoredIssues(new Set());
    setPinnedIssueId(null);
    setHoveredIssueId(null);
    setRequestError("");
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Ignore storage errors.
    }
    // Keep the paragraph cache: clearing the document should not discard prior checks.
  };

  const handleTryDemo = () => {
    setText(DEMO_TEXT);
    setIgnoredIssues(new Set());
    setPinnedIssueId(null);
    setHoveredIssueId(null);
  };

  const issueRenderHandlers = {
    onMarkEnter: (id) => {
      cancelHoverClear();
      setHoveredIssueId(id);
    },
    onMarkLeave: scheduleHoverClear,
    onMarkClick: handleMarkClick,
  };

  const overlayContent = renderHighlightedText(
    text,
    issues,
    activeIssueId,
    issueRefs,
    issueRenderHandlers
  );

  const renderNoSuggestions = () => {
    if (!text.trim()) {
      return (
        <div className="gram-empty-state">
          <div className="gram-empty-icon">Aa</div>
          <strong>Your suggestions will appear here</strong>
          <p>Write or paste text on the left. Each paragraph is checked on its own.</p>
          <button className="gram-text-action" type="button" onClick={handleTryDemo}>
            Try the demo corrections
          </button>
        </div>
      );
    }

    if (pendingCount > 0) {
      return (
        <div className="gram-empty-state">
          <span className="gram-spinner" aria-hidden="true" />
          <strong>Checking paragraphs…</strong>
          <p>Each paragraph is sent separately. You can keep writing while checks finish.</p>
        </div>
      );
    }

    if (requestError) {
      return (
        <div className="gram-empty-state">
          <div className="gram-empty-icon gram-error-icon">!</div>
          <strong>Some paragraphs could not be checked</strong>
          <p>{requestError}</p>
          <button className="gram-text-action" type="button" onClick={() => checkDocument(text)}>
            Retry checks
          </button>
        </div>
      );
    }

    if (checkedParagraphCount < paragraphs.length) {
      return (
        <div className="gram-empty-state">
          <div className="gram-empty-icon">✦</div>
          <strong>Ready when you are</strong>
          <p>Pause briefly after a paragraph and its suggestions will show up here.</p>
        </div>
      );
    }

    return (
      <div className="gram-empty-state gram-all-clear">
        <div className="gram-empty-icon">✓</div>
        <strong>No suggestions</strong>
        <p>All checked paragraphs look good.</p>
      </div>
    );
  };

  if (!ready) {
    return (
      <div className="gram-loading-screen">
        <span className="gram-spinner" aria-hidden="true" />
        <span>Opening your writing space…</span>
      </div>
    );
  }

  return (
    <div className="gram-page">
      <header className="gram-topbar">
        <a className="gram-back-link" href="/" aria-label="Back to chat">
          <span aria-hidden="true">←</span>
          <span>Back</span>
        </a>
        <div className="gram-brand">
          <span className="gram-brand-icon">Aa</span>
          <span>Grammar</span>
        </div>
        <div className="gram-topbar-meta">
          {model && <span className="gram-model-pill">{model}</span>}
          <span className={`gram-live-status${pendingCount ? " is-checking" : ""}`}>
            {pendingCount > 0 ? (
              <>
                <span className="gram-spinner" aria-hidden="true" />
                Checking {pendingCount} {pendingCount === 1 ? "paragraph" : "paragraphs"}
              </>
            ) : paragraphs.length > 0 ? (
              `${checkedParagraphCount} of ${paragraphs.length} paragraphs checked`
            ) : (
              "Ready to check"
            )}
          </span>
        </div>
      </header>

      <main className="gram-layout">
        <section className="gram-editor-card" aria-label="Writing editor">
          <div className="gram-editor-heading">
            <div>
              <div className="gram-section-kicker">YOUR DOCUMENT</div>
              <h1>Write with confidence</h1>
            </div>
            <div className="gram-editor-actions">
              <button
                className="gram-button gram-button-quiet"
                type="button"
                onClick={handleTryDemo}
              >
                Try demo
              </button>
              <button
                className="gram-button gram-button-quiet"
                type="button"
                onClick={handleClear}
                disabled={!text}
              >
                Clear
              </button>
              <button
                className="gram-button gram-button-primary"
                type="button"
                onClick={handleCopyCorrected}
                disabled={!text}
              >
                Copy corrected
              </button>
            </div>
          </div>

          <div className="gram-editor-shell" ref={editorShellRef}>
            <div className="gram-text-mirror" ref={mirrorRef} aria-hidden="true">
              {overlayContent}
            </div>
            <textarea
              ref={taRef}
              className="gram-textarea"
              value={text}
              onChange={(event) => {
                setRequestError("");
                setText(event.target.value);
              }}
              onScroll={syncEditorScroll}
              onClick={handleEditorSelection}
              onKeyUp={handleEditorSelection}
              onSelect={handleEditorSelection}
              placeholder="Start writing or paste your text here…\n\nEach paragraph is checked separately."
              spellCheck={false}
              aria-label="Document text"
            />
            {activeIssue && popoverPosition && (
              <div
                className="gram-hover-card"
                style={{ left: popoverPosition.left, top: popoverPosition.top }}
                onMouseEnter={() => {
                  cancelHoverClear();
                  setHoveredIssueId(activeIssue.id);
                }}
                onMouseLeave={() => scheduleHoverClear(activeIssue.id)}
              >
                <div className="gram-hover-card-label">SUGGESTED CORRECTION</div>
                <div className="gram-hover-card-diff">
                  <del>{activeIssue.original}</del>
                  <span aria-hidden="true">→</span>
                  <strong>{activeIssue.suggestion}</strong>
                </div>
                <button
                  type="button"
                  className="gram-hover-accept"
                  onClick={() => handleAccept(activeIssue)}
                >
                  Accept correction
                </button>
              </div>
            )}
          </div>

          <div className="gram-editor-footer">
            <span>
              Paragraphs are checked separately. Checked paragraphs are cached on this device.
            </span>
            <span>{text.length.toLocaleString()} characters</span>
          </div>
        </section>

        <aside className="gram-suggestions-panel" aria-label="Grammar suggestions">
          <div className="gram-panel-heading">
            <div>
              <div className="gram-section-kicker">WRITING ASSISTANT</div>
              <h2>Suggestions</h2>
            </div>
            <span className={`gram-issue-count${issues.length ? " has-issues" : ""}`}>
              {issues.length}
            </span>
          </div>

          <div className="gram-panel-summary">
            {issues.length > 0
              ? `${issues.length} ${issues.length === 1 ? "suggestion" : "suggestions"} in ${new Set(issues.map((item) => item.paragraphNumber)).size} ${new Set(issues.map((item) => item.paragraphNumber)).size === 1 ? "paragraph" : "paragraphs"}`
              : `${checkedParagraphCount} of ${paragraphs.length} paragraphs checked`}
          </div>

          {requestError && (
            <div className="gram-error-banner" role="alert">
              <div>
                <strong>Check failed</strong>
                <span>{requestError}</span>
              </div>
              <button type="button" onClick={() => checkDocument(text)}>
                Retry
              </button>
            </div>
          )}

          <div className="gram-suggestion-list" aria-live="polite">
            {issues.length ? (
              issues.map((issue, index) => (
                <article
                  className={`gram-suggestion-card${activeIssueId === issue.id ? " is-active" : ""}`}
                  key={issue.id}
                  onMouseEnter={() => {
                    cancelHoverClear();
                    setHoveredIssueId(issue.id);
                  }}
                  onMouseLeave={() => scheduleHoverClear(issue.id)}
                >
                  <button
                    className="gram-suggestion-main"
                    type="button"
                    onClick={() => focusIssue(issue)}
                  >
                    <span className="gram-suggestion-meta">
                      <span>GRAMMAR · PARAGRAPH {issue.paragraphNumber}</span>
                      {issue.source === "demo" && <span className="gram-demo-tag">DEMO</span>}
                    </span>
                    <span className="gram-suggestion-diff">
                      <del>{issue.original}</del>
                      <span className="gram-diff-arrow" aria-hidden="true">→</span>
                      <strong>{issue.suggestion}</strong>
                    </span>
                    <span className="gram-suggestion-index">Suggestion {index + 1}</span>
                  </button>
                  <div className="gram-suggestion-actions">
                    <button
                      className="gram-accept-button"
                      type="button"
                      onClick={() => handleAccept(issue)}
                    >
                      Accept
                    </button>
                    <button
                      className="gram-ignore-button"
                      type="button"
                      onClick={() => handleIgnore(issue)}
                    >
                      Ignore
                    </button>
                  </div>
                </article>
              ))
            ) : (
              renderNoSuggestions()
            )}
          </div>

          <div className="gram-panel-footer">
            <span className="gram-cache-dot" />
            <span>Paragraph cache is local to this browser</span>
          </div>
        </aside>
      </main>
    </div>
  );
}
