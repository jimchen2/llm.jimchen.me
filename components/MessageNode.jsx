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
    <div class="code-block">
      <button
        class="copy-code-btn"
        type="button"
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

  // User turns ("You") render as a full-bleed band that spans the entire
  // width of the conversation pane. The band is the outer element and the
  // readable column is nested inside it, so the text stays aligned with the
  // bot replies while the band runs edge to edge.
  return (
    <div className={`message-row ${isUser ? 'message-row-user' : 'message-row-assistant'}`}>
      <div className="message-row-inner">
        <div className="message-card">
          {/* Sticky at the top of the chat pane. Opaque bg so body text
              does not show through while the header is pinned. */}
          <div className="message-header">
            <span className="message-role">{isUser ? 'You' : modelName}</span>

            <div className="message-actions">
              {siblings.length > 1 && (
                <div className="btn-group">
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={index === 0}
                    onClick={() => switchBranch(siblings[index - 1].id)}
                    aria-label="Previous branch"
                  >
                    &#8592;
                  </button>
                  <span className="btn-counter">{index + 1}/{siblings.length}</span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={index === siblings.length - 1}
                    onClick={() => switchBranch(siblings[index + 1].id)}
                    aria-label="Next branch"
                  >
                    &#8594;
                  </button>
                </div>
              )}
              {!isEditing && (
                <div className="btn-group">
                  <button type="button" className="btn btn-sm" onClick={() => handleCopy(msg.content)}>Copy</button>
                  <button type="button" className="btn btn-sm" onClick={() => setIsEditing(true)}>Edit</button>
                  <button type="button" className="btn btn-sm" onClick={() => handleBranch(msg.id)}>Branch</button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => deleteMessage(msg.id)}>Delete</button>
                </div>
              )}
            </div>
          </div>

          <div className="message-body" onClick={handleMarkdownClick}>
            {isEditing ? (
              <div className="message-edit">
                <textarea
                  className="textarea"
                  rows={4}
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                />
                <div className="message-edit-actions">
                  <button type="button" className="btn btn-sm btn-primary" onClick={saveEdit}>Save</button>
                  <button type="button" className="btn btn-sm" onClick={() => setIsEditing(false)}>Cancel</button>
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
