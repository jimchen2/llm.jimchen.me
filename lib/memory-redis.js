// lib/memory-redis.js
//
// A tiny in-process stand-in for the handful of Redis commands this app uses.
// It exists so `npm run dev` works with zero configuration (no Redis server,
// no API keys). It supports the commands used by the app *and* in-process
// pub/sub, which is all a single development server needs.
//
// The instance is stored on globalThis so every route bundle in the dev server
// shares exactly one store. Production always uses a real Redis server.

import { EventEmitter } from 'node:events';

const GLOBAL_KEY = Symbol.for('llm.jimchen.me/memory-redis');

function patternToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

class MemoryRedis extends EventEmitter {
  constructor() {
    super();
    // ioredis emits 'error' sometimes; never let an unhandled 'error' throw.
    this.on('error', () => {});
    // One 'message' listener per open SSE stream, plus the app's own ones.
    this.setMaxListeners(0);
    this.strings = new Map();
    this.hashes = new Map();
    this.zsets = new Map();
    this.expires = new Map();
  }

  get driver() {
    return 'memory';
  }

  /* ------------------------------ internals ------------------------------ */

  #expired(key) {
    const at = this.expires.get(key);
    if (at === undefined) return false;
    if (at > Date.now()) return false;
    this.expires.delete(key);
    this.strings.delete(key);
    this.hashes.delete(key);
    this.zsets.delete(key);
    return true;
  }

  #alive(key) {
    return !this.#expired(key);
  }

  #hash(key, create = true) {
    if (!this.#alive(key)) return null;
    let hash = this.hashes.get(key);
    if (!hash && create) {
      hash = new Map();
      this.hashes.set(key, hash);
    }
    return hash || null;
  }

  #zset(key, create = true) {
    if (!this.#alive(key)) return null;
    let zset = this.zsets.get(key);
    if (!zset && create) {
      zset = new Map();
      this.zsets.set(key, zset);
    }
    return zset || null;
  }

  /* ------------------------------- strings ------------------------------- */

  async get(key) {
    return this.#alive(key) && this.strings.has(key) ? this.strings.get(key) : null;
  }

  async set(key, value, ...args) {
    this.strings.set(key, String(value));
    if (args.length >= 2 && String(args[0]).toUpperCase() === 'EX') {
      this.expires.set(key, Date.now() + Number(args[1]) * 1000);
    }
    return 'OK';
  }

  async del(...keys) {
    let removed = 0;
    for (const key of keys.flat()) {
      this.#expired(key);
      const existed = this.strings.delete(key) || this.hashes.delete(key) || this.zsets.delete(key);
      this.expires.delete(key);
      if (existed) removed += 1;
    }
    return removed;
  }

  async keys(pattern = '*') {
    const re = patternToRegExp(pattern);
    const all = new Set([...this.strings.keys(), ...this.hashes.keys(), ...this.zsets.keys()]);
    const out = [];
    for (const key of all) {
      if (!this.#alive(key)) continue;
      if (re.test(key)) out.push(key);
    }
    return out;
  }

  async expire(key, seconds) {
    if (!this.#alive(key)) return 0;
    this.expires.set(key, Date.now() + Number(seconds) * 1000);
    return 1;
  }

  async ttl(key) {
    if (!this.#alive(key)) return -2;
    const at = this.expires.get(key);
    return at === undefined ? -1 : Math.max(0, Math.round((at - Date.now()) / 1000));
  }

  async ping() {
    return 'PONG';
  }

  /* -------------------------------- hashes ------------------------------- */

  async hset(key, field, value) {
    const hash = this.#hash(key);
    if (typeof field === 'object' && field !== null) {
      let added = 0;
      for (const [f, v] of Object.entries(field)) {
        if (!hash.has(f)) added += 1;
        hash.set(f, String(v));
      }
      return added;
    }
    const isNew = !hash.has(field);
    hash.set(field, String(value));
    return isNew ? 1 : 0;
  }

  async hsetnx(key, field, value) {
    const hash = this.#hash(key);
    if (hash.has(field)) return 0;
    hash.set(field, String(value));
    return 1;
  }

  async hget(key, field) {
    const hash = this.#hash(key, false);
    return hash && hash.has(field) ? hash.get(field) : null;
  }

  async hgetall(key) {
    const hash = this.#hash(key, false);
    return hash ? Object.fromEntries(hash) : {};
  }

  async hdel(key, ...fields) {
    const hash = this.#hash(key, false);
    if (!hash) return 0;
    let removed = 0;
    for (const field of fields.flat()) {
      if (hash.delete(field)) removed += 1;
    }
    return removed;
  }

  /* ------------------------------- sorted sets --------------------------- */

  async zadd(key, score, member) {
    const zset = this.#zset(key);
    const isNew = !zset.has(member);
    zset.set(member, Number(score));
    return isNew ? 1 : 0;
  }

  async zrem(key, ...members) {
    const zset = this.#zset(key, false);
    if (!zset) return 0;
    let removed = 0;
    for (const member of members.flat()) {
      if (zset.delete(member)) removed += 1;
    }
    return removed;
  }

  // Redis' ZREVRANGE: highest score first, negative indexes count from the end.
  async zrevrange(key, start = 0, stop = -1) {
    const zset = this.#zset(key, false);
    if (!zset) return [];
    const sorted = [...zset.entries()]
      .sort((a, b) => (b[1] - a[1]) || String(a[0]).localeCompare(String(b[0])))
      .map(([member]) => member);

    const from = start < 0 ? Math.max(sorted.length + start, 0) : start;
    const to = stop < 0 ? sorted.length + stop : stop;
    return sorted.slice(from, to + 1);
  }

  async zcard(key) {
    const zset = this.#zset(key, false);
    return zset ? zset.size : 0;
  }

  /* -------------------------------- pub/sub ------------------------------ */

  async publish(channel, message) {
    this.emit('message', channel, String(message));
    return this.listenerCount('message');
  }

  async subscribe(channel, callback) {
    if (typeof callback === 'function') setTimeout(() => callback(null, 1), 0);
    return 1;
  }

  async unsubscribe() {
    return 0;
  }

  async disconnect() {
    this.removeAllListeners('message');
    return undefined;
  }

  quit() {
    return this.disconnect();
  }
}

export function getMemoryRedis() {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = new MemoryRedis();
    Object.defineProperty(globalThis, GLOBAL_KEY, { enumerable: false, configurable: true });
  }
  return globalThis[GLOBAL_KEY];
}
