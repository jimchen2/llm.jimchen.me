// lib/desktopGate.js
//
// Random mode is desktop-only and is selected from the Mode dropdown. Phones,
// including those requesting the browser "desktop site", fail the pointer /
// hover check and are blocked too.
//
// This is an honest UI gate, not a security boundary: a hand-written HTTP
// request can always fake a header. It exists so the mode is reachable only by
// someone sitting at a computer, and never accidentally on a phone.
//
// The module is imported by client components and by API routes, so it must
// never touch `window`/`sessionStorage` at module scope.

// Sent by the client on requests that use random mode, set only after the
// desktop gate passed. The server uses it to reject random mode from elsewhere.
export const RANDOM_MODE_HEADER = 'x-random-mode-unlocked';

// Mobile/tablet User-Agents. Used by the server, which cannot inspect pointers.
const MOBILE_UA =
  /android|iphone|ipod|ipad|iemobile|windows phone|windows ce|blackberry|opera mini|mobile|tablet|kindle|silk|playbook/i;

export function isMobileUserAgent(userAgent = '') {
  return MOBILE_UA.test(String(userAgent));
}

// Browser-only: true when the device behaves like a computer — a hover-capable,
// fine-grained primary pointer and no mobile User-Agent. A phone in "desktop
// site" mode changes its UA but still reports `hover: none` / a coarse pointer,
// and a touch-screen laptop with a trackpad or mouse still counts as a computer.
export function isComputerDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (isMobileUserAgent(navigator.userAgent || '')) return false;
  if (navigator.userAgentData && navigator.userAgentData.mobile) return false;
  if (typeof window.matchMedia !== 'function') return false;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return false;
  return true;
}

// Server-half of the gate, for Next.js route handlers: the request must come
// from a non-mobile User-Agent and carry the header set by the desktop-only
// Mode dropdown.
export function allowsRandomMode(request) {
  if (!request || !request.headers) return false;
  const userAgent = request.headers.get('user-agent') || '';
  if (isMobileUserAgent(userAgent)) return false;
  return request.headers.get(RANDOM_MODE_HEADER) === '1';
}

// Headers to add to requests that continue a random-mode conversation.
export function randomModeHeaders(mode, allowed) {
  return mode === 'random' && allowed ? { [RANDOM_MODE_HEADER]: '1' } : {};
}
