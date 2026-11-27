import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RANDOM_MODE_HEADER,
  allowsRandomMode,
  isComputerDevice,
  isMobileUserAgent,
  randomModeHeaders,
} from '../lib/desktopGate.js';

const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const PHONE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
// A phone asking for the "desktop site": the UA looks like a computer.
const PHONE_DESKTOP_MODE_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function request(headers) {
  const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { headers: { get: (name) => map.get(String(name).toLowerCase()) ?? null } };
}

test('mobile User-Agents are recognised, desktop ones are not', () => {
  assert.equal(isMobileUserAgent(PHONE_UA), true);
  assert.equal(isMobileUserAgent(IPHONE_UA), true);
  assert.equal(isMobileUserAgent(DESKTOP_UA), false);
  assert.equal(isMobileUserAgent(PHONE_DESKTOP_MODE_UA), false);
  assert.equal(isMobileUserAgent(''), false);
});

test('the device is not a computer outside a browser', () => {
  // Server-side rendering has no window/navigator, so random mode stays off.
  assert.equal(isComputerDevice(), false);
});

test('server gate needs the desktop-mode header and rejects mobile clients', () => {
  assert.equal(allowsRandomMode(request({ 'user-agent': DESKTOP_UA, [RANDOM_MODE_HEADER]: '1' })), true);
  assert.equal(allowsRandomMode(request({ 'user-agent': DESKTOP_UA })), false);
  // A phone in "desktop site" mode can fake the UA, but its coarse pointer
  // prevents the client from setting this header; mobile UAs are rejected too.
  assert.equal(allowsRandomMode(request({ 'user-agent': PHONE_UA, [RANDOM_MODE_HEADER]: '1' })), false);
  assert.equal(allowsRandomMode(request({ [RANDOM_MODE_HEADER]: '1' })), true); // no UA at all
  assert.equal(allowsRandomMode(null), false);
});

test('random-mode headers are only added for random mode on a computer', () => {
  assert.deepEqual(randomModeHeaders('random', true), { [RANDOM_MODE_HEADER]: '1' });
  assert.deepEqual(randomModeHeaders('random', false), {});
  assert.deepEqual(randomModeHeaders('default', true), {});
});
