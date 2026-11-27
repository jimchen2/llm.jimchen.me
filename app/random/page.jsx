// app/random/page.jsx
//
// Random mode: no system prompt at all. Available on every device — the mode
// can be picked from the Mode dropdown anywhere; on a phone the chat is shown
// read-only (no composer, no edit/branch/delete).
'use client';

import App from '../page';
import RandomModeGate from '../../components/RandomModeGate';

export default function RandomModePage() {
  return (
    <RandomModeGate>
      <App routeMode="random" />
    </RandomModeGate>
  );
}
