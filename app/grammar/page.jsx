// app/grammar/page.jsx
//
// llm.jimchen.me/grammar — a Grammarly-style checker.
//
// This is NOT the chat page: it is one big input box plus a suggestions panel.
// It reuses the chat frontend's access secret (localStorage "db_access_token"),
// which is sent as the x-db-token header to /api/grammar. If no (valid) secret
// is present, the visitor is redirected back to the chat frontend at "/".
//
// While the user types, the page re-checks every few seconds — but only the
// part that is already finished (up to the last "." / paragraph break), so a
// half-typed word is never "corrected". Unchanged text never triggers a call:
// the derived prefix is compared against the last one, and the server keeps a
// shared Redis cache per text.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Container,
  Form,
  ListGroup,
  Nav,
  Row,
  Spinner,
} from "react-bootstrap";
import MarkdownIt from "markdown-it";
import {
  GRAMMAR_MAX_CHARS,
  clampToSentence,
  countSentences,
  countWords,
  decideCheck,
  extractSuggestions,
  getCheckablePrefix,
  toCleanText,
} from "@/lib/grammar";

// The model output is markdown with ~~struck~~ and **bold** marks.
const md = new MarkdownIt({ breaks: true, linkify: true });

const AUTO_OPTIONS = [
  { value: 0, label: "Auto-check: off" },
  { value: 2000, label: "Auto-check: every 2s" },
  { value: 3000, label: "Auto-check: every 3s" },
  { value: 5000, label: "Auto-check: every 5s" },
  { value: 10000, label: "Auto-check: every 10s" },
];

const HOME_URL = "/";

function statusText(status, result, suggestions) {
  if (status === "checking") return "Checking…";
  if (status === "error") return "Check failed";
  if (!result) return "Waiting for text";
  if (suggestions.length === 0) return "No issues found";
  return `${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"}`;
}

