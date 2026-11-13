// Stream availability probing for the /radio page.
//
// The browser cannot reliably tell "this station is offline" from "this station
// refuses cross-origin audio" or "this stream is http:// on an https:// page",
// so the availability check runs on the server. A station counts as up when it
// answers with a 2xx and starts pushing bytes that look like audio (or, for
// HLS, when its playlist resolves to a segment/child playlist that does).
//
// Nothing here imports Next.js so it can be unit-tested with `node --test`.

// How long a single probe may take, and how many bytes we insist on seeing
// before declaring a stream healthy. Live icecast streams send bytes forever,
// so we always stop reading after the first chunk(s).
const DEFAULT_PROBE_TIMEOUT_MS = 6000;
const DEFAULT_PROBE_BYTES = 16384;

// A result this young is reused without re-probing. Failures go stale quickly so
// a station that comes back is picked up on the next poll; successes are held a
// little longer to keep the status endpoint cheap.
export const FRESH_OK_MS = 5 * 60 * 1000;
export const FRESH_FAIL_MS = 60 * 1000;

const AUDIO_HINTS = ['audio/', 'mpegurl', 'mpeg', 'mp3', 'aac', 'ogg', 'opus', 'webm', 'flac'];

export function isHlsUrl(url) {
  return /\.m3u8($|\?)/i.test(String(url || ''));
}

function looksLikeAudio(contentType) {
  const ct = String(contentType || '').toLowerCase();
  return AUDIO_HINTS.some((hint) => ct.includes(hint));
}

// Some icecast servers answer with text/html or application/octet-stream but
// still push audio. Fall back to sniffing the first bytes for a known magic
// number / frame sync (MP3, ADTS AAC, OggS, fLaC, EBML).
function sniffAudioBytes(bytes) {
  if (!bytes || bytes.length < 2) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true; // ID3
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true; // MPEG/AAC frame sync
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return true; // OggS
  if (bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) return true; // fLaC
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return true; // EBML
  return false;
}

// Read the response body only until we have `maxBytes`, then abort. Live streams
// never end, so this is the only way to "ping" one without hanging.
async function readSome(controller, reader, maxBytes, startedAt, timeoutMs, earlyBytes) {
  const chunks = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      // Enough evidence already (a real audio header arrived): stop early so a
      // healthy station does not have to fill the whole budget before we say OK.
      if (earlyBytes && total >= earlyBytes) break;
      const remaining = timeoutMs - (Date.now() - startedAt);
      if (remaining <= 0) break;
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length) {
        chunks.push(value);
        total += value.length;
      }
    }
  } catch {
    // Aborting mid-read surfaces as an error; whatever we got still counts.
  }
  if (chunks.length === 1) return chunks[0];
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.length;
  }
  return buf;
}

// Parse an HLS playlist and return the absolute URL of the first thing that is
// itself a stream: a child playlist, a variant, or a media segment.
export function firstPlaylistTarget(playlistText, playlistUrl) {
  const lines = String(playlistText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('#')) {
      const match = line.match(/URI="([^"]+)"/);
      if (match) {
        try {
          return new URL(match[1], playlistUrl).href;
        } catch {
          /* ignore malformed URI */
        }
      }
      continue;
    }
    try {
      return new URL(line, playlistUrl).href;
    } catch {
      /* ignore malformed URI */
    }
  }
  return null;
}

