import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FRESH_FAIL_MS,
  FRESH_OK_MS,
  clearProbeCache,
  firstPlaylistTarget,
  getProbeCache,
  isHlsUrl,
  probeStation,
  probeStations,
} from '../lib/radio.js';

const realFetch = globalThis.fetch;

function mockFetch(handler) {
  globalThis.fetch = async (url, init) => handler(String(url), init || {});
}

function audioResponse(bytes = 4096) {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes).fill(0xff));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
}

test.afterEach(() => {
  globalThis.fetch = realFetch;
  clearProbeCache();
});

test('isHlsUrl detects playlists and ignores plain streams', () => {
  assert.equal(isHlsUrl('https://x/y/index.m3u8'), true);
  assert.equal(isHlsUrl('https://x/y/index.m3u8?token=1'), true);
  assert.equal(isHlsUrl('https://x/y/stream.mp3'), false);
  assert.equal(isHlsUrl(undefined), false);
});

test('firstPlaylistTarget resolves relative segment URIs', () => {
  const playlist = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-STREAM-INF:BANDWIDTH=128000',
    'chunklist_b128000.m3u8',
    '#EXTINF:10,',
    'seg1.aac',
  ].join('\n');
  assert.equal(
    firstPlaylistTarget(playlist, 'https://host/live/index.m3u8'),
    'https://host/live/chunklist_b128000.m3u8'
  );
  assert.equal(
    firstPlaylistTarget('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="a/aac.m3u8"\n', 'https://host/live/index.m3u8'),
    'https://host/live/a/aac.m3u8'
  );
  assert.equal(firstPlaylistTarget('#EXTM3U', 'https://host/live/index.m3u8'), null);
});

test('a live audio stream counts as available and is cached', async () => {
  let calls = 0;
  mockFetch(() => {
    calls++;
    return audioResponse();
  });

  const first = await probeStation({ url: 'https://live.example/a.mp3' });
  assert.equal(first.ok, true);
  assert.equal(first.reason, 'ok');

  // Second probe within the freshness window hits the cache, not the network.
  const second = await probeStation({ url: 'https://live.example/a.mp3' });
  assert.equal(second.ok, true);
  assert.equal(calls, 1);
  assert.ok(getProbeCache().has('https://live.example/a.mp3'));

  // force=1 bypasses the cache.
  await probeStation({ url: 'https://live.example/a.mp3' }, { force: true });
  assert.equal(calls, 2);
});

test('http errors, empty bodies and html pages count as down', async () => {
  const cases = {
    'https://live.example/404': () => new Response('nope', { status: 404 }),
    'https://live.example/empty': () =>
      new Response(new ReadableStream({ start: (c) => c.close() }), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    'https://live.example/html': () =>
      new Response('<html>station is offline</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
  };
  mockFetch((url) => cases[url]());

  for (const url of Object.keys(cases)) {
    const result = await probeStation({ url }, { maxBytes: 64 });
    assert.equal(result.ok, false, url);
  }
  assert.equal((await probeStation({ url: 'https://live.example/404' }, { force: true })).reason, 'http_404');
  assert.equal((await probeStation({ url: 'https://live.example/empty' }, { force: true })).reason, 'no_data');
  assert.equal((await probeStation({ url: 'https://live.example/html' }, { force: true })).reason, 'not_audio');
});

test('network failures and timeouts are reported, never thrown', async () => {
  mockFetch(() => {
    throw new TypeError('fetch failed');
  });
  const unreachable = await probeStation({ url: 'https://dead.example/a.mp3' }, { force: true });
  assert.equal(unreachable.ok, false);
  assert.equal(unreachable.reason, 'unreachable');

  clearProbeCache();
  mockFetch((url, init) => new Promise((resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    });
  }));
  const timedOut = await probeStation({ url: 'https://slow.example/a.mp3' }, { force: true, timeoutMs: 50 });
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.reason, 'timeout');
});

test('HLS playlists are followed to their audio target', async () => {
  mockFetch((url) => {
    if (url.endsWith('index.m3u8')) {
      return new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=128000\nlive.aac\n', {
        status: 200,
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
      });
    }
    return audioResponse();
  });

  const result = await probeStation({ url: 'https://hls.example/index.m3u8' }, { force: true });
  assert.equal(result.ok, true);
  assert.equal(result.hls, true);
});

test('failures go stale faster than successes and keep a failure counter', async () => {
  assert.ok(FRESH_FAIL_MS < FRESH_OK_MS);
  mockFetch(() => new Response('gone', { status: 503 }));
  const missing = await probeStation({ url: 'https://x.example/a' });
  assert.equal(missing.ok, false);
  assert.equal(missing.failureCount, 1);
  const again = await probeStation({ url: 'https://x.example/a' }, { force: true });
  assert.equal(again.failureCount, 2);
  const recovered = await probeStation({ url: 'https://x.example/a' }, { force: true, timeoutMs: 100 });
  assert.equal(recovered.ok, false);
});

test('a station recovers after the failure cache goes stale', async () => {
  let up = false;
  mockFetch(() => (up ? audioResponse() : new Response('down', { status: 500 })));

  const down = await probeStation({ url: 'https://flaky.example/a' });
  assert.equal(down.ok, false);

  up = true;
  // Simulate the failure result aging out.
  getProbeCache().get('https://flaky.example/a').checkedAt = Date.now() - FRESH_FAIL_MS - 1;
  const back = await probeStation({ url: 'https://flaky.example/a' });
  assert.equal(back.ok, true);
  assert.equal(back.failureCount, 0);
});

test('probeStations keeps result order and bounds concurrency', async () => {
  let inFlight = 0;
  let peak = 0;
  mockFetch(async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return audioResponse();
  });

  const stations = Array.from({ length: 12 }, (_, i) => ({ url: `https://s.example/${i}` }));
  const results = await probeStations(stations, { concurrency: 3 });
  assert.equal(results.length, 12);
  assert.ok(results.every((r) => r.ok));
  assert.ok(peak <= 3, `peak concurrency was ${peak}`);
});

test('a station without a url is reported as no_stream', async () => {
  const result = await probeStation({ url: '' }, { force: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no_stream');
});
