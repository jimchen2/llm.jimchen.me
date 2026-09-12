// app/page.jsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Container, Button, Form, InputGroup, Offcanvas, Modal, ButtonGroup, Badge } from "react-bootstrap";
import Sidebar from "../components/Sidebar";
import SettingsModal from "../components/SettingsModal";
import MessageNode from "../components/MessageNode";
import { DEFAULT_MODE, MODES, MODE_LIST, normalizeMode } from "../lib/modes";
import { DEV_ACCESS_TOKEN, FALLBACK_MODEL, IS_DEV } from "../lib/config";

const ChatInput = ({ onSend, placeholder }) => {
  const [input, setInput] = useState("");
  const textareaRef = useRef(null);

  const submitMessage = () => {
    if (!input.trim()) return;
    onSend(input);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  };

  return (
    <InputGroup>
      <Form.Control
        ref={textareaRef}
        as="textarea"
        rows={1}
        className="shadow-none border-secondary fs-5"
        autoFocus
        style={{ resize: "none", maxHeight: "200px", overflowY: "auto" }}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      <Button variant="primary" className="px-3 px-md-4 fw-bold" onClick={submitMessage}>
        Send
      </Button>
    </InputGroup>
  );
};

// Mode switcher. A mode is fixed for the lifetime of a conversation, so this is
// only interactive while composing a brand new chat.
const ModePicker = ({ mode, setMode, locked }) => (
  <div className="d-flex align-items-center flex-wrap gap-2 mb-2">
    <ButtonGroup size="sm">
      {MODE_LIST.map((m) => (
        <Button
          key={m.id}
          variant={mode === m.id ? "primary" : "outline-secondary"}
          onClick={() => !locked && setMode(m.id)}
          disabled={locked}
          title={m.hint}
        >
          {m.icon} Mode {m.number}: {m.label}
        </Button>
      ))}
    </ButtonGroup>
    <small className="text-muted">
      {locked
        ? "Conversation mode is fixed — start a new chat to switch."
        : MODES[mode].hint}
    </small>
    {IS_DEV && (
      <Badge bg="warning" text="dark">
        dev · no API key needed
      </Badge>
    )}
  </div>
);

