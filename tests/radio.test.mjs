import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyProbe,
  normalizeStreamUrl,
  probeStream,
} from '../lib/radio.js';

test('only absolute http(s) stream URLs are accepted', () => {
  assert.equal(normalizeStreamUrl('https://icecast-vgtrk.cdnvideo.ru/mayakfm_mp3_192kbps'),
    'https://icecast-vgtrk.cdnvideo.ru/mayakfm_mp3_192kbps');
  assert.equal(normalizeStreamUrl('  http://77.39.8.49:8000/vera_air_96 '),
    'http://77.39.8.49:8000/vera_air_96');
  for (const bad of ['', '   ', 'not a url', 'ftp://example.com/a.mp3',
    'javascript:alert(1)', 'data:audio/mp3;base64,AAAA']) {
    assert.equal(normalizeStreamUrl(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test('a 2xx audio response means the stream is available', () => {
  assert.equal(classifyProbe({ status: 200, contentType: 'audio/mpeg' }).ok, true);
  assert.equal(classifyProbe({ status: 206, contentType: 'audio/aac' }).ok, true);
  assert.equal(
    classifyProbe({ status: 200, contentType: 'application/vnd.apple.mpegurl' }).ok,
    true
  );
});

test('error statuses and HTML pages count as unavailable', () => {
  for (const status of [301, 401, 403, 404, 410, 500, 503, 0]) {
    assert.equal(classifyProbe({ status, contentType: 'audio/mpeg' }).ok, false, `status ${status}`);
  }
  // Icecast answers a missing mount with a 200 HTML page.
  assert.equal(classifyProbe({ status: 200, contentType: 'text/html; charset=utf-8' }).ok, false);
});

test('probeStream hangs up right after the response head', async () => {
  let cancelled = false;
  let seen = null;
  const fakeFetch = async (url, init) => {
    seen = { url, init };
    assert.ok(init.signal, 'an abort signal must be passed');
    return {
      status: 200,
      headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'audio/mpeg' : null) },
      body: { cancel: async () => { cancelled = true; } },
    };
  };
  const result = await probeStream('https://example.com/stream.mp3', { fetchImpl: fakeFetch });
  assert.equal(result.ok, true);
  assert.equal(cancelled, true, 'the body must be released, not downloaded');
  assert.equal(seen.url, 'https://example.com/stream.mp3');
  assert.equal(seen.init.method, 'GET');
  assert.equal(seen.init.headers.Range, 'bytes=0-4095');
});

test('probeStream reports network failures and timeouts as unavailable', async () => {
  const boom = await probeStream('https://dead.example/x', {
    fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND'); },
  });
  assert.equal(boom.ok, false);
  assert.match(boom.error, /ENOTFOUND/);

  const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
  const slow = await probeStream('https://slow.example/x', {
    timeoutMs: 5,
    fetchImpl: () => new Promise((_, reject) => setTimeout(() => reject(abortErr), 20)),
  });
  assert.equal(slow.ok, false);
  assert.equal(slow.error, 'timeout');
});
