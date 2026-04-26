'use client';
import { useEffect, useRef, useState } from 'react';
import { Card, Button, ButtonGroup, Form } from 'react-bootstrap';
import MarkdownIt from 'markdown-it';
import mk from '@vscode/markdown-it-katex';

const md = new MarkdownIt({ html: true, breaks: true }).use(mk);

export default function MessageNode({ 
  msg, siblings, index, switchBranch, handleCopy, 
  handleBranch, handleRetry, deleteMessage, modelName
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);
  const contentRef = useRef(null);

  // Inject Copy buttons to Code snippets
  useEffect(() => {
    if (!contentRef.current || isEditing) return;
    const codeBlocks = contentRef.current.querySelectorAll('pre');
    
    codeBlocks.forEach(pre => {
      if (pre.querySelector('.copy-code-btn')) return;
      const btn = document.createElement('button');
      btn.className = 'copy-code-btn btn btn-dark btn-sm position-absolute top-0 end-0 m-1 opacity-75';
      btn.innerText = 'Copy';
      pre.classList.add('position-relative');
      
      btn.onclick = () => {
        const codeElement = pre.querySelector('code');
        const codeText = codeElement ? codeElement.textContent : pre.textContent.replace('Copy', '');
        navigator.clipboard.writeText(codeText);
        btn.innerText = 'Copied!';
        setTimeout(() => { btn.innerText = 'Copy'; }, 2000);
      };
      pre.appendChild(btn);
    });
  }, [msg.content, isEditing]);

  const saveEdit = async () => {
    // Requires passing an edit handler from parent, or firing the API directly here. 
    // To keep it simple, we emit an event back to parent.
    window.dispatchEvent(new CustomEvent('save-message-edit', { 
      detail: { id: msg.id, content: editContent } 
    }));
    setIsEditing(false);
  };

  return (
    <Card className={`mb-4 border-0 shadow-sm ${msg.role === 'user' ? 'bg-white' : 'bg-transparent shadow-none'}`}>
      <Card.Header className="d-flex justify-content-between align-items-center bg-transparent border-0 pt-3 pb-0">
        {/* SPECIFY LLM INSTEAD OF "ASSISTANT" */}
        <strong className="text-secondary">{msg.role === 'user' ? 'You' : modelName}</strong>
        
        {/* BRANCH NAVIGATOR */}
        {siblings.length > 1 && (
          <ButtonGroup size="sm">
            <Button variant="outline-secondary" disabled={index === 0} onClick={() => switchBranch(siblings[index - 1].id)}>&#8592;</Button>
            <Button variant="outline-secondary" disabled className="text-dark border-secondary px-2">{index + 1}/{siblings.length}</Button>
            <Button variant="outline-secondary" disabled={index === siblings.length - 1} onClick={() => switchBranch(siblings[index + 1].id)}>&#8594;</Button>
          </ButtonGroup>
        )}
      </Card.Header>
      
      <Card.Body ref={contentRef}>
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

      {/* BUTTONS AT THE BOTTOM */}
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
