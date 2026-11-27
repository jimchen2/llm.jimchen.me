// components/RandomModeGate.jsx
//
// Random mode is desktop-only (see lib/desktopGate.js). A phone — or a phone
// that asked for the "desktop site" — opening /random directly is sent back to
// the default mode instead of getting a random-mode UI it cannot use.
'use client';

import { useEffect, useState } from 'react';
import { isComputerDevice } from '../lib/desktopGate';

export default function RandomModeGate({ children }) {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    // The check needs a real browser, so it runs after mount. Until then
    // nothing is rendered, which keeps the chat UI from flashing on a phone.
    if (isComputerDevice()) {
      setAllowed(true);
      return;
    }
    window.location.replace('/');
  }, []);

  if (!allowed) {
    return (
      <div className="d-flex align-items-center justify-content-center text-muted text-center p-4" style={{ height: '100dvh' }}>
        Random mode is only available on a computer.
      </div>
    );
  }

  return children;
}
