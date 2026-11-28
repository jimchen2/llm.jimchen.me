'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card, Button, ButtonGroup, Form } from 'react-bootstrap';
import MarkdownIt from 'markdown-it';
import mk from '@vscode/markdown-it-katex';
import MessageMenu from './MessageMenu';
import useActiveTheme from '../lib/useActiveTheme';
import { isComputerDevice } from '../lib/desktopGate';

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

// Icons for the Telegram-style context menu (Feather set, stroked by CSS).
const MENU_ICONS = {
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  edit: <path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z" />,
  branch: (
    <>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </>
  ),
  retry: (
    <>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </>
  ),
  delete: (
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </>
  ),
};

function MenuIcon({ name }) {
  return (
    <svg className="tg-menu-icon" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      {MENU_ICONS[name]}
    </svg>
  );
}

// Targets that keep their own behaviour: following a link, copying a code
// block, typing in the edit box. Tapping those must not pop the message menu.
const INTERACTIVE_SELECTOR = 'a, button, input, textarea, select, label, option, summary';

export default function MessageNode({ 
  msg, siblings, index, switchBranch, handleCopy, 
  handleBranch, handleRetry, deleteMessage, modelName,
  // Read-only turns (random mode opened on a phone/tablet): the message is
  // still shown in full, but the actions that change the conversation — Edit,
  // Branch, Retry and Delete — are hidden. Copy and branch navigation still work.
  readOnly = false,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);

  // The Telegram theme drops the action row from the top of every message and
  // opens those actions from a context menu instead — right-click on a
  // computer, a single tap on a phone or tablet. Every other appearance keeps
  // the original visible buttons, untouched.
  const theme = useActiveTheme();
  const isTelegram = theme === 'telegram';
  // A computer right-clicks; a phone or tablet has no right button, so a
  // single tap on the message opens the same menu. Hybrid devices that report
  // a mouse are still handled per gesture through the pointer type.
  const [isComputer, setIsComputer] = useState(true);
  const lastPointerType = useRef('mouse');
  const [menu, setMenu] = useState(null); // { x, y } of the pointer
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  // The tap that closes the menu must not immediately open it again on the
  // message underneath.
  const ignoreTapsUntil = useRef(0);

  useEffect(() => {
    setIsComputer(isComputerDevice());
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const hasTextSelection = () => {
    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    return !!selection && !selection.isCollapsed;
  };

  const showToast = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 1500);
  };

  const closeMenu = useCallback(() => {
    setMenu(null);
    ignoreTapsUntil.current = Date.now() + 350;
  }, []);

  // Right-click on a message: the Telegram menu replaces the browser's own.
  // Selection and the edit box keep their native menu.
  const openContextMenu = (e) => {
    if (!isTelegram || isEditing) return;
    if (e.target instanceof Element && e.target.closest(INTERACTIVE_SELECTOR)) return;
    if (hasTextSelection()) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  // Single tap on a phone or tablet. Links, the code-block Copy button and the
  // edit box keep their own click behaviour.
  const handleMessageClick = (e) => {
    if (!isTelegram || isEditing) return;
    const isTap = !isComputer || lastPointerType.current === 'touch' || lastPointerType.current === 'pen';
    if (!isTap) return;
    if (e.target instanceof Element && e.target.closest(INTERACTIVE_SELECTOR)) return;
    if (Date.now() < ignoreTapsUntil.current) return;
    if (hasTextSelection()) return;
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const copyMessage = () => {
    handleCopy(msg.content);
    showToast('Copied');
  };

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

  // Telegram-style time label ("14:32") for the bubble meta row. Message
  // timestamps are stored as epoch milliseconds.
  const timeLabel = Number.isFinite(Number(msg.created_at))
    ? new Date(Number(msg.created_at)).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '';

  // Branch navigation, shared by the visible header arrows (other themes) and
  // the Telegram context menu.
  const branchNavigation = siblings.length > 1 && (
    <ButtonGroup size="sm">
      <Button variant="outline-secondary" disabled={index === 0} onClick={() => switchBranch(siblings[index - 1].id)}>&#8592;</Button>
      <Button variant="outline-secondary" disabled className="text-dark border-secondary px-2">{index + 1}/{siblings.length}</Button>
      <Button variant="outline-secondary" disabled={index === siblings.length - 1} onClick={() => switchBranch(siblings[index + 1].id)}>&#8594;</Button>
    </ButtonGroup>
  );

  // User turns ("You") render as a full-bleed white band that spans the entire
  // width of the conversation pane. The band is the outer element and the
  // readable column is nested inside it, so the text stays aligned with the
  // bot replies while the white background runs edge to edge.
  return (
    <div className={`message-row ${isUser ? 'message-row-user' : 'message-row-assistant'}`}>
      <div className="message-row-inner">
        <Card
          className={`message-card mb-0 border-0 ${
            isUser ? 'message-card-user bg-white' : 'message-card-assistant bg-transparent shadow-none'
          }`}
          onContextMenu={openContextMenu}
          onPointerDown={(e) => { lastPointerType.current = e.pointerType || 'mouse'; }}
          onClick={handleMessageClick}
        >
          {/* Sticky at the top of the chat pane. Opaque bg so body text
              does not show through while the header is pinned. */}
          <Card.Header
            className={`message-header d-flex justify-content-between align-items-center gap-2 border-0 ${
              isUser ? 'bg-white' : 'bg-light'
            }`}
          >
            <strong className="text-secondary text-truncate">{isUser ? 'You' : modelName}</strong>

            {/* Every appearance except Telegram keeps the actions pinned to the
                top of the message; Telegram shows them in the popup menu. */}
            {!isTelegram && (
              <div className="message-actions d-flex align-items-center gap-2 flex-shrink-0">
                {branchNavigation}
                {!isEditing && (
                  <ButtonGroup size="sm">
                    <Button variant="outline-secondary" onClick={() => handleCopy(msg.content)}>Copy</Button>
                    {!readOnly && (
                      <>
                        <Button variant="outline-secondary" onClick={() => setIsEditing(true)}>Edit</Button>
                        <Button variant="outline-secondary" onClick={() => handleBranch(msg.id)}>Branch</Button>
                        <Button variant="outline-danger" onClick={() => deleteMessage(msg.id)}>Delete</Button>
                      </>
                    )}
                  </ButtonGroup>
                )}
              </div>
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
            {timeLabel && <span className="message-time">{timeLabel}</span>}
          </Card.Body>
        </Card>
      </div>

      {/* Telegram-style message actions: same work, no permanent action row. */}
      {isTelegram && menu && (
        <MessageMenu anchor={menu} onClose={closeMenu}>
          {siblings.length > 1 && (
            <div className="tg-menu-branch">
              <button
                type="button"
                className="tg-menu-step"
                aria-label="Previous branch"
                disabled={index === 0}
                onClick={() => { closeMenu(); switchBranch(siblings[index - 1].id); }}
              >
                &#8592;
              </button>
              <span className="tg-menu-branch-count">{index + 1} / {siblings.length}</span>
              <button
                type="button"
                className="tg-menu-step"
                aria-label="Next branch"
                disabled={index === siblings.length - 1}
                onClick={() => { closeMenu(); switchBranch(siblings[index + 1].id); }}
              >
                &#8594;
              </button>
            </div>
          )}

          <button
            type="button"
            role="menuitem"
            className="tg-menu-item"
            onClick={() => { closeMenu(); copyMessage(); }}
          >
            <MenuIcon name="copy" />
            Copy
          </button>

          {!readOnly && (
            <button
              type="button"
              role="menuitem"
              className="tg-menu-item"
              onClick={() => { closeMenu(); setIsEditing(true); }}
            >
              <MenuIcon name="edit" />
              Edit
            </button>
          )}

          {!readOnly && (
            <button
              type="button"
              role="menuitem"
              className="tg-menu-item"
              onClick={() => { closeMenu(); handleBranch(msg.id); }}
            >
              <MenuIcon name="branch" />
              Branch
            </button>
          )}

          {!readOnly && !isUser && (
            <button
              type="button"
              role="menuitem"
              className="tg-menu-item"
              onClick={() => { closeMenu(); handleRetry(msg.id); }}
            >
              <MenuIcon name="retry" />
              Retry
            </button>
          )}

          {!readOnly && (
            <>
              <div className="tg-menu-sep" />
              <button
                type="button"
                role="menuitem"
                className="tg-menu-item tg-menu-item-danger"
                onClick={() => { closeMenu(); deleteMessage(msg.id); }}
              >
                <MenuIcon name="delete" />
                Delete
              </button>
            </>
          )}
        </MessageMenu>
      )}

      {isTelegram && toast && createPortal(
        <div className="tg-toast" role="status">{toast}</div>,
        document.body
      )}
    </div>
  );
}
