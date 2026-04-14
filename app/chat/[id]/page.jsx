// app/chat/[id]/page.jsx
'use client';

// We just import the existing root page component which already handles 
// the URL parsing and routing logic in its useEffect.
import App from '../../page';

export default function ChatRoute() {
  return <App />;
}
