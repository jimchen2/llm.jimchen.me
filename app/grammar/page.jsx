// app/grammar/page.jsx
"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Container, Button, Card, Badge } from "react-bootstrap";

const POLL_MS = 2500; // check for changes every few seconds
const CONTEXT_CHARS = 800; // how much already-checked text is sent as context
const DRAFT_KEY = "grammar_draft";
const SETTINGS_TIMEOUT_MS = 3000;

/* ------------------------------------------------------------------ */
/* Stable prefix: only complete sentences are sent to the model.      */
/* Cut back to the last ".", "!", "?" or "…". If the current          */
/* paragraph has no sentence end yet, fall back to the end of the     */
/* previous paragraph. The last broken-in words are never sent.       */
/* ------------------------------------------------------------------ */

function isSentenceEnd(text, i) {
  const ch = text[i];
  if (ch === ".") {
    // don't treat decimals like "3.14" as sentence ends
    const prev = text[i - 1] || "";
    const next = text[i + 1] || "";
    if (/\d/.test(prev) && /\d/.test(next)) return false;
    return true;
  }
  return ch === "!" || ch === "?" || ch === "…";
}

function stablePrefix(text) {
  for (let i = text.length - 1; i >= 0; i--) {
    if (isSentenceEnd(text, i)) return text.slice(0, i + 1);
  }
  const lastBreak = text.lastIndexOf("\n");
  if (lastBreak > 0 && text.slice(0, lastBreak).trim()) {
    return text.slice(0, lastBreak + 1);
  }
  return "";
}

