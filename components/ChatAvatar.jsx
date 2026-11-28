// components/ChatAvatar.jsx
//
// The round conversation avatar used by the Telegram theme. The circle says
// what kind of conversation a chat is: each mode gets its own Telegram avatar
// color and glyph, so a row is recognisable at a glance without reading it.
//
//   default   -> { }        the technical / research assistant
//   grammar   -> pencil     Russian mode, which marks up the grammar
//   practical -> bolt       short conversation mode, quick exchanges
//   random    -> sparkle    no system prompt, anything goes
//
// Only the Telegram theme draws these circles; every other appearance keeps
// its original layout because the `.chat-avatar` element is hidden by
// globals.css outside that theme.
"use client";

import { normalizeMode } from "../lib/modes";

const MODE_ICONS = {
  default: (
    <path d="M9.3 7.9 5.2 12l4.1 4.1 1.4-1.4L7.9 12l2.8-2.8zm5.4 0-1.4 1.4 2.8 2.8-2.8 2.8 1.4 1.4L18.8 12z" />
  ),
  grammar: (
    <path d="M3.8 16.6v3.6h3.6l9.4-9.4-3.6-3.6zM20 6.7c.4-.4.4-1 0-1.4L18.7 4c-.4-.4-1-.4-1.4 0l-1.5 1.5 3.6 3.6z" />
  ),
  practical: (
    <path d="M13.3 2.2 4.8 13.1c-.3.4 0 .9.5.9h5l-1 7.3c-.1.5.5.8.9.4l8.4-10.9c.3-.4 0-.9-.5-.9h-5l1-7.3c.1-.5-.5-.8-.8-.4z" />
  ),
  random: (
    <path d="M12 2.6c.3 0 .5.2.6.5l1.6 5.1 5.1 1.6c.6.2.6 1 0 1.2l-5.1 1.6-1.6 5.1c-.2.6-1 .6-1.2 0l-1.6-5.1-5.1-1.6c-.6-.2-.6-1 0-1.2l5.1-1.6 1.6-5.1c.1-.3.3-.5.6-.5z" />
  ),
};

export default function ChatAvatar({ mode, className = "" }) {
  const key = normalizeMode(mode);
  return (
    <span
      className={`chat-avatar chat-avatar-${key}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        {MODE_ICONS[key]}
      </svg>
    </span>
  );
}
