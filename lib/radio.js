// lib/radio.js
// Helpers for the /radio page's one-shot stream availability check.
// Kept free of Next.js imports so they can be unit tested with plain node.

export const PROBE_TIMEOUT_MS = 6000;

// A dead stream is retried sooner than a healthy one, so a station that comes
// back to life shows up on the next refresh without waiting the full TTL.
export const CACHE_TTL_MS = 10 * 60 * 1000;
export const CACHE_NEGATIVE_TTL_MS = 2 * 60 * 1000;

// Content types that are clearly an error/landing page rather than audio.
const HTML_TYPES = ['text/html', 'application/xhtml'];

/** Accept only absolute http(s) URLs; everything else is dropped. */
export function normalizeStreamUrl(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Turn a raw response head into an availability verdict.
 * A 2xx that is not an HTML page counts as "the stream answered".
 */
export function classifyProbe({ status, contentType } = {}) {
  const type = String(contentType || '').toLowerCase();
  const okStatus = Number(status) >= 200 && Number(status) < 300;
  const looksLikeHtml = HTML_TYPES.some((t) => type.includes(t));
  return { ok: okStatus && !looksLikeHtml, status: Number(status) || 0, contentType: type };
}

/**
 * GET the stream, abort as soon as the response head arrives, and report
 * whether something playable answered. No body is downloaded.
 */
export async function probeStream(url, { timeoutMs = PROBE_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        // Icecast/Shoutcast servers often dislike HEAD; ask for a tiny range
        // of a normal GET instead and hang up right after the headers.
        Range: 'bytes=0-4095',
        Accept: '*/*',
        'User-Agent': 'Mozilla/5.0 (compatible; llm.jimchen.me radio health check)',
      },
    });
    const verdict = classifyProbe({
      status: res.status,
      contentType: res.headers.get('content-type'),
    });
    // Free the socket: we only wanted the response head.
    try {
      await res.body?.cancel();
    } catch {
      /* ignore */
    }
    return verdict;
  } catch (err) {
    const aborted = err && (err.name === 'AbortError' || err.name === 'TimeoutError');
    return {
      ok: false,
      status: 0,
      contentType: '',
      error: aborted ? 'timeout' : String((err && err.message) || err),
    };
  } finally {
    clearTimeout(timer);
  }
}
