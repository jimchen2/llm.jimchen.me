// components/MessageMenu.jsx
//
// Telegram-style context menu for a message. In the Telegram theme the action
// row that other appearances keep at the top of every message is gone: the
// actions live in this popup instead, opened by right-clicking on a computer
// or by a single tap on a phone or tablet — the way Telegram itself works.
//
// The menu renders into a portal on <body> so it is never clipped by the
// scrolling message list, and it is positioned next to the pointer, flipping
// back inside the viewport when it would leave it.
"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Keep the panel this far from the window edges.
const EDGE = 8;

export default function MessageMenu({ anchor, onClose, children }) {
  const menuRef = useRef(null);
  // null until the panel has been measured, so it is never painted in the
  // wrong place first.
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const maxLeft = window.innerWidth - width - EDGE;
    const maxTop = window.innerHeight - height - EDGE;
    setPosition({
      left: Math.max(EDGE, Math.min(anchor.x, maxLeft)),
      top: Math.max(EDGE, Math.min(anchor.y, maxTop)),
    });
  }, [anchor.x, anchor.y]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (menuRef.current && menuRef.current.contains(event.target)) return;
      onClose();
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      // Don't let the same Escape also close a dialog behind the menu.
      event.stopPropagation();
      onClose();
    };
    // Capture phase: the message list scrolls its own pane, and the first
    // pointerdown of a tap has to close the menu before anything else runs.
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      className="tg-menu"
      role="menu"
      style={{
        left: position ? position.left : anchor.x,
        top: position ? position.top : anchor.y,
        visibility: position ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body
  );
}