function lcp(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/* ------------------------------------------------------------------ */
/* Rendering: ~~wrong~~ becomes red strikethrough, **right** bold.    */
/* ------------------------------------------------------------------ */

function renderGrammar(text) {
  if (!text) return "";
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const marked = esc
    .replace(/~~([^~\n]+)~~/g, '<s class="gram-del">$1</s>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong class="gram-add">$1</strong>');
  return marked
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// Plain corrected text (no marks) for the Copy button.
function stripMarks(text) {
  return text.replace(/~~[^~\n]*~~/g, "").replace(/\*\*([^*\n]*)\*\*/g, "$1");
}

/* ------------------------------------------------------------------ */

export default function GrammarPage() {
  const [ready, setReady] = useState(false);
  const [model, setModel] = useState("");
  const [text, setText] = useState("");
  const [corrected, setCorrected] = useState("");
  const [checkedLen, setCheckedLen] = useState(0);
  const [status, setStatus] = useState("idle"); // idle | checking | error
  const [statusMsg, setStatusMsg] = useState("");

  const taRef = useRef(null);
  const segsRef = useRef([]); // [{ input, output }] — corrected, in order
  const cacheRef = useRef(new Map()); // chunk input -> corrected output
  const busyRef = useRef(false);
  const lastPolledRef = useRef(""); // textarea value at the last check
  const failCountRef = useRef(0);
  const tokenRef = useRef("");
  const modelRef = useRef("");

  /* ---------------- auth: no secret → back to the frontend ---------------- */
  useEffect(() => {
    if (document.cookie.split("; ").find((row) => row.startsWith("theme=dark"))) {
      import("darkreader").then((darkreader) =>
        darkreader.enable({ brightness: 100, contrast: 90, sepia: 10 })
      );
    }

    const savedToken = localStorage.getItem("db_access_token");
    if (!savedToken) {
      // No secret stored by the frontend → redirect back to the main page.
      window.location.replace("/");
      return;
    }

    // Refresh the selected model the same way the main frontend does
    // (best-effort: the page works even if this call is slow/unavailable).
    const settingsPromise = fetch("/api/settings", {
      headers: { "x-db-token": savedToken },
    })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);

    Promise.race([
      settingsPromise,
      new Promise((resolve) =>
        setTimeout(() => resolve(null), SETTINGS_TIMEOUT_MS)
      ),
    ]).then((data) => {
      tokenRef.current = savedToken;
      modelRef.current = data?.settings?.model || "";
      setModel(modelRef.current);
      const draft = localStorage.getItem(DRAFT_KEY) || "";
      setText(draft);
      lastPolledRef.current = ""; // let the first poll pick up the restored draft
      setReady(true);
    });
  }, []);

  /* ---------------- auto-grow textarea ---------------- */
  const autoGrow = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useLayoutEffect(() => {
    autoGrow();
  }, [text, ready, autoGrow]);

  /* ---------------- the check cycle ---------------- */
  const commit = useCallback((newSegs) => {
    segsRef.current = newSegs;
    let out = "";
    let len = 0;
    for (const s of newSegs) {
      out += s.output;
      len += s.input.length;
    }
    setCorrected(out);
    setCheckedLen(len);
  }, []);

  const runCheck = useCallback(async () => {
    const el = taRef.current;
    if (!el || busyRef.current) return;

    const full = el.value;
    if (full === lastPolledRef.current) return; // no change → idle, do nothing
    lastPolledRef.current = full;

    // keep the draft so a refresh doesn't lose the text
    try {
      localStorage.setItem(DRAFT_KEY, full);
    } catch {
      /* storage full — ignore */
    }

    const stable = stablePrefix(full);
    const segs = segsRef.current;
    const oldStable = segs.reduce((s, x) => s + x.input, "");
    if (stable === oldStable) return; // complete part unchanged → cached

    // Keep the longest still-valid corrected prefix (handles edits made in
    // the middle of already-checked text).
    const common = lcp(oldStable, stable);
    const kept = [];
    let keptLen = 0;
    for (const seg of segs) {
      if (keptLen + seg.input.length <= common) {
        kept.push(seg);
        keptLen += seg.input.length;
      } else {
        break;
      }
    }

    const pending = stable.slice(keptLen);

    if (!pending) {
      // Text shrunk inside the already-checked range — just trim.
      commit(kept);
      return;
    }

    if (!pending.trim()) {
      // Only spaces/newlines were added — nothing to send to the model.
      commit([...kept, { input: pending, output: pending }]);
      return;
    }

    let output = cacheRef.current.get(pending);

    if (output === undefined) {
      busyRef.current = true;
      setStatus("checking");
      try {
        const res = await fetch("/api/grammar", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-db-token": tokenRef.current },
          body: JSON.stringify({
            text: pending,
            context: kept.map((s) => s.input).join("").slice(-CONTEXT_CHARS),
            model: modelRef.current || undefined,
          }),
        });

        if (res.status === 401) {
          // Secret became invalid → back to the frontend to re-authenticate.
          localStorage.removeItem("db_access_token");
          window.location.replace("/");
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Request failed (${res.status})`);
        }
        const data = await res.json();
        output = data.corrected ?? "";
      } catch (err) {
        busyRef.current = false;
        setStatus("error");
        setStatusMsg(err.message || "Проверка не удалась");
        // Retry a few times on the next polls, then stop until the text
        // changes again (avoids hammering a broken backend).
        if (failCountRef.current < 3) {
          failCountRef.current += 1;
          lastPolledRef.current = "";
        }
        return;
      }

      busyRef.current = false;
      failCountRef.current = 0;
      cacheRef.current.set(pending, output);
      if (cacheRef.current.size > 100) {
        cacheRef.current.delete(cacheRef.current.keys().next().value);
      }
    }

    commit([...kept, { input: pending, output }]);
    setStatus("idle");
    setStatusMsg("");
  }, [commit]);

  useEffect(() => {
    if (!ready) return;
    const t = setInterval(runCheck, POLL_MS);
    return () => clearInterval(t);
  }, [ready, runCheck]);

  /* ---------------- actions ---------------- */
  const handleCopy = () => {
    if (corrected) navigator.clipboard.writeText(stripMarks(corrected));
  };

  const handleClear = () => {
    setText("");
    segsRef.current = [];
    cacheRef.current.clear();
    lastPolledRef.current = "";
    failCountRef.current = 0;
    commit([]);
    setStatus("idle");
    setStatusMsg("");
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  };

  /* ---------------- render ---------------- */
  if (!ready) {
    return (
      <div
        className="d-flex align-items-center justify-content-center bg-light"
        style={{ height: "100dvh" }}
      >
        <span className="text-muted">Загрузка…</span>
      </div>
    );
  }

  const tail = text.slice(checkedLen); // the broken-in words waiting to be checked

  return (
    <div className="d-flex flex-column bg-light" style={{ height: "100dvh" }}>
      {/* Header */}
      <div className="bg-white border-bottom px-3 py-2 d-flex align-items-center gap-3 flex-wrap">
        <span className="fw-bold fs-5">Грамматика</span>
        <span className="text-muted small">
          исправления появляются автоматически, предложение за предложением
        </span>
        <div className="ms-auto d-flex align-items-center gap-2">
          {model && <span className="text-muted small text-nowrap">{model}</span>}
          {status === "checking" && (
            <Badge bg="primary" className="d-flex align-items-center gap-1">
              <span
                className="spinner-border spinner-border-sm"
                role="status"
                aria-hidden="true"
              />
              Проверка…
            </Badge>
          )}
          {status === "error" && <Badge bg="danger">Ошибка: {statusMsg}</Badge>}
          {status === "idle" && corrected && <Badge bg="success">✓ проверено</Badge>}
        </div>
      </div>

      {/* Body: one large input box */}
      <div className="flex-grow-1 overflow-auto">
        <Container className="px-3 px-md-4 pt-4 pb-5" style={{ maxWidth: "880px" }}>
          <div className="bg-white rounded-3 shadow-sm border p-3 p-md-4">
            <textarea
              ref={taRef}
              className="gram-textarea"
              value={text}
              onChange={(e) => {
                failCountRef.current = 0;
                setText(e.target.value);
              }}
              placeholder="Начните печатать — текст проверяется автоматически, как только вы закончите предложение…"
              spellCheck={false}
            />
          </div>

          {/* Corrected preview */}
          <Card className="mt-3 border-0 shadow-sm">
            <Card.Header className="d-flex align-items-center gap-2 py-2">
              <strong className="text-secondary">Исправленный текст</strong>
              <div className="ms-auto d-flex gap-2">
                <Button size="sm" variant="outline-secondary" onClick={handleCopy} disabled={!corrected}>
                  Копировать
                </Button>
                <Button size="sm" variant="outline-danger" onClick={handleClear} disabled={!text}>
                  Очистить
                </Button>
              </div>
            </Card.Header>
            <Card.Body className="py-3">
              {corrected ? (
                <>
                  <div
                    className="gram-preview fs-5"
                    dangerouslySetInnerHTML={{ __html: renderGrammar(corrected) }}
                  />
                  {tail && (
                    <div className="gram-tail fs-5" style={{ whiteSpace: "pre-wrap" }}>
                      {tail}
                    </div>
                  )}
                </>
              ) : (
                <span className="text-muted">
                  Исправленный текст появится здесь{tail ? ", как только будет закончено первое предложение." : ", когда вы закончите предложение."}
                </span>
              )}
            </Card.Body>
          </Card>
        </Container>
      </div>
    </div>
  );
}
