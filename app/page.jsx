'use client';

import { useState, useEffect, useRef } from 'react';
import MarkdownIt from 'markdown-it';
import mk from '@vscode/markdown-it-katex';

const md = new MarkdownIt({ html: true, breaks: true }).use(mk);

export default function App() {
  const [messages, setMessages] = useState({});
  const [currentId, setCurrentId] = useState(null);
  const [input, setInput] = useState('');
  
  const [settings, setSettings] = useState({
    apiBase: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-3.5-turbo'
  });
  const [showSettings, setShowSettings] = useState(false);
  const [loggedIn, setLoggedIn] = useState(true); // Assuming true, checked by API

  const endOfMessagesRef = useRef(null);

  useEffect(() => {
    // Check URL for login param
    if (window.location.search.includes('login=true')) setLoggedIn(false);
    
    const saved = localStorage.getItem('llm_settings');
    if (saved) setSettings(JSON.parse(saved));

    fetch('/api/messages')
      .then(r => r.json())
      .then(data => {
        if (!data || data.error) return;
        const msgMap = {};
        let lastId = null;
        data.forEach(m => {
          msgMap[m.id] = m;
          lastId = m.id; // approximate leaf, can be refined for exact branch persistence
        });
        setMessages(msgMap);
        setCurrentId(lastId);
      });
  }, []);

  const saveSettings = (newSettings) => {
    setSettings(newSettings);
    localStorage.setItem('llm_settings', JSON.stringify(newSettings));
    setShowSettings(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/auth', {
      method: 'POST',
      body: JSON.stringify({ password: e.target.password.value })
    });
    if (res.ok) {
      setLoggedIn(true);
      window.history.replaceState(null, '', '/');
      window.location.reload();
    } else {
      alert('Wrong password');
    }
  };

  // Traverses backward from currentId to reconstruct the single active chat path
  const getActivePath = () => {
    const path = [];
    let curr = currentId;
    while (curr && messages[curr]) {
      path.unshift(messages[curr]);
      curr = messages[curr].parent_id;
    }
    return path;
  };

  const activePath = getActivePath();

  const scrollToBottom = () => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => { scrollToBottom(); }, [messages, currentId]);

  const generateId = () => Math.random().toString(36).substring(2, 15);

  const sendMessage = async (contentOverride = null, parentOverride = null) => {
    if ((!input.trim() && !contentOverride) || !settings.apiKey) return;
    
    const content = contentOverride || input;
    const parentId = parentOverride !== null ? parentOverride : currentId;
    const userMsgId = generateId();
    const botMsgId = generateId();

    const newMsgs = { ...messages };
    
    const isRetry = contentOverride && !parentOverride;

    if (!isRetry) {
      newMsgs[userMsgId] = { id: userMsgId, parent_id: parentId, role: 'user', content };
    }
    
    newMsgs[botMsgId] = { 
      id: botMsgId, 
      parent_id: isRetry ? parentId : userMsgId, 
      role: 'assistant', 
      content: '' 
    };

    setMessages(newMsgs);
    setCurrentId(botMsgId);
    if (!contentOverride) setInput('');

    // Prepare history for LLM
    const path = [];
    let curr = isRetry ? parentId : userMsgId;
    while (curr && newMsgs[curr]) {
      path.unshift({ role: newMsgs[curr].role, content: newMsgs[curr].content });
      curr = newMsgs[curr].parent_id;
    }

    // Trigger Backend
    await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: path,
        userMsgId: isRetry ? null : userMsgId,
        botMsgId,
        parentId,
        ...settings
      })
    });

    // Start SSE Stream
    const source = new EventSource(`/api/chat/stream?id=${botMsgId}`);
    source.onmessage = (e) => {
      const chunk = JSON.parse(e.data);
      setMessages(prev => ({
        ...prev,
        [botMsgId]: { ...prev[botMsgId], content: prev[botMsgId].content + chunk }
      }));
    };
    source.onerror = () => source.close();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleEdit = (msg) => {
    const newContent = prompt('Edit message:', msg.content);
    if (newContent !== null && newContent !== msg.content) {
      // Editing branches the history
      sendMessage(newContent, msg.parent_id);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this message and all replies?')) return;
    await fetch('/api/messages', { method: 'DELETE', body: JSON.stringify({ id }) });
    setMessages(prev => {
      const next = { ...prev };
      const parentId = next[id]?.parent_id;
      delete next[id];
      // simplified local cleanup, refresh for full tree cleanup
      setCurrentId(parentId || null);
      return next;
    });
  };

  const handleRetry = (msg) => {
    // Retry generates a new assistant message based on the parent user message
    sendMessage(msg.content, msg.parent_id);
  };

  // Look for siblings (branches)
  const getSiblings = (msgId, parentId) => {
    const siblings = Object.values(messages).filter(m => m.parent_id === parentId);
    const index = siblings.findIndex(m => m.id === msgId);
    return { siblings, index };
  };

  const switchBranch = (siblingId) => {
    // Find the deepest leaf in this new branch
    let leaf = siblingId;
    let found = true;
    while(found) {
      const child = Object.values(messages).find(m => m.parent_id === leaf);
      if (child) leaf = child.id;
      else found = false;
    }
    setCurrentId(leaf);
  };

  if (!loggedIn) {
    return (
      <div className="login-container">
        <form onSubmit={handleLogin} className="login-form">
          <h2>Login</h2>
          <input type="password" name="password" placeholder="Password" required />
          <button type="submit">Enter</button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header>
        <h3>Minimal LLM</h3>
        <button onClick={() => setShowSettings(!showSettings)}>Settings</button>
      </header>

      {showSettings && (
        <div className="settings-modal">
          <label>API Base URL</label>
          <input value={settings.apiBase} onChange={e => setSettings({...settings, apiBase: e.target.value})} />
          <label>API Key</label>
          <input type="password" value={settings.apiKey} onChange={e => setSettings({...settings, apiKey: e.target.value})} />
          <label>Model</label>
          <input value={settings.model} onChange={e => setSettings({...settings, model: e.target.value})} />
          <button onClick={() => saveSettings(settings)}>Save</button>
        </div>
      )}

      <div className="chat-container">
        {activePath.map(msg => {
          const { siblings, index } = getSiblings(msg.id, msg.parent_id);
          return (
            <div key={msg.id} className={`message ${msg.role}`}>
              <div className="msg-header">
                <strong>{msg.role === 'user' ? 'You' : 'Assistant'}</strong>
                <div className="msg-controls">
                  {siblings.length > 1 && (
                    <span className="branch-controls">
                      <button disabled={index === 0} onClick={() => switchBranch(siblings[index - 1].id)}>←</button>
                      {index + 1}/{siblings.length}
                      <button disabled={index === siblings.length - 1} onClick={() => switchBranch(siblings[index + 1].id)}>→</button>
                    </span>
                  )}
                  <button onClick={() => navigator.clipboard.writeText(msg.content)}>Copy</button>
                  <button onClick={() => handleEdit(msg)}>Edit/Branch</button>
                  {msg.role === 'assistant' && <button onClick={() => handleRetry(msg)}>Retry</button>}
                  <button className="delete" onClick={() => handleDelete(msg.id)}>Delete</button>
                </div>
              </div>
              <div 
                className="msg-content markdown-body" 
                dangerouslySetInnerHTML={{ __html: md.render(msg.content || '*(typing...)*') }} 
              />
            </div>
          );
        })}
        <div ref={endOfMessagesRef} />
      </div>

      <div className="input-container">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
        />
        <button onClick={() => sendMessage()}>Send</button>
      </div>
    </div>
  );
}