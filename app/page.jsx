// app/page.jsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Container, Button, Form, InputGroup, Offcanvas, Modal } from "react-bootstrap";
import Sidebar from "../components/Sidebar";
import SettingsModal from "../components/SettingsModal";
import MessageNode from "../components/MessageNode";
import { DEFAULT_MODEL, DEFAULT_MODE, MODE_RANDOM, normalizeMode } from "@/lib/constants";

// Development test runs: no access password and no API keys required.
const IS_DEV = process.env.NODE_ENV !== "production";

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
        placeholder={placeholder || "Please only talk about coding"}
      />
      <Button variant="primary" className="px-3 px-md-4 fw-bold" onClick={submitMessage}>
        Send
      </Button>
    </InputGroup>
  );
};

export default function App() {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState({});
  const [currentId, setCurrentId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Authentication Modal State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [inputPassword, setInputPassword] = useState("");
  const [authError, setAuthError] = useState("");

  // Pagination states
  const [hasMoreConv, setHasMoreConv] = useState(true);
  const [isLoadingConv, setIsLoadingConv] = useState(false);

  const isInitializedRef = useRef(false);

  // Mode state: the mode belongs to the conversation.
  // - newChatMode: the mode picked for a brand new conversation (default tech)
  // - convMode: the stored mode of the conversation that is currently open
  const [newChatMode, setNewChatMode] = useState(DEFAULT_MODE);
  const [convMode, setConvMode] = useState(null);

  const [settings, setSettings] = useState({
    model: DEFAULT_MODEL,
    defaultMode: DEFAULT_MODE,
    dbToken: "",
  });

  const endOfMessagesRef = useRef(null);

  // Once a conversation exists its mode is fixed; only a new chat can choose.
  const activeMode = activeConversation ? normalizeMode(convMode) : newChatMode;
  const modeLocked = !!activeConversation;

  const fetchRemoteSettings = async (token) => {
    try {
      const res = await fetch("/api/settings", {
        headers: { "x-db-token": token },
      });
      if (!res.ok) throw new Error("Invalid password");

      const data = await res.json();
      if (data.settings) {
        const serverDefaultMode = normalizeMode(data.settings.defaultMode);
        setSettings((prev) => ({
          dbToken: token,
          model: data.settings.model || DEFAULT_MODEL,
          defaultMode: serverDefaultMode,
        }));
        // The saved default mode applies to the next new conversation.
        setNewChatMode(serverDefaultMode);
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
      loadMessages(token, urlId);
    }
    isInitializedRef.current = true;
  };

  useEffect(() => {
    if (document.cookie.split("; ").find((row) => row.startsWith("theme=dark"))) {
      import("darkreader").then((darkreader) => {
        darkreader.enable({ brightness: 100, contrast: 90, sepia: 10 });
      });
    }

    if (IS_DEV) {
      // Test run: no keys asked for — go straight into the app.
      fetchRemoteSettings("dev").then(() => initializeApp("dev"));
    } else {
      const savedToken = localStorage.getItem("db_access_token");
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
    }

    const handleSaveEdit = async (e) => {
      const { id, content } = e.detail;
      await fetch("/api/messages", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-db-token": settings.dbToken },
        body: JSON.stringify({ id, content }),
      });
      setMessages((prev) => ({ ...prev, [id]: { ...prev[id], content } }));
    };
    window.addEventListener("save-message-edit", handleSaveEdit);
    return () => window.removeEventListener("save-message-edit", handleSaveEdit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const loadMessages = (dbToken, convId) => {
    fetch(`/api/messages?conversationId=${convId}`, { headers: { "x-db-token": dbToken } })
      .then((r) => r.json())
      .then((data) => {
        if (!data || data.error) return;
        const msgMap = {};
        let lastId = null;
        (data.messages || []).forEach((m) => {
          msgMap[m.id] = m;
          lastId = m.id;
        });
        setMessages(msgMap);
        setCurrentId(lastId);
        // Reopening a conversation always restores its own stored mode.
        setConvMode(normalizeMode(data.conversation?.mode));
        setActiveConversation(convId);
        setShowMobileMenu(false);
      })
      .catch(console.error);
  };

  const handleNewChat = () => {
    setActiveConversation(null);
    setMessages({});
    setCurrentId(null);
    // New conversations use the default mode saved in Settings (tech by default).
    setConvMode(null);
    setNewChatMode(normalizeMode(settings.defaultMode));
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

  // The mode picker lives in Settings: on a new chat it chooses (and becomes)
  // the default mode for new conversations; an open conversation is locked.
  const handleModeChange = (m) => {
    setNewChatMode(m);
    setSettings((prev) => ({ ...prev, defaultMode: m }));
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
          model: settings.model,
          defaultMode: settings.defaultMode,
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
      if (!settings.dbToken) alert("Please authenticate first.");
      return;
    }

    // The mode is a property of the conversation: locked in when it is created.
    const mode = activeConversation ? normalizeMode(convMode) : newChatMode;

    const content = text || "";
    let convId = activeConversation;
    const isNewConv = !convId;

    if (isNewConv) {
      convId = generateId();
    }

    const parentId = parentOverride !== null ? parentOverride : currentId;
    const userMsgId = generateId();
    const botMsgId = generateId();

    const newMsgs = { ...messages };

    if (!isBotRetry) {
      newMsgs[userMsgId] = { id: userMsgId, parent_id: parentId, role: "user", content };
    }
    newMsgs[botMsgId] = { id: botMsgId, parent_id: isBotRetry ? parentId : userMsgId, role: "assistant", content: "" };

    setMessages(newMsgs);
    setCurrentId(botMsgId);

    const title = content ? content.substring(0, 30) + (content.length > 30 ? "..." : "") : "New Chat";
    if (isNewConv) {
      setActiveConversation(convId);
      setConvMode(mode);
      setConversations((prev) => [{ id: convId, title, mode }, ...prev]);
    }

    // NOTE: no system message here — the backend attaches the right system
    // prompt (or none, for random mode) based on the conversation's mode.
    const path = [];
    let curr = isBotRetry ? parentId : userMsgId;
    while (curr && newMsgs[curr]) {
      path.unshift({ role: newMsgs[curr].role, content: newMsgs[curr].content });
      curr = newMsgs[curr].parent_id;
    }

    try {
      if (isNewConv) {
        await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-db-token": settings.dbToken },
          body: JSON.stringify({ id: convId, title, mode }),
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
          model: settings.model,
          mode,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const source = new EventSource(`/api/chatstream?id=${botMsgId}&dbToken=${encodeURIComponent(settings.dbToken)}`);

      source.onmessage = (e) => {
        const chunk = JSON.parse(e.data);
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

    // The branch inherits the mode of the conversation it came from.
    const branchMode = activeConversation ? normalizeMode(convMode) : newChatMode;

    const newConvId = generateId();
    const title = "Branch: " + (conversations.find((c) => c.id === activeConversation)?.title || "New");

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
      setConvMode(branchMode);

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
          loadMessages={loadMessages}
          handleDeleteConversation={handleDeleteConversation}
          setShowSettings={handleOpenSettings}
          dbToken={settings.dbToken}
          loadMore={() => loadConversations(settings.dbToken, conversations.length)}
          hasMore={hasMoreConv}
          isLoading={isLoadingConv}
          defaultMode={settings.defaultMode}
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
            loadMessages={loadMessages}
            handleDeleteConversation={handleDeleteConversation}
            setShowSettings={handleOpenSettings}
            dbToken={settings.dbToken}
            loadMore={() => loadConversations(settings.dbToken, conversations.length)}
            hasMore={hasMoreConv}
            isLoading={isLoadingConv}
            defaultMode={settings.defaultMode}
          />
        </Offcanvas.Body>
      </Offcanvas>

      <SettingsModal
        show={showSettings}
        onHide={() => setShowSettings(false)}
        settings={settings}
        setSettings={setSettings}
        onSave={saveSettings}
        mode={activeMode}
        modeLocked={modeLocked}
        onModeChange={handleModeChange}
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
            <div className="h-100 d-flex justify-content-center align-items-center">
              <div className="text-center">
                <h3 className="text-muted">
                  {activeMode === MODE_RANDOM ? "🎲 Talk about anything" : "Please only talk about coding"}
                </h3>
                <div className="text-muted mt-2">
                  {activeMode === MODE_RANDOM
                    ? "Random conversation — no system prompt"
                    : "Tech conversation — math & CS assistant"}
                </div>
                {!modeLocked && (
                  <div className="text-muted mt-1" style={{ fontSize: "0.85rem" }}>
                    ⚙ Pick the mode for this chat in Settings
                  </div>
                )}
              </div>
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
                    modelName={settings.model}
                  />
                );
              })}
              <div ref={endOfMessagesRef} />
            </Container>
          )}
        </div>

        <div className="p-3 bg-white border-top">
          <Container className="px-0" style={{ maxWidth: "800px" }}>
            <ChatInput
              key={activeConversation || "new-chat"}
              onSend={(text) => sendMessage(text)}
              placeholder={activeMode === MODE_RANDOM ? "Talk about anything" : "Please only talk about coding"}
            />
          </Container>
        </div>
      </div>
    </Container>
  );
}