export default function App() {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState({});
  const [currentId, setCurrentId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Mode of the conversation being viewed / composed (defaults to tech mode).
  const [mode, setMode] = useState(DEFAULT_MODE);

  // Authentication Modal State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [inputPassword, setInputPassword] = useState("");
  const [authError, setAuthError] = useState("");

  // Pagination states
  const [hasMoreConv, setHasMoreConv] = useState(true);
  const [isLoadingConv, setIsLoadingConv] = useState(false);

  const isInitializedRef = useRef(false);

  // No API key and no system prompt live in the browser anymore: they are
  // configured on the server (.env) and only referenced by mode.
  const [settings, setSettings] = useState({
    dbToken: "",
    modelOverride: "",
    defaultModel: FALLBACK_MODEL,
    modes: [],
    defaultMode: DEFAULT_MODE,
    devMode: IS_DEV,
  });

  const endOfMessagesRef = useRef(null);
  // The edit handler below is registered once, on mount, so it reads the token
  // from a ref instead of from a stale closure.
  const dbTokenRef = useRef("");

  const modesById = settings.modes.reduce((acc, m) => ({ ...acc, [m.id]: m }), {});
  const activeModelName = modesById[mode]?.model || settings.modelOverride || settings.defaultModel;

  const displayNameFor = (msg) => {
    if (msg.role === "user") return "You";
    if (msg.model) return `${msg.model} · ${MODES[normalizeMode(msg.mode ?? mode)].label}`;
    return activeModelName;
  };

  const fetchRemoteSettings = async (token) => {
    try {
      const res = await fetch("/api/settings", {
        headers: { "x-db-token": token },
      });
      if (!res.ok) throw new Error("Invalid password");

      const data = await res.json();
      if (data.settings) {
        setSettings((prev) => ({
          ...prev,
          dbToken: token,
          modelOverride: data.settings.modelOverride ?? "",
          defaultModel: data.settings.defaultModel ?? FALLBACK_MODEL,
          modes: data.settings.modes ?? [],
          defaultMode: normalizeMode(data.settings.defaultMode),
          devMode: !!data.settings.devMode,
        }));
      } else {
        setSettings((prev) => ({ ...prev, dbToken: token }));
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleOpenSettings = async () => {
    if (settings.dbToken) {
      await fetchRemoteSettings(settings.dbToken);
    }
    setShowSettings(true);
  };

  const initializeApp = async (token) => {
    loadConversations(token, 0);

    const pathname = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    let urlId = params.get("chat");

    if (pathname.startsWith("/chat/")) {
      urlId = pathname.split("/chat/")[1];
    }

    if (urlId) {
      openConversation(token, urlId);
    }
    isInitializedRef.current = true;
  };

  useEffect(() => {
    dbTokenRef.current = settings.dbToken;
  }, [settings.dbToken]);

  useEffect(() => {
    if (document.cookie.split("; ").find((row) => row.startsWith("theme=dark"))) {
      import("darkreader").then((darkreader) => {
        darkreader.enable({ brightness: 100, contrast: 90, sepia: 10 });
      });
    }

    // In development the app never asks for a password: it authenticates with
    // the built-in dev token and the backend serves the fixed mock answers.
    const savedToken = localStorage.getItem("db_access_token") || (IS_DEV ? DEV_ACCESS_TOKEN : null);
    if (!savedToken) {
      setShowAuthModal(true);
    } else {
      fetchRemoteSettings(savedToken).then((success) => {
        if (success) {
          initializeApp(savedToken);
        } else {
          localStorage.removeItem("db_access_token");
          setShowAuthModal(true);
        }
      });
    }

    const handleSaveEdit = async (e) => {
      const { id, content } = e.detail;
      await fetch("/api/messages", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-db-token": dbTokenRef.current },
        body: JSON.stringify({ id, content }),
      });
      setMessages((prev) => ({ ...prev, [id]: { ...prev[id], content } }));
    };
    window.addEventListener("save-message-edit", handleSaveEdit);
    return () => window.removeEventListener("save-message-edit", handleSaveEdit);
  }, []);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    const success = await fetchRemoteSettings(inputPassword);
    if (success) {
      localStorage.setItem("db_access_token", inputPassword);
      setShowAuthModal(false);
      initializeApp(inputPassword);
    } else {
      setAuthError("Invalid access password");
    }
  };

  useEffect(() => {
    if (!isInitializedRef.current) return;

    if (activeConversation) {
      window.history.pushState({}, "", `/chat/${activeConversation}`);
    } else {
      window.history.pushState({}, "", `/`);
    }
  }, [activeConversation]);

  const loadConversations = (dbToken, offset = 0) => {
    setIsLoadingConv(true);
    fetch(`/api/conversations?offset=${offset}&limit=10`, { headers: { "x-db-token": dbToken } })
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          if (offset === 0) {
            setConversations(data);
          } else {
            setConversations((prev) => [...prev, ...data]);
          }
          setHasMoreConv(data.length === 10);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoadingConv(false));
  };

  // Opening a conversation restores its stored mode: a random conversation is
  // always a random conversation, a tech conversation is always tech.
  const openConversation = async (dbToken, convId) => {
    try {
      const [convRes, msgsRes] = await Promise.all([
        fetch(`/api/conversations?id=${convId}`, { headers: { "x-db-token": dbToken } }),
        fetch(`/api/messages?conversationId=${convId}`, { headers: { "x-db-token": dbToken } }),
      ]);

      const conv = await convRes.json();
      const data = await msgsRes.json();
      if (!data || data.error) return;

      const msgMap = {};
      let lastId = null;
      data.forEach((m) => {
        msgMap[m.id] = m;
        lastId = m.id;
      });
      setMessages(msgMap);
      setCurrentId(lastId);
      setActiveConversation(convId);
      setMode(normalizeMode(conv?.mode));
      setShowMobileMenu(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleNewChat = () => {
    setActiveConversation(null);
    setMessages({});
    setCurrentId(null);
    setMode(settings.defaultMode || DEFAULT_MODE); // new chats always start in tech mode
    setShowMobileMenu(false);
  };

  const handleDeleteConversation = async (e, id) => {
    e.stopPropagation();
    if (!confirm("Delete this entire conversation?")) return;
    await fetch("/api/conversations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-db-token": settings.dbToken },
      body: JSON.stringify({ id }),
    });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversation === id) handleNewChat();
  };

  const saveSettings = async () => {
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-db-token": settings.dbToken,
        },
        body: JSON.stringify({
          modelOverride: settings.modelOverride,
        }),
      });

      if (!res.ok) {
        alert("Failed to sync settings to Redis.");
        return;
      }
      setShowSettings(false);
    } catch (err) {
      alert(`Error updating settings: ${err.message}`);
    }
  };

  const getActivePath = () => {
    const path = [];
    let curr = currentId;
    while (curr && messages[curr]) {
      path.unshift(messages[curr]);
      curr = messages[curr].parent_id;
    }
    return path;
  };

  const scrollToBottom = () => endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => {
    scrollToBottom();
  }, [currentId]);

  const generateId = () => Math.random().toString(36).substring(2, 15);

  const sendMessage = async (text = null, parentOverride = null, isBotRetry = false) => {
    if ((!text?.trim() && !isBotRetry) || !settings.dbToken) {
      if (!settings.dbToken) alert("Access password is required.");
      return;
    }

    const content = text || "";
    let convId = activeConversation;
    const isNewConv = !convId;

    if (isNewConv) {
      convId = generateId();
    }

    // The mode is decided when the conversation is created and never changes.
    const convMode = normalizeMode(mode);

    const parentId = parentOverride !== null ? parentOverride : currentId;
    const userMsgId = generateId();
    const botMsgId = generateId();

    const newMsgs = { ...messages };

    if (!isBotRetry) {
      newMsgs[userMsgId] = { id: userMsgId, parent_id: parentId, role: "user", content, mode: convMode };
    }
    newMsgs[botMsgId] = {
      id: botMsgId,
      parent_id: isBotRetry ? parentId : userMsgId,
      role: "assistant",
      content: "",
      mode: convMode,
      model: modesById[convMode]?.model || activeModelName,
    };

    setMessages(newMsgs);
    setCurrentId(botMsgId);

    const title = content ? content.substring(0, 30) + (content.length > 30 ? "..." : "") : "New Chat";
    if (isNewConv) {
      setActiveConversation(convId);
      setConversations((prev) => [{ id: convId, title, mode: convMode }, ...prev]);
    }

    const path = [];
    let curr = isBotRetry ? parentId : userMsgId;
    while (curr && newMsgs[curr]) {
      path.unshift({ role: newMsgs[curr].role, content: newMsgs[curr].content });
      curr = newMsgs[curr].parent_id;
    }
    // No system prompt is added here: the server picks the one that belongs to
    // the conversation's mode (and mode 2 sends none at all).

    try {
      if (isNewConv) {
        await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-db-token": settings.dbToken },
          body: JSON.stringify({ id: convId, title, mode: convMode }),
        });
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-db-token": settings.dbToken },
        body: JSON.stringify({
          messages: path,
          userMsgId: isBotRetry ? null : userMsgId,
          botMsgId,
          parentId,
          conversationId: convId,
          mode: convMode,
          model: settings.modelOverride || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const source = new EventSource(`/api/chatstream?id=${botMsgId}&dbToken=${encodeURIComponent(settings.dbToken)}`);

      source.onmessage = (e) => {
        // "[DONE]" is the end-of-answer marker: close the stream ourselves so
        // the browser does not try to reconnect to a finished answer.
        if (e.data === "[DONE]") {
          source.close();
          return;
        }
        let chunk;
        try {
          chunk = JSON.parse(e.data);
        } catch {
          return;
        }
        setMessages((prev) => ({
          ...prev,
          [botMsgId]: { ...prev[botMsgId], content: prev[botMsgId].content + chunk },
        }));
      };

      source.onerror = () => {
        source.close();
        setMessages((prev) => {
          const currentContent = prev[botMsgId]?.content || "";
          if (!currentContent) {
            return {
              ...prev,
              [botMsgId]: {
                ...prev[botMsgId],
                content: `⚠️ **Network Error:** Connection lost to the stream.`,
              },
            };
          }
          return prev;
        });
      };
    } catch (error) {
      setMessages((prev) => ({
        ...prev,
        [botMsgId]: {
          ...prev[botMsgId],
          content: `⚠️ **Network Error:** Failed to send message.\n\n\`${error.message}\``,
        },
      }));
    }
  };

  const handleCopy = (text) => navigator.clipboard.writeText(text);

  const handleBranch = async (msgId) => {
    if (!settings.dbToken) return;
    const path = [];
    let curr = msgId;
    while (curr && messages[curr]) {
      path.unshift(messages[curr]);
      curr = messages[curr].parent_id;
    }

    const newConvId = generateId();
    const title = "Branch: " + (conversations.find((c) => c.id === activeConversation)?.title || "New");
    // Branches inherit the mode of the conversation they were branched from.
    const branchMode = normalizeMode(messages[msgId]?.mode ?? mode);

    try {
      await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-db-token": settings.dbToken },
        body: JSON.stringify({ id: newConvId, title, mode: branchMode }),
      });

      const newMessages = [];
      let lastNewId = null;
      const idMap = {};
      let time = Date.now();

      for (const m of path) {
        const newId = generateId();
        idMap[m.id] = newId;
        newMessages.push({
          id: newId,
          conversation_id: newConvId,
          parent_id: m.parent_id ? idMap[m.parent_id] : null,
          role: m.role,
          content: m.content,
          mode: m.mode ?? branchMode,
          model: m.model,
          created_at: time++,
        });
        lastNewId = newId;
      }

      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-db-token": settings.dbToken },
        body: JSON.stringify({ messages: newMessages }),
      });

      setConversations((prev) => [{ id: newConvId, title, mode: branchMode }, ...prev]);
      setActiveConversation(newConvId);
      setMode(branchMode);

      const msgMap = {};
      newMessages.forEach((m) => (msgMap[m.id] = m));
      setMessages(msgMap);
      setCurrentId(lastNewId);
    } catch {
      alert("Network Error: Could not branch conversation.");
    }
  };

  const deleteMessage = async (msgId, skipConfirm = false) => {
    if (!skipConfirm && !confirm("Delete this message?")) return false;

    const msgToDelete = messages[msgId];
    const parentId = msgToDelete ? msgToDelete.parent_id : null;

    try {
      await fetch("/api/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-db-token": settings.dbToken },
        body: JSON.stringify({ id: msgId }),
      });
    } catch (error) {
      console.warn("Local deletion only:", error);
    }

    const newMsgs = { ...messages };
    Object.values(newMsgs).forEach((m) => {
      if (m.parent_id === msgId) {
        m.parent_id = parentId;
      }
    });

    delete newMsgs[msgId];
    setMessages(newMsgs);

    if (currentId === msgId) {
      setCurrentId(parentId);
    }

    return true;
  };

  const handleRetry = async (msgId) => {
    const msg = messages[msgId];
    if (!msg) return;
    const parentId = msg.parent_id;
    const deleted = await deleteMessage(msgId, true);
    if (!deleted) return;
    sendMessage(null, parentId, true);
  };

  const getSiblings = (msgId, parentId) => {
    const siblings = Object.values(messages).filter((m) => m.parent_id === parentId);
    return { siblings, index: siblings.findIndex((m) => m.id === msgId) };
  };

  const switchBranch = (siblingId) => {
    let leaf = siblingId,
      found = true;
    while (found) {
      const child = Object.values(messages).find((m) => m.parent_id === leaf);
      if (child) leaf = child.id;
      else found = false;
    }
    setCurrentId(leaf);
  };

  const activePath = getActivePath();

  return (
    <Container fluid className="p-0 overflow-hidden d-flex" style={{ height: "100dvh" }}>
      {/* Access Password Prompt Modal */}
      <Modal show={showAuthModal} backdrop="static" keyboard={false} centered>
        <Modal.Header>
          <Modal.Title>Access Required</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleAuthSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Access Password</Form.Label>
              <Form.Control
                type="password"
                placeholder="Enter access password"
                value={inputPassword}
                onChange={(e) => setInputPassword(e.target.value)}
                autoFocus
                required
              />
              {authError && <div className="text-danger mt-2 small">{authError}</div>}
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="primary" type="submit">
              Authenticate
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Desktop Sidebar */}
      <div className="d-none d-md-block" style={{ width: "280px" }}>
        <Sidebar
          conversations={conversations}
          activeConversation={activeConversation}
          handleNewChat={handleNewChat}
          openConversation={openConversation}
          handleDeleteConversation={handleDeleteConversation}
          setShowSettings={handleOpenSettings}
          dbToken={settings.dbToken}
          loadMore={() => loadConversations(settings.dbToken, conversations.length)}
          hasMore={hasMoreConv}
          isLoading={isLoadingConv}
        />
      </div>

      {/* Mobile Sidebar */}
      <Offcanvas
        show={showMobileMenu}
        onHide={() => setShowMobileMenu(false)}
        placement="start"
        className="bg-dark text-light w-75"
      >
        <Offcanvas.Header closeButton closeVariant="white">
          <Offcanvas.Title>Chats</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="p-0">
          <Sidebar
            conversations={conversations}
            activeConversation={activeConversation}
            handleNewChat={handleNewChat}
            openConversation={openConversation}
            handleDeleteConversation={handleDeleteConversation}
            setShowSettings={handleOpenSettings}
            dbToken={settings.dbToken}
            loadMore={() => loadConversations(settings.dbToken, conversations.length)}
            hasMore={hasMoreConv}
            isLoading={isLoadingConv}
          />
        </Offcanvas.Body>
      </Offcanvas>

      <SettingsModal
        show={showSettings}
        onHide={() => setShowSettings(false)}
        settings={settings}
        setSettings={setSettings}
        onSave={saveSettings}
      />

      {/* Main Area */}
      <div className="d-flex flex-column bg-white h-100 flex-grow-1 position-relative">
        <div className="d-md-none p-2 border-bottom d-flex align-items-center bg-light">
          <Button variant="outline-dark" size="sm" onClick={() => setShowMobileMenu(true)}>
            ☰ Menu
          </Button>
          <span className="ms-3 fw-bold">Chat</span>
        </div>

        <div className="flex-grow-1 overflow-auto p-3 p-md-4 bg-light">
          {activePath.length === 0 ? (
            <div className="h-100 d-flex flex-column justify-content-center align-items-center">
              <h3 className="text-muted text-center">{MODES[mode].emptyState}</h3>
              <small className="text-secondary mt-2">
                Mode {MODES[mode].number} · {MODES[mode].label} — {MODES[mode].hint}
              </small>
            </div>
          ) : (
            <Container className="px-0" style={{ maxWidth: "800px" }}>
              {activePath.map((msg) => {
                const { siblings, index } = getSiblings(msg.id, msg.parent_id);
                return (
                  <MessageNode
                    key={msg.id}
                    msg={msg}
                    siblings={siblings}
                    index={index}
                    switchBranch={switchBranch}
                    handleCopy={handleCopy}
                    handleBranch={handleBranch}
                    handleRetry={handleRetry}
                    deleteMessage={deleteMessage}
                    modelName={displayNameFor(msg)}
                  />
                );
              })}
              <div ref={endOfMessagesRef} />
            </Container>
          )}
        </div>

        <div className="p-3 bg-white border-top">
          <Container className="px-0" style={{ maxWidth: "800px" }}>
            <ModePicker mode={mode} setMode={setMode} locked={!!activeConversation} />
            <ChatInput key={activeConversation || `new-chat-${mode}`} onSend={(text) => sendMessage(text)} placeholder={MODES[mode].placeholder} />
          </Container>
        </div>
      </div>
    </Container>
  );
}
