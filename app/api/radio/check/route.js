// app/api/radio/check/route.js
//
// One-shot availability check for /radio. The browser posts the stream URLs it
// knows about; the server probes them in parallel (a cross-origin fetch from the
// page cannot see status codes) and streams the verdicts back as NDJSON so
// cards can dim one by one.
//
// There is deliberately no polling: the page calls this once on load, and again
// only if the user presses "Проверить снова". Results are cached in memory for a
// few minutes so a plain refresh is cheap.
import { NextResponse } from 'next/server';
import {
  CACHE_NEGATIVE_TTL_MS,
  CACHE_TTL_MS,
  normalizeStreamUrl,
  probeStream,
} from '@/lib/radio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONCURRENCY = 12;
const MAX_URLS = 80;

/** url -> { ok, status, contentType, error, at } */
const cache = new Map();

function cached(url, force) {
  const hit = cache.get(url);
  if (!hit || force) return null;
  const ttl = hit.ok ? CACHE_TTL_MS : CACHE_NEGATIVE_TTL_MS;
  return Date.now() - hit.at < ttl ? hit : null;
}

function payload(url, hit, extra = {}) {
  return {
    url,
    ok: hit.ok,
    status: hit.status,
    contentType: hit.contentType,
    ...(hit.error ? { error: hit.error } : {}),
    ...extra,
  };
}

export async function POST(request) {
  let raw;
  try {
    const body = await request.json();
    raw = Array.isArray(body?.urls) ? body.urls : [];
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const force = request.nextUrl.searchParams.get('force') === '1';
  const urls = [...new Set(raw.map(normalizeStreamUrl).filter(Boolean))].slice(0, MAX_URLS);
  if (!urls.length) {
    return NextResponse.json({ error: 'No valid stream URLs' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const state = { closed: false };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data) => {
        if (state.closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(data)}\n`));
        } catch {
          state.closed = true;
        }
      };

      const fresh = [];
      for (const url of urls) {
        const hit = cached(url, force);
        if (hit) send(payload(url, hit, { cached: true }));
        else fresh.push(url);
      }

      let next = 0;
      const worker = async () => {
        while (!state.closed && next < fresh.length) {
          const url = fresh[next++];
          const result = await probeStream(url);
          cache.set(url, { ...result, at: Date.now() });
          send(payload(url, result));
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, fresh.length) }, worker)
      );

      if (!state.closed) {
        send({ done: true });
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      state.closed = true;
    },
  });

  // Drop the client's connection from the worker pool as soon as it goes away.
  request.signal?.addEventListener?.('abort', () => {
    state.closed = true;
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
