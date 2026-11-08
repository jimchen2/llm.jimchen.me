// app/random/page.jsx
// Random mode is disabled for now. The file stays here so it can be restored by
// uncommenting it together with the other random-mode pieces:
//   - lib/modes.js                 (the `random` entry in MODES)
//   - app/page.jsx                 (URL parsing, empty state, input placeholder)
//   - components/SettingsModal.jsx (the mode dropdown option)
//   - tests/modes.test.mjs         (the no-memory tests)
//   - .env.example                 (RANDOM_MODE_SYSTEM_PROMPT)
//
// Original implementation:
//
// 'use client';
//
// import App from '../page';
//
// export default function RandomModePage() {
//   return <App routeMode="random" />;
// }

import { notFound } from 'next/navigation';

// Not found while random mode is disabled.
export default function RandomModePage() {
  notFound();
}
