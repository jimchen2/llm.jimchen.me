// components/Modal.jsx
// Plain-DOM dialog. No UI library: a fixed overlay, a hard black frame and a
// yellow header bar. Behaviour matches what the app relied on before: Escape
// and (optionally) the backdrop dismiss it when onHide is supplied, and a
// static backdrop can only be closed by its own controls.
'use client';

import { useEffect } from 'react';

export default function Modal({
  show,
  onHide,
  title,
  children,
  footer = null,
  closeOnBackdrop = true,
  showCloseButton = true,
  wide = false,
}) {
  const dismissible = typeof onHide === 'function';

  useEffect(() => {
    if (!show || !dismissible) return undefined;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onHide();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [show, dismissible, onHide]);

  if (!show) return null;

  return (
    <div className="modal-layer">
      <div
        className="modal-backdrop"
        aria-hidden="true"
        onClick={() => {
          if (dismissible && closeOnBackdrop) onHide();
        }}
      />
      <div
        className={`modal-panel${wide ? ' modal-panel-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          {dismissible && showCloseButton && (
            <button
              type="button"
              className="modal-close"
              onClick={onHide}
              aria-label="Close"
            >
              &times;
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
