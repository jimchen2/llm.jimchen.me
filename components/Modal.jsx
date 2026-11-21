// components/Modal.jsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';

// Minimal modal that replaces react-bootstrap's <Modal>. Same call-site API:
//   <Modal show onHide backdrop="static" keyboard={false} centered size="lg">
//     <Modal.Header closeButton><Modal.Title>…</Modal.Title></Modal.Header>
//     <Modal.Body>…</Modal.Body>
//     <Modal.Footer>…</Modal.Footer>
//   </Modal>
// Renders nothing while `show` is false. Clicking the backdrop hides (unless
// backdrop="static", which shakes the dialog instead); Escape hides unless
// keyboard={false}. Body scroll is locked while open.

const ModalContext = createContext(null);

export default function Modal({
  show,
  onHide,
  backdrop = true,
  keyboard = true,
  centered = true,
  size,
  children,
}) {
  const [shaking, setShaking] = useState(false);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    if (!show) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [show]);

  // Escape to close (unless keyboard={false}).
  useEffect(() => {
    if (!show || keyboard === false || !onHide) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onHide();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [show, keyboard, onHide]);

  if (!show) return null;

  const handleBackdropClick = () => {
    if (backdrop === 'static') {
      setShaking(true);
      window.setTimeout(() => setShaking(false), 400);
      return;
    }
    if (onHide) onHide();
  };

  return (
    <ModalContext.Provider value={{ onHide }}>
      <div
        className="brutal-modal-backdrop"
        onMouseDown={(e) => {
          // Only react to presses that start on the backdrop itself.
          if (e.target === e.currentTarget) handleBackdropClick();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          className={[
            'brutal-modal',
            size === 'lg' ? 'brutal-modal-lg' : '',
            centered ? 'brutal-modal-centered' : '',
            shaking ? 'brutal-modal-shake' : '',
          ].filter(Boolean).join(' ')}
        >
          {children}
        </div>
      </div>
    </ModalContext.Provider>
  );
}

function ModalHeader({ closeButton = false, children, className = '', ...rest }) {
  const { onHide } = useContext(ModalContext) || {};
  return (
    <div className={`brutal-modal-header ${className}`.trim()} {...rest}>
      {children}
      {closeButton && (
        <button
          type="button"
          className="brutal-modal-close"
          onClick={onHide}
          aria-label="Close"
        >
          &times;
        </button>
      )}
    </div>
  );
}

function ModalTitle({ children, className = '', ...rest }) {
  return (
    <div className={`brutal-modal-title ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

function ModalBody({ children, className = '', ...rest }) {
  return (
    <div className={`brutal-modal-body ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

function ModalFooter({ children, className = '', ...rest }) {
  return (
    <div className={`brutal-modal-footer ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

Modal.Header = ModalHeader;
Modal.Title = ModalTitle;
Modal.Body = ModalBody;
Modal.Footer = ModalFooter;
