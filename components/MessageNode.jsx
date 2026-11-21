'use client';
import { useState } from 'react';
import MarkdownIt from 'markdown-it';
import mk from '@vscode/markdown-it-katex';

const md = new MarkdownIt({ html: true, breaks: true }).use(mk);

// Override markdown-it's code block renderer to inject the Copy button directly into the HTML
const defaultRender = md.renderer.rules.fence || function (tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options);
};

md.renderer.rules.fence = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  // Encode the raw code to attach it safely as a dataset attribute
  const encodedCode = encodeURIComponent(token.content);
  const rendered = defaultRender(tokens, idx, options, env, self);

  // Wrap the output in a relative container with the copy button already inside
  return `
    <div class="position-relative mt-2 mb-3">
      <button
        class="copy-code-btn"
        data-code="${encodedCode}"
      >Copy</button>
      ${rendered}
    </div>
  `;
};

export default function MessageNode({
  msg, siblings, index, switchBranch, handleCopy,
  handleBranch, handleRetry, deleteMessage, modelName
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);

  const saveEdit = async () => {
    window.dispatchEvent(new CustomEvent('save-message-edit', {
      detail: { id: msg.id, content: editContent }
    }));
    setIsEditing(false);
  };

  // Event delegation to catch clicks on dynamically rendered copy buttons
  const handleMarkdownClick = (e) => {
    if (e.target && e.target.classList.contains('copy-code-btn')) {
      const btn = e.target;
      const codeToCopy = decodeURIComponent(btn.getAttribute('data-code') || '');

      navigator.clipboard.writeText(codeToCopy);

      btn.innerText = 'Copied!';
      setTimeout(() => {
        // Double check if element still exists
        if (btn) btn.innerText = 'Copy';
      }, 2000);
    }
  };

  const isUser = msg.role === 'user';

  // User turns ("You") render as a full-width white band that spans the entire
  // width of the conversation pane. The band is the outer element and the
  // readable column is nested inside it, so the text stays aligned with the
  // bot replies while the white background runs edge to edge.
  return (
    <div className={`message-row ${isUser ? 'message-row-user' : 'message-row-assistant'}`}>
      <div className="message-row-inner">
        <div className="message-card">
          {/* Sticky at the top of the chat pane. Opaque bg so body text
              does not show through while the header is pinned. */}
          <div className="message-header">
            <strong className="message-sender">{isUser ? 'You' : modelName}</strong>

            <div className="d-flex align-items-center gap-2 flex-shrink-0">
              {siblings.length > 1 && (
                <span className="btn-group-sm" role="group" aria-label="Branch navigator">
                  <button className="btn btn-sm btn-ghost" disabled={index === 0} onClick={() => switchBranch(siblings[index - 1].id)} aria-label="Previous branch">&#8592;</button>
                  <button className="btn btn-sm btn-ghost btn-static" disabled>{index + 1}/{siblings.length}</button>
                  <button className="btn btn-sm btn-ghost" disabled={index === siblings.length - 1} onClick={() => switchBranch(siblings[index + 1].id)} aria-label="Next branch">&#8594;</button>
                </span>
              )}
              {!isEditing && (
                <span className="btn-group-sm" role="group" aria-label="Message actions">
                  <button className="btn btn-sm btn-ghost" onClick={() => handleCopy(msg.content)}>Copy</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setIsEditing(true)}>Edit</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => handleBranch(msg.id)}>Branch</button>
                  <button className="btn btn-sm btn-ghost-danger" onClick={() => deleteMessage(msg.id)}>Delete</button>
                </span>
              )}
            </div>
          </div>

          <div className="message-body" onClick={handleMarkdownClick}>
            {isEditing ? (
              <div className="d-flex flex-column gap-2">
                <textarea className="brutal-input" rows={4} value={editContent} onChange={e => setEditContent(e.target.value)} />
                <div>
                  <button className="btn btn-success btn-sm me-2" onClick={saveEdit}>Save</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setIsEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div
                className="markdown-body"
                dangerouslySetInnerHTML={{ __html: md.render(msg.content || '*(typing...)*') }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
