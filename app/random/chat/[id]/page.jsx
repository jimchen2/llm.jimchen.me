// app/random/chat/[id]/page.jsx
//
// Random mode (no system prompt), visible on every device. Kept as its own
// route so a reload, bookmark or shared link reopens the same conversation in
// the same mode; on a phone the chat is read-only.
'use client';

import App from '../../../page';
import RandomModeGate from '../../../../components/RandomModeGate';

export default function RandomChatRoute() {
  return (
    <RandomModeGate>
      <App routeMode="random" />
    </RandomModeGate>
  );
}
