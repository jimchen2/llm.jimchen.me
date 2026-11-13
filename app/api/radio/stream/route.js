// GET /api/radio/stream?i=<index>   (or ?url=<encoded stream url>)
//
// Thin proxy in front of the icecast/hls servers. Two reasons it exists:
//
//  1. Mixed content: many Russian stations only offer http:// streams, which an
//     https:// page refuses to play. Proxying them through this route keeps the
//     audio same-origin and https.
//  2. Reachability: the audio element gets a stable same-origin URL, so a dead
//     upstream shows up as a clean 502 instead of an opaque network error.
//
// Only station URLs from lib/radioStations.js (by index) or an explicit public
// http(s) URL are allowed, so this cannot be used to reach internal networks.
import { RADIO_STATIONS } from '@/lib/radioStations';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PRIVATE_HOST = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|::1|\[::1\])|^172\.(1[6-9]|2\d|3[01])\./i;

function resolveTarget(searchParams) {
  const index = searchParams.get('i');
  if (index !== null) {
    const station = RADIO_STATIONS[Number(index)];
    return station ? station.url : null;
  }
  const raw = searchParams.get('url');
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  const host = parsed.hostname;
  if (PRIVATE_HOST.test(host)) return null;
  // Bare hostnames must look like public DNS names.
  if (!host.includes('.') && !host.includes(':')) return null;
  return parsed.href;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const target = resolveTarget(searchParams);
  if (!target) {
    return new Response('Bad radio stream target', { status: 400 });
  }

  const range = request.headers.get('range');
  const controller = new AbortController();
  // Do not keep an abandoned player alive forever.
  const timer = setTimeout(() => controller.abort(), 30 * 60 * 1000);

  let upstream;
  try {
    upstream = await fetch(target, {
      headers: {
        ...(range ? { Range: range } : {}),
        'User-Agent': 'llm.jimchen.me radio proxy',
        Accept: 'audio/*,application/vnd.apple.mpegurl,*/*;q=0.8',
      },
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    return new Response('Radio stream unreachable', { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer);
    return new Response('Radio stream unavailable', { status: 502 });
  }

  const headers = new Headers();
  for (const key of ['content-type', 'content-length', 'accept-ranges', 'content-range']) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (!headers.has('content-type')) headers.set('content-type', 'audio/mpeg');
  headers.set('cache-control', 'no-store');
  headers.set('access-control-allow-origin', '*');

  // Copy the body through and abort the upstream request when the client leaves.
  const body = new ReadableStream({
    async start(streamController) {
      const reader = upstream.body.getReader();
      request.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        controller.abort();
        reader.cancel().catch(() => {});
        try {
          streamController.close();
        } catch {
          /* already closed */
        }
      });
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          streamController.enqueue(value);
        }
        streamController.close();
      } catch (err) {
        controller.abort();
        try {
          streamController.error(err);
        } catch {
          /* already errored */
        }
      } finally {
        clearTimeout(timer);
      }
    },
    cancel() {
      clearTimeout(timer);
      controller.abort();
    },
  });

  return new Response(body, { status: upstream.status, headers });
}
