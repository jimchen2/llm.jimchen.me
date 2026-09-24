'use client';
import { memo, useState, useMemo, useCallback } from 'react';
import { Card, Button, ButtonGroup, Form } from 'react-bootstrap';
import MarkdownIt from 'markdown-it';
import mk from '@vscode/markdown-it-katex';

const md = new MarkdownIt({ html: true, breaks: true }).use(mk);

const defaultRender = md.renderer.rules.fence || function (tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options);
};

md.renderer.rules.fence = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  const encodedCode = encodeURIComponent(token.content);
  const rendered = defaultRender(tokens, idx, options, env, self);
  return `
    <div class="position-relative mt-2 mb-3">
      <button
        class="copy-code-btn btn btn-dark btn-sm position-absolute top-0 end-0 m-1 opacity-75"
        data-code="${encodedCode}"
      >Copy</button>
      ${rendered}
    </div>
  `;
};

function MessageNode({
  msg, siblings, index, switchBranch, handleCopy,
  handleBranch, handleRetry, deleteMessage, modelName
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);

  // Memoize markdown rendering — heavy operation, only when content changes
  const renderedHtml = useMemo(() => md.render(msg.content || '*(typing...)*'), [msg.content]);

  const saveEdit = useCallback(async () => {
    window.dispatchEvent(new CustomEvent('save-message-edit', {
      detail: { id: msg.id, conversationId: msg.conversation_id, content: editContent }
    }));
    setIsEditing(false);
  }, [msg.id, msg.conversation_id, editContent]);

  const handleMarkdownClick = useCallback((e) => {
    if (e.target && e.target.classList.contains('copy-code-btn')) {
      const btn = e.target;
      const codeToCopy = decodeURIComponent(btn.getAttribute('data-code') || '');
      navigator.clipboard.writeText(codeToCopy);
      btn.innerText = 'Copied!';
      setTimeout(() => {
        if (btn) btn.innerText = 'Copy';
      }, 2000);
    }
  }, []);

  const onCopy = useCallback(() => handleCopy(msg.content), [handleCopy, msg.content]);
  const onEdit = useCallback(() => setIsEditing(true), []);
  const onBranch = useCallback(() => handleBranch(msg.id), [handleBranch, msg.id]);
  const onDelete = useCallback(() => deleteMessage(msg.id), [deleteMessage, msg.id]);
  const onSwitchPrev = useCallback(() => switchBranch(siblings[index - 1].id), [switchBranch, siblings, index]);
  const onSwitchNext = useCallback(() => switchBranch(siblings[index + 1].id), [switchBranch, siblings, index]);

  return (
    <Card className={`mb-4 border-0 shadow-sm ${msg.role === 'user' ? 'bg-white' : 'bg-transparent shadow-none'}`}>
      <Card.Header className="d-flex justify-content-between align-items-center bg-transparent border-0 pt-3 pb-0">
        <strong className="text-secondary">{msg.role === 'user' ? 'You' : modelName}</strong>

        {siblings.length > 1 && (
          <ButtonGroup size="sm">
            <Button variant="outline-secondary" disabled={index === 0} onClick={onSwitchPrev}>&#8592;</Button>
            <Button variant="outline-secondary" disabled className="text-dark border-secondary px-2">{index + 1}/{siblings.length}</Button>
            <Button variant="outline-secondary" disabled={index === siblings.length - 1} onClick={onSwitchNext}>&#8594;</Button>
          </ButtonGroup>
        )}
      </Card.Header>

      <Card.Body onClick={handleMarkdownClick}>
        {isEditing ? (
          <div className="d-flex flex-column gap-2">
            <Form.Control as="textarea" rows={4} value={editContent} onChange={e => setEditContent(e.target.value)} />
            <div>
              <Button size="sm" variant="success" className="me-2" onClick={saveEdit}>Save</Button>
              <Button size="sm" variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div
            className="markdown-body fs-5"
            style={{ fontSize: '1.1rem' }}
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        )}
      </Card.Body>

      {!isEditing && (
        <Card.Footer className="bg-transparent border-0 d-flex justify-content-end gap-2 pt-0 pb-3">
          <ButtonGroup size="sm">
            <Button variant="outline-secondary" onClick={onCopy}>Copy</Button>
            <Button variant="outline-secondary" onClick={onEdit}>Edit</Button>
            <Button variant="outline-secondary" onClick={onBranch}>Branch</Button>
            <Button variant="outline-danger" onClick={onDelete}>Delete</Button>
          </ButtonGroup>
        </Card.Footer>
      )}
    </Card>
  );
}

function areEqual(prev, next) {
  if (prev.msg !== next.msg) return false;
  if (prev.modelName !== next.modelName) return false;
  if (prev.index !== next.index) return false;
  if (prev.siblings.length !== next.siblings.length) return false;
  for (let i = 0; i < prev.siblings.length; i++) {
    if (prev.siblings[i].id !== next.siblings[i].id) return false;
  }
  if (prev.switchBranch !== next.switchBranch) return false;
  if (prev.handleCopy !== next.handleCopy) return false;
  if (prev.handleBranch !== next.handleBranch) return false;
  if (prev.deleteMessage !== next.deleteMessage) return false;
  return true;
}

export default memo(MessageNode, areEqual);