async function probeOnce(url, budget, depth) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget.timeoutMs);

  try {
    const response = await fetch(url, {
      // Some icecast servers reject HEAD, and we need bytes anyway to prove the
      // stream is live, so always use a ranged GET.
      method: 'GET',
      headers: {
        Range: `bytes=0-${Math.max(budget.maxBytes - 1, 0)}`,
        'User-Agent': 'llm.jimchen.me radio status checker',
        Accept: 'audio/*,*/*;q=0.8',
      },
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, reason: `http_${response.status}` };
    }

    const contentType = response.headers.get('content-type') || '';

    // HLS: the playlist itself is not audio, so follow it one level down.
    if (!response.body || isHlsUrl(url) || /mpegurl/i.test(contentType)) {
      const text = await response.text();
      const target = firstPlaylistTarget(text, url);
      clearTimeout(timer);
      if (!target) return { ok: false, reason: 'empty_playlist', contentType };
      if (depth <= 0) return { ok: false, reason: 'playlist_too_deep', contentType };
      const nested = await probeOnce(target, { ...budget, timeoutMs: Math.max(2000, budget.timeoutMs - (Date.now() - startedAt)) }, depth - 1);
      return { ...nested, contentType: nested.contentType || contentType, hls: true };
    }

    const reader = response.body.getReader();
    // An audio content-type plus a couple of KB of real data is proof enough;
    // for everything else keep reading up to the full budget to sniff the header.
    const earlyBytes = looksLikeAudio(contentType) ? Math.min(2048, budget.maxBytes) : 0;
    const bytes = await readSome(
      controller,
      reader,
      budget.maxBytes,
      startedAt,
      budget.timeoutMs,
      earlyBytes
    );
    try {
      await reader.cancel();
    } catch {
      /* already closed */
    }

    if (bytes.length === 0) {
      return { ok: false, reason: 'no_data', contentType };
    }
    if (looksLikeAudio(contentType) || sniffAudioBytes(bytes)) {
      return { ok: true, contentType, bytes: bytes.length };
    }
    // Content-type says HTML/text and the body does not look like audio: the
    // "stream" is almost certainly a dead link or an error page.
    if (/text\/html|text\/plain/i.test(contentType)) {
      return { ok: false, reason: 'not_audio', contentType };
    }
    return { ok: false, reason: 'unexpected_content', contentType };
  } catch (err) {
    const reason = err && err.name === 'AbortError' ? 'timeout' : 'unreachable';
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
    // Make sure the socket is not left open for a live stream.
    try {
      controller.abort();
    } catch {
      /* noop */
    }
  }
}

// In-process probe cache. One radio page poll produces one probe per station;
// every other visitor inside the freshness window reuses that result, so we
// never hammer the upstream servers.
const cache = new Map(); // url -> { ok, reason, contentType, checkedAt, failureCount }

function isFresh(entry, now) {
  if (!entry) return false;
  return now - entry.checkedAt < (entry.ok ? FRESH_OK_MS : FRESH_FAIL_MS);
}

export function getProbeCache() {
  return cache;
}

export function clearProbeCache() {
  cache.clear();
}

export function clearProbeCacheFor(url) {
  if (url) cache.delete(url);
}

export async function probeStation(station, options = {}) {
  const now = Date.now();
  const url = station && station.url;
  if (!url) return { ok: false, reason: 'no_stream', checkedAt: now };

  const cached = cache.get(url);
  if (!options.force && isFresh(cached, now)) return cached;

  const budget = {
    timeoutMs: options.timeoutMs || DEFAULT_PROBE_TIMEOUT_MS,
    maxBytes: options.maxBytes || DEFAULT_PROBE_BYTES,
  };
  const result = await probeOnce(url, budget, 2);
  const entry = {
    ok: !!result.ok,
    reason: result.reason || (result.ok ? 'ok' : 'unknown'),
    contentType: result.contentType || '',
    hls: !!result.hls,
    checkedAt: Date.now(),
    // Kept for diagnostics: how many times in a row a station has failed.
    failureCount: result.ok ? 0 : (cached ? cached.failureCount || 0 : 0) + 1,
  };
  cache.set(url, entry);
  return entry;
}

// Non-blocking status snapshot used by the API route: report whatever we already
// know and, if anything is missing or stale, refresh it in the background so the
// HTTP response never waits on 40 upstream probes.
let sweepPromise = null;

export function hasFreshResult(url) {
  return isFresh(cache.get(url), Date.now());
}

export function startBackgroundSweep(stations, options = {}) {
  if (sweepPromise) return sweepPromise;
  sweepPromise = probeStations(stations, options).finally(() => {
    sweepPromise = null;
  });
  return sweepPromise;
}

// Wait for an in-flight sweep, but never longer than `ms`. A cold cache on a
// serverless host would otherwise leave every station "pending" forever, while a
// long-running host is happy with the short wait too (the sweep keeps going).
export async function waitForSweep(ms) {
  if (!sweepPromise) return;
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(resolve, Math.max(0, ms));
  });
  try {
    await Promise.race([sweepPromise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

// Probe every station with bounded concurrency so a page poll does not open 40
// sockets at once.
export async function probeStations(stations, options = {}) {
  const concurrency = Math.max(1, options.concurrency || 8);
  const results = new Array(stations.length);
  let next = 0;

  async function worker() {
    while (next < stations.length) {
      const index = next++;
      results[index] = await probeStation(stations[index], options);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, stations.length) }, worker));
  return results;
}
