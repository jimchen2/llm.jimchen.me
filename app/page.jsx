// app/page.jsx
'use client';

import { useState, useEffect, useRef } from 'react';
import MarkdownIt from 'markdown-it';
import mk from '@vscode/markdown-it-katex';

const md = new MarkdownIt({ html: true, breaks: true }).use(mk);

export default function App() {
  // Conversation States
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);

  // Message States
  const [messages, setMessages] = useState({});
  const [currentId, setCurrentId] = useState(null);
  const [input, setInput] = useState('');
  
  // Settings
  const [settings, setSettings] = useState({
    apiKey: '',
    model: 'google/gemini-3.1-pro-preview',
    dbToken: '',
    systemPrompt: '' 
  });
  const [showSettings, setShowSettings] = useState(false);

  // Edit States
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');

  const endOfMessagesRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem('llm_settings');
    let initialSettings = settings;
    
    if (saved) {
      initialSettings = { ...settings, ...JSON.parse(saved) }; 
      setSettings(initialSettings);
    }

    if (!initialSettings.dbToken) {
      setShowSettings(true);
    } else {
      loadConversations(initialSettings.dbToken);
    }
  }, []);

  // Add Copy to Clipboard buttons to pre/code blocks dynamically
  useEffect(() => {
    const codeBlocks = document.querySelectorAll('pre');
    codeBlocks.forEach(pre => {
      if (pre.querySelector('.copy-code-btn')) return;

      const btn = document.createElement('button');
      btn.className = 'copy-code-btn';
      btn.innerText = 'Copy';
      btn.style.position = 'absolute';
      btn.style.top = '5px';
      btn.style.right = '5px';
      btn.style.padding = '2px 6px';
      btn.style.fontSize = '12px';
      btn.style.cursor = 'pointer';
      btn.style.background = '#444';
      btn.style.color = '#fff';
      btn.style.border = 'none';
      btn.style.borderRadius = '3px';
      btn.style.opacity = '0.8';

      pre.style.position = 'relative';
      
      btn.onclick = () => {
        const codeElement = pre.querySelector('code');
        const codeText = codeElement ? codeElement.textContent : pre.textContent.replace('Copy', '');
        navigator.clipboard.writeText(codeText);
        btn.innerText = 'Copied!';
        setTimeout(() => { btn.innerText = 'Copy'; }, 2000);
      };

      pre.appendChild(btn);
    });
  }, [messages, currentId, activeConversation]);

  const loadConversations = (dbToken) => {
    fetch('/api/conversations', {
      headers: { 'x-db-token': dbToken }
    })
      .then(r => r.json())
      .then(data => {
        if (!data.error) setConversations(data);
      })
      .catch(console.error);
  };

  const loadMessages = (dbToken, convId) => {
    fetch(`/api/messages?conversationId=${convId}`, {
      headers: { 'x-db-token': dbToken }
    })
      .then(r => r.json())
      .then(data => {
        if (!data || data.error) return;
        const msgMap = {};
        let lastId = null;
        data.forEach(m => {
          msgMap[m.id] = m;
          lastId = m.id;
        });
        setMessages(msgMap);
        setCurrentId(lastId);
        setActiveConversation(convId);
      })
      .catch(console.error);
  };

  const handleNewChat = () => {
    setActiveConversation(null);
    setMessages({});
    setCurrentId(null);
    setInput('');
  };

  const handleDeleteConversation = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Delete this entire conversation?')) return;
    
    await fetch('/api/conversations', { 
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-db-token': settings.dbToken },
      body: JSON.stringify({ id }) 
    });
    
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConversation === id) handleNewChat();
  };

  const saveSettings = (newSettings) => {
    setSettings(newSettings);
    localStorage.setItem('llm_settings', JSON.stringify(newSettings));
    setShowSettings(false);
    loadConversations(newSettings.dbToken);
    if (activeConversation) loadMessages(newSettings.dbToken, activeConversation);
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

  const activePath = getActivePath();

  const scrollToBottom = () => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => { scrollToBottom(); }, [messages, currentId]);

  const generateId = () => Math.random().toString(36).substring(2, 15);

  const sendMessage = async (contentOverride = null, parentOverride = null) => {
    if ((!input.trim() && !contentOverride) || !settings.apiKey || !settings.dbToken) {
      if (!settings.dbToken || !settings.apiKey) alert("Configure Database Token & API Key.");
      return;
    }
    
    const content = contentOverride || input;
    
    let convId = activeConversation;
    if (!convId) {
      convId = generateId();
      const title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
      
      await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-db-token': settings.dbToken },
        body: JSON.stringify({ id: convId, title })
      });
      
      setActiveConversation(convId);
      setConversations(prev => [{ id: convId, title }, ...prev]); 
    }

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

    const path = [];
    let curr = isRetry ? parentId : userMsgId;
    while (curr && newMsgs[curr]) {
      path.unshift({ role: newMsgs[curr].role, content: newMsgs[curr].content });
      curr = newMsgs[curr].parent_id;
    }

    if (settings.systemPrompt && settings.systemPrompt.trim() !== '') {
      path.unshift({ role: 'system', content: settings.systemPrompt.trim() });
    }

    await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-db-token': settings.dbToken
      },
      body: JSON.stringify({
        messages: path,
        userMsgId: isRetry ? null : userMsgId,
        botMsgId,
        parentId,
        conversationId: convId,
        apiKey: settings.apiKey,
        model: settings.model
      })
    });

    const source = new EventSource(
      `/api/chat/stream?id=${botMsgId}&dbToken=${encodeURIComponent(settings.dbToken)}`
    );
    
    source.onmessage = (e) => {
      const chunk = JSON.parse(e.data);
      setMessages(prev => ({
        ...prev,
        [botMsgId]: { ...prev[botMsgId], content: prev[botMsgId].content + chunk }
      }));
    };
    source.onerror = () => source.close();
  };

  // Node Editing
  const startEditing = (msg) => {
    setEditingId(msg.id);
    setEditContent(msg.content);
  };

  const saveEdit = async (id) => {
    await fetch('/api/messages', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-db-token': settings.dbToken },
      body: JSON.stringify({ id, content: editContent })
    });
    setMessages(prev => ({
      ...prev,
      [id]: { ...prev[id], content: editContent }
    }));
    setEditingId(null);
  };

  // Node Copy Action
  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
  };

  // Node Branch Action (Duplicates path into a new Conversation)
  const handleBranch = async (msgId) => {
    if (!settings.dbToken) { alert("Configure Database Token."); return; }
    
    const path = [];
    let curr = msgId;
    while (curr && messages[curr]) {
      path.unshift(messages[curr]);
      curr = messages[curr].parent_id;
    }
    
    const newConvId = generateId();
    const title = 'Branch: ' + (conversations.find(c => c.id === activeConversation)?.title || 'New');
    
    await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-db-token': settings.dbToken },
      body: JSON.stringify({ id: newConvId, title })
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
        created_at: time++
      });
      lastNewId = newId;
    }
    
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-db-token': settings.dbToken },
      body: JSON.stringify({ messages: newMessages })
    });
    
    setConversations(prev => [{ id: newConvId, title }, ...prev]);
    setActiveConversation(newConvId);
    
    const msgMap = {};
    newMessages.forEach(m => msgMap[m.id] = m);
    setMessages(msgMap);
    setCurrentId(lastNewId);
  };

  // Node Delete Action (Deletes selected node and sub-nodes downstream)
  const deleteMessage = async (msgId) => {
    if (!confirm('Delete this message and all its replies?')) return;
    
    await fetch('/api/messages', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-db-token': settings.dbToken },
      body: JSON.stringify({ id: msgId })
    });
    
    const newMsgs = { ...messages };
    const toDelete = [msgId];
    
    // Find all downstream dependents
    for (let i = 0; i < toDelete.length; i++) {
      const id = toDelete[i];
      Object.values(newMsgs).forEach(m => {
        if (m.parent_id === id && !toDelete.includes(m.id)) {
          toDelete.push(m.id);
        }
      });
    }
    toDelete.forEach(id => delete newMsgs[id]);
    setMessages(newMsgs);
    
    if (toDelete.includes(currentId)) {
      setCurrentId(messages[msgId].parent_id || null);
    }
  };

  // Node Retry Bot Action (Generates another message based on its parent node context)
  const handleRetry = async (msgId) => {
    if (!settings.apiKey || !settings.dbToken) {
      alert("Configure Database Token & API Key.");
      return;
    }
    const msg = messages[msgId];
    if (msg.role !== 'assistant') return;
    
    const parentId = msg.parent_id;
    const botMsgId = generateId();
    
    const newMsgs = { ...messages };
    newMsgs[botMsgId] = {
      id: botMsgId,
      parent_id: parentId,
      role: 'assistant',
      content: ''
    };
    
    setMessages(newMsgs);
    setCurrentId(botMsgId);
    
    const path = [];
    let curr = parentId;
    while (curr && newMsgs[curr]) {
      path.unshift({ role: newMsgs[curr].role, content: newMsgs[curr].content });
      curr = newMsgs[curr].parent_id;
    }
    
    if (settings.systemPrompt && settings.systemPrompt.trim() !== '') {
      path.unshift({ role: 'system', content: settings.systemPrompt.trim() });
    }
    
    await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-db-token': settings.dbToken },
      body: JSON.stringify({
        messages: path,
        userMsgId: null, // Avoid duplicating the user context node
        botMsgId: botMsgId,
        parentId: parentId,
        conversationId: activeConversation,
        apiKey: settings.apiKey,
        model: settings.model
      })
    });
    
    const source = new EventSource(
      `/api/chat/stream?id=${botMsgId}&dbToken=${encodeURIComponent(settings.dbToken)}`
    );
    
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

  const getSiblings = (msgId, parentId) => {
    const siblings = Object.values(messages).filter(m => m.parent_id === parentId);
    const index = siblings.findIndex(m => m.id === msgId);
    return { siblings, index };
  };

  const switchBranch = (siblingId) => {
    let leaf = siblingId;
    let found = true;
    while(found) {
      const child = Object.values(messages).find(m => m.parent_id === leaf);
      if (child) leaf = child.id;
      else found = false;
    }
    setCurrentId(leaf);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', margin: 0, padding: 0 }}>
      
      {/* SIDEBAR */}
      <div style={{ width: '260px', backgroundColor: '#1e1e1e', color: '#fff', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '15px' }}>
          <button 
            onClick={handleNewChat}
            style={{ width: '100%', padding: '10px', backgroundColor: '#333', color: '#fff', border: '1px solid #555', borderRadius: '5px', cursor: 'pointer' }}
          >
            + New Chat
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px' }}>
          {conversations.map(c => (
            <div 
              key={c.id} 
              onClick={() => loadMessages(settings.dbToken, c.id)}
              style={{ 
                padding: '10px', 
                marginBottom: '5px',
                borderRadius: '5px',
                cursor: 'pointer', 
                backgroundColor: c.id === activeConversation ? '#2a2b32' : 'transparent',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.title}</span>
              <button 
                onClick={(e) => handleDeleteConversation(e, c.id)} 
                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', marginLeft: '5px' }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div style={{ padding: '15px', borderTop: '1px solid #333' }}>
          <button onClick={() => setShowSettings(!showSettings)} style={{ width: '100%', padding: '10px', cursor:'pointer' }}>⚙ Settings</button>
        </div>
      </div>

      {/* MAIN CHAT */}
      <div className="app-container" style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        
        {showSettings && (
          <div className="settings-modal" style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, background: '#fff', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', minWidth: '300px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <h4 style={{ margin: '0 0 15px 0' }}>Settings</h4>
            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              
              <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Database Password</label>
              <input type="password" placeholder="DB Password" value={settings.dbToken} onChange={e => setSettings({...settings, dbToken: e.target.value})} />
              
              <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Eden AI Key</label>
              <input type="password" placeholder="Eden AI Key" value={settings.apiKey} onChange={e => setSettings({...settings, apiKey: e.target.value})} />
              
              <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Model</label>
              <input placeholder="Model" value={settings.model} onChange={e => setSettings({...settings, model: e.target.value})} />

              <label style={{ fontSize: '12px', fontWeight: 'bold' }}>System Prompt</label>
              <textarea 
                placeholder="You are a helpful assistant." 
                value={settings.systemPrompt} 
                onChange={e => setSettings({...settings, systemPrompt: e.target.value})}
                style={{ minHeight: '80px', padding: '8px', resize: 'vertical' }}
              />

              <button onClick={() => saveSettings(settings)} style={{ marginTop: '10px', padding: '8px', cursor: 'pointer', backgroundColor: '#0070f3', color: '#fff', border: 'none', borderRadius: '4px' }}>Save</button>
            </div>
          </div>
        )}

        <div className="chat-container" style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {activePath.length === 0 && (
            <h2 style={{ textAlign:'center', marginTop: '10vh', color:'#aaa' }}>How can I help you today?</h2>
          )}
          {activePath.map(msg => {
            const { siblings, index } = getSiblings(msg.id, msg.parent_id);
            return (
              <div key={msg.id} className={`message ${msg.role}`} style={{ marginBottom:'20px', padding: '15px', borderRadius: '8px', background: msg.role === 'user' ? '#e9ecef' : '#f8f9fa' }}>
                <div className="msg-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <strong>{msg.role === 'user' ? 'You' : 'Assistant'}</strong>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {siblings.length > 1 && (
                      <span className="branch-controls" style={{marginRight: '10px'}}>
                        <button disabled={index === 0} onClick={() => switchBranch(siblings[index - 1].id)}>←</button>
                        <span style={{margin: '0 5px', fontSize: '12px'}}>{index + 1}/{siblings.length}</span>
                        <button disabled={index === siblings.length - 1} onClick={() => switchBranch(siblings[index + 1].id)}>→</button>
                      </span>
                    )}
                    <button style={{fontSize:'12px', cursor:'pointer'}} onClick={() => handleCopy(msg.content)}>Copy</button>
                    <button style={{fontSize:'12px', cursor:'pointer'}} onClick={() => startEditing(msg)}>Edit</button>
                    <button style={{fontSize:'12px', cursor:'pointer'}} onClick={() => handleBranch(msg.id)}>Branch</button>
                    {msg.role === 'assistant' && (
                      <button style={{fontSize:'12px', cursor:'pointer'}} onClick={() => handleRetry(msg.id)}>Retry</button>
                    )}
                    <button style={{fontSize:'12px', cursor:'pointer', color:'red'}} onClick={() => deleteMessage(msg.id)}>Delete</button>
                  </div>
                </div>
                
                {editingId === msg.id ? (
                  <div>
                    <textarea 
                      value={editContent} 
                      onChange={e => setEditContent(e.target.value)} 
                      style={{width: '100%', minHeight: '100px', padding: '10px', borderRadius:'5px'}} 
                    />
                    <div style={{marginTop: '10px', display: 'flex', gap: '10px'}}>
                      <button onClick={() => saveEdit(msg.id)} style={{cursor:'pointer', padding: '5px 10px'}}>Save</button>
                      <button onClick={() => setEditingId(null)} style={{cursor:'pointer', padding: '5px 10px'}}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div 
                    className="msg-content markdown-body" 
                    dangerouslySetInnerHTML={{ __html: md.render(msg.content || '*(typing...)*') }} 
                  />
                )}
              </div>
            );
          })}
          <div ref={endOfMessagesRef} />
        </div>

        <div className="input-container" style={{ padding: '20px', borderTop: '1px solid #ccc', display:'flex', gap:'10px' }}>
          <textarea
            style={{ flex: 1, padding: '10px', borderRadius:'8px', minHeight: '50px', resize: 'none' }}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
          />
          <button onClick={() => sendMessage()} style={{ padding: '0 20px', cursor:'pointer' }}>Send</button>
        </div>

      </div>
    </div>
  );
}