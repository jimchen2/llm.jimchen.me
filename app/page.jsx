// app/page.jsx
"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Container, Button, Form, InputGroup, Offcanvas, Modal } from "react-bootstrap";
import Sidebar from "../components/Sidebar";
import SettingsModal from "../components/SettingsModal";
import MessageNode from "../components/MessageNode";
import { buildChildrenIndex, getActivePathFast, findLeafFast } from "@/lib/messageStore";

const ChatInput = ({ onSend }) => {
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
        placeholder="Please only talk about coding"
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

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [inputPassword, setInputPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const [hasMoreConv, setHasMoreConv] = useState(true);
  const [isLoadingConv, setIsLoadingConv] = useState(false);

  const isInitializedRef = useRef(false);

  const [settings, setSettings] = useState({
    model: "gemini-3.7-flash",
    dbToken: "",
    mode: "default",
  });

  const endOfMessagesRef = useRef(null);
  // Refs to avoid stale closures in callbacks (from remote optimization)
  const dbTokenRef = useRef("");
  const activeConversationRef = useRef(null);
  const pendingStreamChunksRef = useRef({});
  const streamFlushHandleRef = useRef(null);

  useEffect(() => {
    dbTokenRef.current = settings.dbToken;
  }, [settings.dbToken]);

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  // Optimized derived structures: childrenIndex for O(1) sibling/child lookups
  const childrenIndex = useMemo(() => buildChildrenIndex(messages), [messages]);
  const activePath = useMemo(() => {
    if (!currentId || !messages[currentId]) return [];
    return getActivePathFast(messages, currentId);
  }, [messages, currentId]);

  // Batched streaming: collapse many SSE chunks into one state update per frame
  const flushStreamChunks = useCallback((onlyBotMsgId = null) => {
    if (onlyBotMsgId === null) {
      streamFlushHandleRef.current = null;
    }
    const pendingEntries = Object.entries(pendingStreamChunksRef.current).filter(
      ([botMsgId]) => onlyBotMsgId === null || botMsgId === onlyBotMsgId
    );
    if (pendingEntries.length === 0) return;
    for (const [botMsgId] of pendingEntries) {
      delete pendingStreamChunksRef.current[botMsgId];
    }
    setMessages((prev) => {
      const next = { ...prev };
      for (const [botMsgId, pending] of pendingEntries) {
        next[botMsgId] = {
          ...next[botMsgId],
          content: (next[botMsgId]?.content || "") + pending,
        };
      }
      return next;
    });
  }, []);

  const queueStreamChunk = useCallback((botMsgId, chunk) => {
    pendingStreamChunksRef.current[botMsgId] = (pendingStreamChunksRef.current[botMsgId] || "") + chunk;
    if (streamFlushHandleRef.current) return;
    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      streamFlushHandleRef.current = window.requestAnimationFrame(() => flushStreamChunks());
    } else {
      streamFlushHandleRef.current = setTimeout(() => flushStreamChunks(), 16);
    }
  }, [flushStreamChunks]);

  const fetchRemoteSettings = async (token) => {
    try {
      const res = await fetch("/api/settings", {
        headers: { "x-db-token": token },
      });
      if (!res.ok) throw new Error("Invalid password");
      const data = await res.json();
      if (data.settings) {
        setSettings({
          dbToken: token,
          model: data.settings.model ?? "gemini-3.8-flash",
          mode: "default",
        });
      } else {
        setSettings((prev) => ({ ...prev, dbToken: token, mode: "default" }));
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleOpenSettings = async () => {
    if (settings.dbToken) {
      try {
        const res = await fetch("/api/settings", {
          headers: { "x-db-token": settings.dbToken },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.settings?.model) {
            setSettings((prev) => ({ ...prev, model: data.settings.model }));
          }
        }
      } catch {}
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
    const handleSaveEdit = async (e) => {
      const { id, conversationId, content } = e.detail;
      await fetch("/api/messages", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-db-token": dbTokenRef.current },
        body: JSON.stringify({ id, conversationId: conversationId || activeConversationRef.current, content }),
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

  const loadConversations = useCallback((dbToken, offset = 0) => {
    setIsLoadingConv(true);
    fetch(`/api/conversations?offset=${offset}&limit=10`, { headers: { "x-db-token": dbToken } })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Failed to load conversations (${r.status})`);
        return r.json();
      })
      .then((data) => {
        const valid = Array.isArray(data) ? data.filter((c) => c && c.id) : [];
        if (offset === 0) setConversations(valid);
        else setConversations((prev) => [...prev, ...valid]);
        setHasMoreConv(valid.length === 10);
      })
      .catch((err) => {
        console.error(err);
        if (offset === 0) setHasMoreConv(false);
      })
      .finally(() => setIsLoadingConv(false));
  }, []);

  const loadMessages = useCallback((dbToken, convId) => {
    fetch(`/api/messages?conversationId=${convId}`, { headers: { "x-db-token": dbToken } })
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) {
          const err = new Error(data?.error || `Failed to load messages (${r.status})`);
          err.status = r.status;
          err.conversationExpired = data?.error === "conversation_expired";
          throw err;
        }
        return data;
      })
      .then((data) => {
        if (!data || data.error) return;
        const msgMap = {};
        let lastId = null;
        for (let i = 0; i < data.length; i++) {
          const m = data[i];
          msgMap[m.id] = m;
          lastId = m.id;
        }
        setMessages(msgMap);
        setCurrentId(lastId);
        setActiveConversation(convId);
        setShowMobileMenu(false);
      })
      .catch((err) => {
        console.error(err);
        if (err.conversationExpired || err.status === 404) {
          setConversations((prev) => prev.filter((c) => c.id !== convId));
          setActiveConversation((prev) => {
            if (prev === convId) {
              setMessages({});
              setCurrentId(null);
              return null;
            }
            return prev;
          });
          if (typeof window !== "undefined" && (window.location.pathname.startsWith("/chat/") || new URLSearchParams(window.location.search).get("chat"))) {
            window.history.replaceState({}, "", "/");
          }
        }
      });
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveConversation(null);
    setMessages({});
    setCurrentId(null);
    setShowMobileMenu(false);
    setSettings((prev) => ({ ...prev, mode: "default" }));
  }, []);

  const handleDeleteConversation = useCallback(async (e, id) => {
    e.stopPropagation();
    if (!confirm("Delete this entire conversation?")) return;
    await fetch("/api/conversations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-db-token": settings.dbToken },
      body: JSON.stringify({ id }),
    });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversation === id) handleNewChat();
  }, [settings.dbToken, activeConversation, handleNewChat]);

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
          mode: settings.mode,
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

  const scrollToBottom = useCallback(() => endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" }), []);
  useEffect(() => {
    scrollToBottom();
  }, [currentId, scrollToBottom]);

  const generateId = useCallback(() => Math.random().toString(36).substring(2, 15), []);

  const sendMessage = useCallback(async (text = null, parentOverride = null, isBotRetry = false) => {
    if ((!text?.trim() && !isBotRetry) || !settings.dbToken) {
      if (!settings.dbToken) alert("Please authenticate first.");
      return;
    }
    const content = text || "";
    let convId = activeConversation;
    const isNewConv = !convId;
    if (isNewConv) convId = generateId();
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
    const conversationMode = isNewConv ? settings.mode : (conversations.find((c) => c.id === convId)?.mode || "default");
    if (isNewConv) {
      setActiveConversation(convId);
      setConversations((prev) => [{ id: convId, title, mode: conversationMode }, ...prev]);
    }
    // Push then reverse for O(depth) instead of O(depth²) unshift
    const path = [];
    let curr = isBotRetry ? parentId : userMsgId;
    while (curr && newMsgs[curr]) {
      path.push({ role: newMsgs[curr].role, content: newMsgs[curr].content });
      curr = newMsgs[curr].parent_id;
    }
    for (let i = 0, j = path.length - 1; i < j; i++, j--) {
      const tmp = path[i];
      path[i] = path[j];
      path[j] = tmp;
    }
    try {
      if (isNewConv) {
        await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-db-token": settings.dbToken },
          body: JSON.stringify({ id: convId, title, mode: conversationMode }),
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
          mode: conversationMode,
        }),
      });
      if (!response.ok) throw new Error(`Server returned status ${response.status}`);
      const source = new EventSource(`/api/chatstream?id=${botMsgId}&dbToken=${encodeURIComponent(settings.dbToken)}`);
      source.onmessage = (e) => {
        const chunk = JSON.parse(e.data);
        queueStreamChunk(botMsgId, chunk);
      };
      source.onerror = () => {
        source.close();
        flushStreamChunks(botMsgId);
        setMessages((prev) => {
          const currentContent = prev[botMsgId]?.content || "";
          if (!currentContent) {
            return {
              ...prev,
              [botMsgId]: { ...prev[botMsgId], content: `⚠️ **Network Error:** Connection lost to the stream.` },
            };
          }
          return prev;
        });
      };
    } catch (error) {
      setMessages((prev) => ({
        ...prev,
        [botMsgId]: { ...prev[botMsgId], content: `⚠️ **Network Error:** Failed to send message.\n\n\`${error.message}\`` },
      }));
    }
  }, [messages, currentId, activeConversation, conversations, settings.dbToken, settings.model, settings.mode, generateId, queueStreamChunk, flushStreamChunks]);

  const handleCopy = useCallback((text) => navigator.clipboard.writeText(text), []);

  const handleBranch = useCallback(async (msgId) => {
    if (!settings.dbToken) return;
    const path = getActivePathFast(messages, msgId);
    const newConvId = generateId();
    const sourceConv = conversations.find((c) => c.id === activeConversation);
    const title = "Branch: " + (sourceConv?.title || "New");
    const branchMode = sourceConv?.mode || "default";
    try {
      await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-db-token": settings.dbToken },
        body: JSON.stringify({ id: newConvId, title, mode: branchMode }),
      });
      const newMessages = new Array(path.length);
      let lastNewId = null;
      const idMap = {};
      let time = Date.now();
      for (let i = 0; i < path.length; i++) {
        const m = path[i];
        const newId = generateId();
        idMap[m.id] = newId;
        newMessages[i] = {
          id: newId,
          conversation_id: newConvId,
          parent_id: m.parent_id ? idMap[m.parent_id] : null,
          role: m.role,
          content: m.content,
          created_at: time++,
        };
        lastNewId = newId;
      }
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-db-token": settings.dbToken },
        body: JSON.stringify({ messages: newMessages }),
      });
      setConversations((prev) => [{ id: newConvId, title, mode: branchMode }, ...prev]);
      setActiveConversation(newConvId);
      const msgMap = {};
      for (let i = 0; i < newMessages.length; i++) {
        const m = newMessages[i];
        msgMap[m.id] = m;
      }
      setMessages(msgMap);
      setCurrentId(lastNewId);
    } catch {
      alert("Network Error: Could not branch conversation.");
    }
  }, [messages, conversations, activeConversation, settings.dbToken, generateId]);

  const deleteMessage = useCallback(async (msgId, skipConfirm = false) => {
    if (!skipConfirm && !confirm("Delete this message?")) return false;
    const msgToDelete = messages[msgId];
    const parentId = msgToDelete ? msgToDelete.parent_id : null;
    try {
      await fetch("/api/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-db-token": settings.dbToken },
        body: JSON.stringify({ id: msgId, conversationId: activeConversation }),
      });
    } catch (error) {
      console.warn("Local deletion only:", error);
    }
    const newMsgs = { ...messages };
    const childSet = childrenIndex.get(String(msgId));
    if (childSet && childSet.size > 0) {
      for (const childId of childSet) {
        if (newMsgs[childId]) newMsgs[childId] = { ...newMsgs[childId], parent_id: parentId };
      }
    } else {
      for (const id in newMsgs) {
        if (newMsgs[id].parent_id === msgId) newMsgs[id] = { ...newMsgs[id], parent_id: parentId };
      }
    }
    delete newMsgs[msgId];
    setMessages(newMsgs);
    if (currentId === msgId) setCurrentId(parentId);
    return true;
  }, [messages, currentId, childrenIndex, settings.dbToken, activeConversation]);

  const handleRetry = useCallback(async (msgId) => {
    const msg = messages[msgId];
    if (!msg) return;
    const parentId = msg.parent_id;
    const deleted = await deleteMessage(msgId, true);
    if (!deleted) return;
    sendMessage(null, parentId, true);
  }, [messages, deleteMessage, sendMessage]);

  const getSiblings = useCallback((msgId, parentId) => {
    const key = parentId == null ? "__root__" : String(parentId);
    const set = childrenIndex.get(key);
    if (!set) return { siblings: [], index: -1 };
    const siblings = [];
    let idx = -1;
    let pos = 0;
    for (const cid of set) {
      const m = messages[cid];
      if (!m) continue;
      siblings.push(m);
      if (cid === msgId) idx = pos;
      pos++;
    }
    if (idx === -1 && messages[msgId]) {
      siblings.push(messages[msgId]);
      idx = siblings.length - 1;
    }
    return { siblings, index: idx };
  }, [messages, childrenIndex]);

  const switchBranch = useCallback((siblingId) => {
    const leaf = findLeafFast(messages, childrenIndex, siblingId);
    setCurrentId(leaf);
  }, [messages, childrenIndex]);

  return (
    <Container fluid className="p-0 overflow-hidden d-flex" style={{ height: "100dvh" }}>
      <Modal show={showAuthModal} backdrop="static" keyboard={false} centered>
        <Modal.Header>
          <Modal.Title>Access Required</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleAuthSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Access Password</Form.Label>
              <Form.Control type="password" placeholder="Enter access password" value={inputPassword} onChange={(e) => setInputPassword(e.target.value)} autoFocus required />
              {authError && <div className="text-danger mt-2 small">{authError}</div>}
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="primary" type="submit">Authenticate</Button>
          </Modal.Footer>
        </Form>
      </Modal>

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
        />
      </div>

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
            setShowSettings={handleOpenSettings}
            dbToken={settings.dbToken}
            loadMore={() => loadConversations(settings.dbToken, conversations.length)}
            hasMore={hasMoreConv}
            isLoading={isLoadingConv}
          />
        </Offcanvas.Body>
      </Offcanvas>

      <SettingsModal show={showSettings} onHide={() => setShowSettings(false)} settings={settings} setSettings={setSettings} onSave={saveSettings} />

      <div className="d-flex flex-column bg-white h-100 flex-grow-1 position-relative">
        <div className="d-md-none p-2 border-bottom d-flex align-items-center bg-light">
          <Button variant="outline-dark" size="sm" onClick={() => setShowMobileMenu(true)}>☰ Menu</Button>
          <span className="ms-3 fw-bold">Chat</span>
        </div>

        <div className="flex-grow-1 overflow-auto p-3 p-md-4 bg-light">
          {activePath.length === 0 ? (
            <div className="h-100 d-flex justify-content-center align-items-center">
              <h3 className="text-muted">Please only talk about coding</h3>
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
            <ChatInput key={activeConversation || "new-chat"} onSend={(text) => sendMessage(text)} />
          </Container>
        </div>
      </div>
    </Container>
  );
}
