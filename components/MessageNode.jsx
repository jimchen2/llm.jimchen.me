'use client';
import { useState } from 'react';
import { Card, Button, ButtonGroup, Form } from 'react-bootstrap';
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
        class="copy-code-btn btn btn-dark btn-sm position-absolute top-0 end-0 m-1 opacity-75" 
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

  return (
    <Card className={`mb-4 border-0 shadow-sm ${msg.role === 'user' ? 'bg-white' : 'bg-transparent shadow-none'}`}>
      <Card.Header className="d-flex justify-content-between align-items-center bg-transparent border-0 pt-3 pb-0">
        <strong className="text-secondary">{msg.role === 'user' ? 'You' : modelName}</strong>
        
        {siblings.length > 1 && (
          <ButtonGroup size="sm">
            <Button variant="outline-secondary" disabled={index === 0} onClick={() => switchBranch(siblings[index - 1].id)}>&#8592;</Button>
            <Button variant="outline-secondary" disabled className="text-dark border-secondary px-2">{index + 1}/{siblings.length}</Button>
            <Button variant="outline-secondary" disabled={index === siblings.length - 1} onClick={() => switchBranch(siblings[index + 1].id)}>&#8594;</Button>
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
            dangerouslySetInnerHTML={{ __html: md.render(msg.content || '*(typing...)*') }} 
          />
        )}
      </Card.Body>

      {!isEditing && (
        <Card.Footer className="bg-transparent border-0 d-flex justify-content-end gap-2 pt-0 pb-3">
          <ButtonGroup size="sm">
            <Button variant="outline-secondary" onClick={() => handleCopy(msg.content)}>Copy</Button>
            <Button variant="outline-secondary" onClick={() => setIsEditing(true)}>Edit</Button>
            <Button variant="outline-secondary" onClick={() => handleBranch(msg.id)}>Branch</Button>
            <Button variant="outline-danger" onClick={() => deleteMessage(msg.id)}>Delete</Button>
          </ButtonGroup>
        </Card.Footer>
      )}
    </Card>
  );
}