export default function GrammarPage() {
  // Auth / bootstrap
  const [ready, setReady] = useState(false);
  const [model, setModel] = useState("");
  const tokenRef = useRef(null);
  const modelRef = useRef("");

  // Editor
  const [text, setText] = useState("");
  const textRef = useRef("");
  const textareaRef = useRef(null);

  // Check state
  const [status, setStatus] = useState("idle"); // idle | checking | ready | error
  const [result, setResult] = useState(null); // { checkedText, corrected, at, cached }
  const [error, setError] = useState("");
  const [autoMs, setAutoMs] = useState(3000);
  const [tab, setTab] = useState("suggestions");
  const [view, setView] = useState("markup"); // markup | clean

  // Refs used by the polling loop (never re-created on every keystroke)
  const cacheRef = useRef(new Map()); // checkedText -> { corrected, at }
  const lastRequestedRef = useRef(null); // last text we actually asked about
  const inFlightRef = useRef(false);
  const requestIdRef = useRef(0);
  const abortRef = useRef(null);
  const settleRef = useRef({ value: "", stableTicks: 0 });

  // ------------------------------------------------------------------ auth
  // No frontend secret -> straight back to the chat frontend.
  useEffect(() => {
    let cancelled = false;

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("db_access_token")
        : null;

    if (!token) {
      window.location.replace(HOME_URL);
      return;
    }

    fetch("/api/settings", { headers: { "x-db-token": token } })
      .then((res) => {
        if (!res.ok) throw new Error("unauthorized");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        tokenRef.current = token;
        const m = data?.settings?.model || "";
        modelRef.current = m;
        setModel(m);
        setReady(true);
      })
      .catch(() => {
        // Stale/invalid secret: clear it and go back to the frontend, which
        // will ask for the password again.
        localStorage.removeItem("db_access_token");
        window.location.replace(HOME_URL);
      });

    return () => {
      cancelled = true;
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // ------------------------------------------------------------- checking
  const runCheck = useCallback(async (rawText, { force = false } = {}) => {
    const token = tokenRef.current;
    if (!token || inFlightRef.current) return;

    // `force` = the user asked for a check now: use the whole text, even the
    // sentence still being typed. Otherwise only finished sentences.
    const target = force
      ? clampToSentence((rawText || "").trim(), GRAMMAR_MAX_CHARS)
      : getCheckablePrefix(rawText || "", GRAMMAR_MAX_CHARS);

    if (!target || !target.trim()) return;

    const cached = cacheRef.current.get(target);
    if (cached) {
      lastRequestedRef.current = target;
      setResult({
        checkedText: target,
        corrected: cached.corrected,
        at: cached.at,
        cached: true,
      });
      setError("");
      setStatus("ready");
      return;
    }

    // Idle / unchanged text: nothing to do, no request. (A forced check from
    // the user is allowed through, e.g. to retry after a failure.)
    if (!force && lastRequestedRef.current === target) return;

    lastRequestedRef.current = target;
    const requestId = ++requestIdRef.current;
    inFlightRef.current = true;
    setStatus("checking");
    setError("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/grammar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-db-token": token,
        },
        body: JSON.stringify({ text: target, model: modelRef.current || undefined }),
        signal: controller.signal,
      });

      if (res.status === 401) {
        localStorage.removeItem("db_access_token");
        window.location.replace(HOME_URL);
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      if (requestId !== requestIdRef.current) return;

      const corrected = data.corrected || "";
      const at = Date.now();
      cacheRef.current.set(target, { corrected, at });
      setResult({ checkedText: target, corrected, at, cached: !!data.cached });
      setStatus("ready");
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (requestId !== requestIdRef.current) return;
      setError(err?.message || "Check failed");
      setStatus("error");
    } finally {
      if (requestId === requestIdRef.current) inFlightRef.current = false;
    }
  }, []);

  // ------------------------------------------------------------- the poll
  useEffect(() => {
    if (!ready || !autoMs) return;

    const id = setInterval(() => {
      if (document.hidden) return;
      const value = textRef.current;
      if (!value || !value.trim()) return;

      // Track how long the text has been sitting still.
      const settle = settleRef.current;
      if (settle.value === value) settle.stableTicks += 1;
      else {
        settle.value = value;
        settle.stableTicks = 0;
      }

      // Decide on the shared, unit-tested rule: finished sentences only, and
      // null (= nothing at all, no request) when the text has not changed.
      const decision = decideCheck({
        text: value,
        lastRequested: lastRequestedRef.current,
        stableTicks: settle.stableTicks,
      });
      if (decision) runCheck(value, { force: decision.force });
    }, autoMs);

    return () => clearInterval(id);
  }, [ready, autoMs, runCheck]);

  // ------------------------------------------------------------ derived UI
  const suggestions = useMemo(
    () => extractSuggestions(result?.corrected || ""),
    [result]
  );
  const cleanText = useMemo(() => toCleanText(result?.corrected || ""), [result]);
  const checkedChars = result?.checkedText?.length || 0;
  const totalChars = text.length;
  const uncheckedTail = Math.max(0, totalChars - checkedChars);
  const overLimit = totalChars > GRAMMAR_MAX_CHARS;

  // -------------------------------------------------------------- actions
  const handleChange = (e) => {
    const value = e.target.value;
    setText(value);
    textRef.current = value;
  };

  const handleCopy = async () => {
    const payload = cleanText || text;
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleApply = () => {
    if (!result || !cleanText) return;
    // Applied text is already correct: remember it so the poll loop stays
    // quiet instead of immediately re-checking the same thing.
    const next = cleanText;
    cacheRef.current.set(next, { corrected: result.corrected, at: Date.now() });
    lastRequestedRef.current = next;
    settleRef.current = { value: next, stableTicks: 0 };
    setText(next);
    textRef.current = next;
    setResult({ ...result, checkedText: next });
    setStatus("ready");
    textareaRef.current?.focus();
  };

  const handleClear = () => {
    setText("");
    textRef.current = "";
    setResult(null);
    setError("");
    setStatus("idle");
    lastRequestedRef.current = null;
    settleRef.current = { value: "", stableTicks: 0 };
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      runCheck(text, { force: true });
    }
  };

  const checking = status === "checking";

  // While the secret is being validated, render nothing but a spinner so a
  // redirect to "/" never flashes the UI.
  if (!ready) {
    return (
      <div
        className="d-flex align-items-center justify-content-center bg-light"
        style={{ height: "100dvh" }}
      >
        <Spinner animation="border" role="status" />
      </div>
    );
  }

  return (
    <div className="d-flex flex-column bg-light" style={{ minHeight: "100dvh" }}>
      {/* ------------------------------------------------ top bar */}
      <div className="bg-white border-bottom sticky-top">
        <Container fluid="xl" className="py-2 d-flex align-items-center gap-2 gap-md-3">
          <a
            href={HOME_URL}
            className="text-decoration-none text-dark d-flex align-items-center gap-2"
            title="Back to the chat frontend"
          >
            <span
              className="d-inline-flex align-items-center justify-content-center rounded-circle bg-success text-white fw-bold"
              style={{ width: 28, height: 28, fontSize: 15 }}
            >
              ✓
            </span>
            <span className="fw-bold">Grammar</span>
          </a>

          <Badge bg="light" text="secondary" className="d-none d-md-inline">
            llm.jimchen.me/grammar
          </Badge>

          <div className="ms-auto d-flex align-items-center gap-2">
            {model && (
              <Badge bg="light" text="secondary" className="d-none d-sm-inline">
                {model}
              </Badge>
            )}
            <Form.Select
              size="sm"
              value={autoMs}
              onChange={(e) => setAutoMs(Number(e.target.value))}
              style={{ width: "auto" }}
              aria-label="Auto-check interval"
            >
              {AUTO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Form.Select>
            <Button
              size="sm"
              variant="outline-secondary"
              href={HOME_URL}
              className="d-none d-sm-inline-block"
            >
              ← Chat
            </Button>
          </div>
        </Container>
      </div>

      {/* ------------------------------------------------ body */}
      <Container fluid="xl" className="py-3 py-md-4 flex-grow-1">
        <Row className="g-3 g-md-4">
          {/* ---------------- the big input box ---------------- */}
          <Col lg={7} className="d-flex">
            <Card className="shadow-sm border-0 w-100">
              <Card.Header className="bg-white border-0 pt-3 pb-0 d-flex align-items-center gap-2">
                <strong className="text-secondary">Your text</strong>
                <span className="ms-auto small text-muted">
                  {countWords(text)} words · {countSentences(text)} sentences ·{" "}
                  <span className={overLimit ? "text-danger fw-bold" : ""}>
                    {totalChars}/{GRAMMAR_MAX_CHARS}
                  </span>
                </span>
              </Card.Header>

              <Card.Body className="pb-2 d-flex flex-column">
                <Form.Control
                  ref={textareaRef}
                  as="textarea"
                  rows={14}
                  autoFocus
                  spellCheck={false}
                  className="shadow-none flex-grow-1"
                  style={{
                    minHeight: "46vh",
                    resize: "vertical",
                    lineHeight: 1.7,
                    fontSize: "1.05rem",
                  }}
                  placeholder="Начните печатать или вставьте текст…"
                  value={text}
                  onChange={handleChange}
                  onKeyDown={handleKeyDown}
                />

                <div className="small text-muted mt-2">
                  Only finished sentences are checked while you type — the sentence
                  you are still writing is skipped (text with no “.” yet is checked
                  once you pause).{" "}
                  <kbd className="small">Ctrl</kbd>/<kbd className="small">⌘</kbd>
                  {" + "}
                  <kbd className="small">Enter</kbd> checks everything right now.
                </div>

                {overLimit && (
                  <Alert variant="warning" className="py-2 px-3 small mt-2 mb-0">
                    Text is longer than {GRAMMAR_MAX_CHARS} characters — only the
                    first part is checked.
                  </Alert>
                )}
              </Card.Body>

              <Card.Footer className="bg-white border-0 d-flex flex-wrap align-items-center gap-2 pb-3">
                <Button
                  variant="success"
                  className="fw-bold px-3"
                  onClick={() => runCheck(text, { force: true })}
                  disabled={checking || !text.trim()}
                >
                  {checking ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" />
                      Checking…
                    </>
                  ) : (
                    "Check now"
                  )}
                </Button>
                <Button
                  variant="outline-secondary"
                  onClick={() => runCheck(text)}
                  disabled={checking || !text.trim()}
                >
                  Check finished sentences
                </Button>
                <div className="ms-auto d-flex gap-2">
                  <Button variant="outline-secondary" onClick={handleCopy} disabled={!text}>
                    Copy
                  </Button>
                  <Button variant="outline-danger" onClick={handleClear} disabled={!text}>
                    Clear
                  </Button>
                </div>
              </Card.Footer>
            </Card>
          </Col>

          {/* ---------------- suggestions panel ---------------- */}
          <Col lg={5}>
            <Card className="shadow-sm border-0">
              <Card.Header className="bg-white border-0 pt-3 d-flex align-items-center gap-2">
                <strong className="text-secondary">Suggestions</strong>
                {checking && <Spinner animation="grow" size="sm" variant="success" />}
                <span className="ms-auto d-flex align-items-center gap-2">
                  {result?.cached && (
                    <Badge bg="light" text="secondary">
                      cache
                    </Badge>
                  )}
                  <Badge
                    bg={
                      status === "error"
                        ? "danger"
                        : result && suggestions.length === 0
                        ? "success"
                        : "secondary"
                    }
                  >
                    {statusText(status, result, suggestions)}
                  </Badge>
                </span>
              </Card.Header>

              <Card.Body>
                {status === "error" && (
                  <Alert variant="danger" className="py-2 px-3 small">
                    {error}
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={() => runCheck(text, { force: true })}
                      >
                        Retry
                      </Button>
                    </div>
                  </Alert>
                )}

                {!result && status !== "error" && (
                  <div className="text-muted small">
                    {text.trim()
                      ? "Waiting for a finished sentence… Type a “.” or press “Check now”."
                      : "Type or paste something. The text is checked as you write, complete sentences only."}
                  </div>
                )}

                {result && (
                  <>
                    <Nav
                      variant="pills"
                      activeKey={tab}
                      onSelect={(k) => setTab(k)}
                      className="mb-3 small"
                    >
                      <Nav.Item>
                        <Nav.Link eventKey="suggestions" className="py-1 px-3">
                          Suggestions
                          {suggestions.length > 0 && (
                            <Badge bg="success" pill className="ms-2">
                              {suggestions.length}
                            </Badge>
                          )}
                        </Nav.Link>
                      </Nav.Item>
                      <Nav.Item>
                        <Nav.Link eventKey="corrected" className="py-1 px-3">
                          Corrected text
                        </Nav.Link>
                      </Nav.Item>
                    </Nav>

                    {tab === "suggestions" && (
                      <>
                        {suggestions.length === 0 ? (
                          <Alert variant="success" className="py-2 px-3 small mb-0">
                            No grammar issues found in the checked part. 🎉
                          </Alert>
                        ) : (
                          <ListGroup variant="flush">
                            {suggestions.map((s, i) => (
                              <ListGroup.Item
                                key={`${s.from}-${s.to}-${i}`}
                                className="px-0 py-2 bg-transparent"
                              >
                                <div className="d-flex align-items-center gap-2 flex-wrap">
                                  {s.from ? (
                                    <s className="text-danger">{s.from}</s>
                                  ) : (
                                    <Badge bg="light" text="secondary">
                                      insert
                                    </Badge>
                                  )}
                                  <span className="text-muted">→</span>
                                  <strong className="text-success">
                                    {s.to || "(delete)"}
                                  </strong>
                                  <Badge
                                    bg="light"
                                    text="secondary"
                                    className="ms-auto text-uppercase"
                                    style={{ fontSize: "0.65rem" }}
                                  >
                                    {s.type}
                                  </Badge>
                                </div>
                              </ListGroup.Item>
                            ))}
                          </ListGroup>
                        )}
                      </>
                    )}

                    {tab === "corrected" && (
                      <>
                        <div className="d-flex align-items-center gap-2 mb-2">
                          <div className="btn-group btn-group-sm">
                            <Button
                              size="sm"
                              variant={view === "markup" ? "secondary" : "outline-secondary"}
                              onClick={() => setView("markup")}
                            >
                              Markup
                            </Button>
                            <Button
                              size="sm"
                              variant={view === "clean" ? "secondary" : "outline-secondary"}
                              onClick={() => setView("clean")}
                            >
                              Clean
                            </Button>
                          </div>
                          <div className="ms-auto d-flex gap-2">
                            <Button size="sm" variant="outline-primary" onClick={handleCopy}>
                              Copy
                            </Button>
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={handleApply}
                              disabled={!cleanText}
                            >
                              Apply to editor
                            </Button>
                          </div>
                        </div>

                        {view === "markup" ? (
                          <div
                            className="grammar-preview fs-6"
                            dangerouslySetInnerHTML={{ __html: md.render(result.corrected) }}
                          />
                        ) : (
                          <div className="grammar-clean small">{cleanText}</div>
                        )}
                      </>
                    )}

                    <hr className="my-3" />
                    <div className="small text-muted">
                      Checked {checkedChars} of {totalChars} characters
                      {uncheckedTail > 0 && <> · {uncheckedTail} still typing</>}
                      {result.at && (
                        <> · {new Date(result.at).toLocaleTimeString()}</>
                      )}
                    </div>
                  </>
                )}
              </Card.Body>
            </Card>

            <div className="small text-muted mt-3 px-1">
              Suggestions are produced by the same model as the chat page, with the
              grammar prompt. Nothing is ever sent before you finish a sentence, and
              identical text is served from the server cache.
            </div>
          </Col>
        </Row>
      </Container>
    </div>
  );
}
