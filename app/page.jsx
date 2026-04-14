// app/page.jsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Container, Row, Col, Button, Form, InputGroup, Offcanvas } from "react-bootstrap";
import Sidebar from "../components/Sidebar";
import SettingsModal from "../components/SettingsModal";
import MessageNode from "../components/MessageNode";

export default function App() {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState({});
  const [currentId, setCurrentId] = useState(null);
  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Pagination states
  const [hasMoreConv, setHasMoreConv] = useState(true);
  const [isLoadingConv, setIsLoadingConv] = useState(false);

  const [settings, setSettings] = useState({
    apiKey: "",
    model: "google/gemini-3.1-pro-preview",
    dbToken: "",
    systemPrompt: "",
  });

  const endOfMessagesRef = useRef(null);
  const textareaRef = useRef(null);

  // URL State & Settings Initialization
  useEffect(() => {
    const saved = localStorage.getItem("llm_settings");
    let initialSettings = settings;

    if (saved) {
      initialSettings = { ...settings, ...JSON.parse(saved) };
      setSettings(initialSettings);
    }

    if (!initialSettings.dbToken) {
      setShowSettings(true);
    } else {
      loadConversations(initialSettings.dbToken, 0);

      // Support old ?chat= query & new /chat/uuid layout
      const pathname = window.location.pathname;
      const params = new URLSearchParams(window.location.search);
      let urlId = params.get("chat");

      if (pathname.startsWith("/chat/")) {
        urlId = pathname.split("/chat/")[1];
      }

      if (urlId) {
        loadMessages(initialSettings.dbToken, urlId);
      }
    }

    const handleSaveEdit = async (e) => {
      const { id, content } = e.detail;
      await fetch("/api/messages", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-db-token": initialSettings.dbToken },
        body: JSON.stringify({ id, content }),
      });
      setMessages((prev) => ({ ...prev, [id]: { ...prev[id], content } }));
    };
    window.addEventListener("save-message-edit", handleSaveEdit);
    return () => window.removeEventListener("save-message-edit", handleSaveEdit);
  }, []);

  // Sync URL to be /chat/uuid instead
  useEffect(() => {
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
        data.forEach((m) => {
          msgMap[m.id] = m;
          lastId = m.id;
        });
        setMessages(msgMap);
        setCurrentId(lastId);
        setActiveConversation(convId);
        setShowMobileMenu(false);
      })
      .catch(console.error);
  };

  const handleNewChat = () => {
    setActiveConversation(null);
    setMessages({});
    setCurrentId(null);
    setInput("");
    setShowMobileMenu(false);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
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

  const saveSettings = () => {
    localStorage.setItem("llm_settings", JSON.stringify(settings));
    setShowSettings(false);
    loadConversations(settings.dbToken, 0);
    if (activeConversation) loadMessages(settings.dbToken, activeConversation);
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

  const sendMessage = async (contentOverride = null, parentOverride = null, isBotRetry = false) => {
    if ((!input.trim() && !contentOverride && !isBotRetry) || !settings.apiKey || !settings.dbToken) {
      if (!settings.dbToken || !settings.apiKey) alert("Configure Database Token & API Key.");
      return;
    }

    const content = contentOverride || input;
    let convId = activeConversation;

    if (!convId) {
      convId = generateId();
      const title = content ? content.substring(0, 30) + (content.length > 30 ? "..." : "") : "New Chat";
      await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-db-token": settings.dbToken },
        body: JSON.stringify({ id: convId, title }),
      });
      setActiveConversation(convId);
      setConversations((prev) => [{ id: convId, title }, ...prev]);
    }

    const parentId = parentOverride !== null ? parentOverride : currentId;
    const userMsgId = generateId();
    const botMsgId = generateId();
    const newMsgs = { ...messages };

    // If it's a bot retry, we skip creating a new User message and just append a bot to the parent
    if (!isBotRetry) {
      newMsgs[userMsgId] = { id: userMsgId, parent_id: parentId, role: "user", content };
    }
    newMsgs[botMsgId] = { id: botMsgId, parent_id: isBotRetry ? parentId : userMsgId, role: "assistant", content: "" };

    setMessages(newMsgs);
    setCurrentId(botMsgId);

    if (!contentOverride && !isBotRetry) {
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }

    const path = [];
    let curr = isBotRetry ? parentId : userMsgId;
    while (curr && newMsgs[curr]) {
      path.unshift({ role: newMsgs[curr].role, content: newMsgs[curr].content });
      curr = newMsgs[curr].parent_id;
    }

    if (settings.systemPrompt?.trim()) path.unshift({ role: "system", content: settings.systemPrompt.trim() });

    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-db-token": settings.dbToken },
      body: JSON.stringify({
        messages: path,
        userMsgId: isBotRetry ? null : userMsgId,
        botMsgId,
        parentId,
        conversationId: convId,
        apiKey: settings.apiKey,
        model: settings.model,
      }),
    });

    const source = new EventSource(`/api/chatstream?id=${botMsgId}&dbToken=${encodeURIComponent(settings.dbToken)}`);
    source.onmessage = (e) => {
      const chunk = JSON.parse(e.data);
      setMessages((prev) => ({ ...prev, [botMsgId]: { ...prev[botMsgId], content: prev[botMsgId].content + chunk } }));
    };
    source.onerror = () => source.close();
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

    await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-db-token": settings.dbToken },
      body: JSON.stringify({ id: newConvId, title }),
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

    setConversations((prev) => [{ id: newConvId, title }, ...prev]);
    setActiveConversation(newConvId);

    const msgMap = {};
    newMessages.forEach((m) => (msgMap[m.id] = m));
    setMessages(msgMap);
    setCurrentId(lastNewId);
  };

  const deleteMessage = async (msgId, skipConfirm = false) => {
    if (!skipConfirm && !confirm("Delete this message?")) return false;

    const msgToDelete = messages[msgId];
    const parentId = msgToDelete ? msgToDelete.parent_id : null;

    // Delete in DB
    await fetch("/api/messages", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-db-token": settings.dbToken },
      body: JSON.stringify({ id: msgId }),
    });

    const newMsgs = { ...messages };

    // Re-parent children in the local state so the tree doesn't break
    Object.values(newMsgs).forEach((m) => {
      if (m.parent_id === msgId) {
        m.parent_id = parentId;
      }
    });

    delete newMsgs[msgId];
    setMessages(newMsgs);

    // If the user deleted the message they are currently viewing, move view to parent
    if (currentId === msgId) {
      setCurrentId(parentId);
    }

    return true;
  };

  const handleRetry = async (msgId) => {
    const msg = messages[msgId];
    if (!msg) return;
    
    const parentId = msg.parent_id;

    // 1. First, delete the current assistant message (skips user confirmation)
    const deleted = await deleteMessage(msgId, true);
    if (!deleted) return;

    // 2. Invoke LLM generation again attached to the parent
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

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const activePath = getActivePath();

  return (
    <Container fluid className="p-0 overflow-hidden d-flex" style={{ height: "100dvh" }}>
      {/* DESKTOP SIDEBAR */}
      <div className="d-none d-md-block" style={{ width: "280px" }}>
        <Sidebar
          conversations={conversations}
          activeConversation={activeConversation}
          handleNewChat={handleNewChat}
          loadMessages={loadMessages}
          handleDeleteConversation={handleDeleteConversation}
          setShowSettings={setShowSettings}
          dbToken={settings.dbToken}
          loadMore={() => loadConversations(settings.dbToken, conversations.length)}
          hasMore={hasMoreConv}
          isLoading={isLoadingConv}
        />
      </div>

      {/* MOBILE SIDEBAR (OFFCANVAS) */}
      <Offcanvas show={showMobileMenu} onHide={() => setShowMobileMenu(false)} placement="start" className="bg-dark text-light w-75">
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
            setShowSettings={setShowSettings}
            dbToken={settings.dbToken}
            loadMore={() => loadConversations(settings.dbToken, conversations.length)}
            hasMore={hasMoreConv}
            isLoading={isLoadingConv}
          />
        </Offcanvas.Body>
      </Offcanvas>

      <SettingsModal show={showSettings} onHide={() => setShowSettings(false)} settings={settings} setSettings={setSettings} onSave={saveSettings} />

      {/* MAIN CHAT */}
      <div className="d-flex flex-column bg-white h-100 flex-grow-1 position-relative">
        {/* MOBILE HEADER */}
        <div className="d-md-none p-2 border-bottom d-flex align-items-center bg-light">
          <Button variant="outline-dark" size="sm" onClick={() => setShowMobileMenu(true)}>
            ☰ Menu
          </Button>
          <span className="ms-3 fw-bold text-truncate">{conversations.find((c) => c.id === activeConversation)?.title || "New Chat"}</span>
        </div>

        {/* MESSAGES AREA */}
        <div className="flex-grow-1 overflow-auto p-3 p-md-4 bg-light">
          {activePath.length === 0 ? (
            <div className="h-100 d-flex justify-content-center align-items-center">
              <h3 className="text-muted">How can I help you today?</h3>
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

        {/* INPUT AREA */}
        <div className="p-3 bg-white border-top">
          <Container className="px-0" style={{ maxWidth: "800px" }}>
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
                placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
              />
              <Button variant="primary" className="px-3 px-md-4 fw-bold" onClick={() => sendMessage()}>
                Send
              </Button>
            </InputGroup>
          </Container>
        </div>
      </div>
    </Container>
  );
}
