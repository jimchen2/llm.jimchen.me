// lib/desktopGate.js
//
// Random mode is visible on every device — its conversations are listed and
// opened exactly like the others — but only a computer can write to it. Phones
// and tablets, including those requesting the browser "desktop site", fail the
// pointer / hover check, so their random-mode chats render read-only and the
// API refuses writes that do not come from a computer.
//
// This is an honest UI gate, not a security boundary: a hand-written HTTP
// request can always fake a header. It exists so random mode is never written
// to accidentally from a phone.
//
// The module is imported by client components and by API routes, so it must
// never touch `window`/`sessionStorage` at module scope.

// Sent by the client on requests that write to random mode, set only after the
// computer check passed. The server uses it to reject random-mode writes from
// elsewhere.
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
// Random mode is read-only whenever this returns false.
export function isComputerDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (isMobileUserAgent(navigator.userAgent || '')) return false;
  if (navigator.userAgentData && navigator.userAgentData.mobile) return false;
  if (typeof window.matchMedia !== 'function') return false;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return false;
  return true;
}

// Server-half of the write gate, for Next.js route handlers: the request must
// come from a non-mobile User-Agent and carry the header the client sets once
// isComputerDevice() has passed.
export function allowsRandomMode(request) {
  if (!request || !request.headers) return false;
  const userAgent = request.headers.get('user-agent') || '';
  if (isMobileUserAgent(userAgent)) return false;
  return request.headers.get(RANDOM_MODE_HEADER) === '1';
}

// Headers to add to requests that write to a random-mode conversation.
export function randomModeHeaders(mode, allowed) {
  return mode === 'random' && allowed ? { [RANDOM_MODE_HEADER]: '1' } : {};
}
