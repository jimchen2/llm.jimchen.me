// components/RandomModeGate.jsx
//
// Random mode is visible everywhere, exactly like any other conversation:
// /random and /random/chat/[id] render the normal chat UI on a phone too. On a
// device that is not a computer the app shows the chat read-only instead of
// sending anything (see randomReadOnly in app/page.jsx).
//
// This wrapper only delays the first render until the browser is available, so
// the computer/phone decision comes from real pointer and User-Agent data
// rather than from the server render (which cannot inspect either).
'use client';

import { useEffect, useState } from 'react';

export default function RandomModeGate({ children }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Same empty frame the chat fills; no redirect and no "blocked" message.
    return <div style={{ height: '100dvh' }} aria-busy="true" />;
  }

  return children;
}
