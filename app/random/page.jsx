// app/random/page.jsx
//
// Random mode: no system prompt at all. Desktop only — the route is wrapped in
// RandomModeGate, and is entered from the desktop-only Mode dropdown.
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
