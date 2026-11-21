// lib/memoryStore.js
//
// A tiny in-memory stand-in for Redis, used only in test mode (TEST_MODE=true)
// so the site can be previewed without a Redis server. It implements just the
// commands this app calls: strings, hashes, sorted sets, expiry and pub/sub.
//
// The state lives on globalThis because Next.js bundles each route handler
// separately: in production those bundles share one Node process, but not
// necessarily one module instance, so a module-level Map would not be shared.
//
// This is for local previews only — it holds everything in process memory and
// is lost on restart.

import { buildSeedCommands } from './testConversations.js';

const GLOBAL_KEY = '__llmJimchenMemoryStore';

function createState() {
  return {
    str: new Map(), // key -> string
    hash: new Map(), // key -> Map(field -> value)
    zset: new Map(), // key -> Map(member -> score)
    expiry: new Map(), // key -> epoch ms
    channels: new Map(), // channel -> Set<client>
    seeded: false,
  };
}

function alive(state, key) {
  const exp = state.expiry.get(key);
  if (exp !== undefined && Date.now() >= exp) {
    state.str.delete(key);
    state.hash.delete(key);
    state.zset.delete(key);
    state.expiry.delete(key);
    return false;
  }
  return true;
}

function has(state, key) {
  return state.str.has(key) || state.hash.has(key) || state.zset.has(key);
}

function patternToRegExp(pattern) {
  if (!pattern || pattern === '*') return null;
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

// Runs one command synchronously and returns the Redis-style value.
function run(state, client, name, args) {
  const cmd = String(name).toLowerCase();
  const a = args;

  switch (cmd) {
    case 'get': {
      if (!alive(state, a[0])) return null;
      return state.str.has(a[0]) ? state.str.get(a[0]) : null;
    }
    case 'set': {
      const [key, value, ...rest] = a;
      let nx = false;
      let xx = false;
      let ttlMs = null;
      for (let i = 0; i < rest.length; i++) {
        const opt = String(rest[i]).toLowerCase();
        if (opt === 'nx') nx = true;
        else if (opt === 'xx') xx = true;
        else if (opt === 'ex' || opt === 'px') {
          const n = Number(rest[++i]);
          ttlMs = opt === 'ex' ? n * 1000 : n;
        } else if (opt === 'keepttl') {
          // no-op: kept ttl is already preserved unless we overwrite it below
        }
      }
      const existsNow = alive(state, key) && has(state, key);
      if (nx && existsNow) return null;
      if (xx && !existsNow) return null;
      state.str.set(key, value == null ? '' : String(value));
      state.hash.delete(key);
      state.zset.delete(key);
      if (ttlMs != null) state.expiry.set(key, Date.now() + ttlMs);
      else state.expiry.delete(key);
      return 'OK';
    }
    case 'del':
    case 'unlink': {
      let n = 0;
      for (const key of a) {
        if (alive(state, key) && has(state, key)) n++;
        state.str.delete(key);
        state.hash.delete(key);
        state.zset.delete(key);
        state.expiry.delete(key);
      }
      return n;
    }
    case 'exists': {
      let n = 0;
      for (const key of a) if (alive(state, key) && has(state, key)) n++;
      return n;
    }
    case 'expire': {
      const [key, seconds] = a;
      if (!alive(state, key) || !has(state, key)) return 0;
      state.expiry.set(key, Date.now() + Number(seconds) * 1000);
      return 1;
    }
    case 'ttl': {
      if (!alive(state, a[0]) || !has(state, a[0])) return -2;
      const exp = state.expiry.get(a[0]);
      return exp === undefined ? -1 : Math.max(0, Math.round((exp - Date.now()) / 1000));
    }
    case 'keys': {
      const re = patternToRegExp(a[0]);
      const out = [];
      for (const key of new Set([...state.str.keys(), ...state.hash.keys(), ...state.zset.keys()])) {
        if (!alive(state, key)) continue;
        if (!re || re.test(key)) out.push(key);
      }
      return out;
    }
    case 'hset':
    case 'hmset': {
      const key = a[0];
      alive(state, key);
      const hash = state.hash.get(key) || new Map();
      let added = 0;
      const rest = a.slice(1);
      if (rest.length === 1 && rest[0] && typeof rest[0] === 'object') {
        for (const [field, value] of Object.entries(rest[0])) {
          if (!hash.has(field)) added++;
          hash.set(field, value == null ? '' : String(value));
        }
      } else {
        for (let i = 0; i + 1 < rest.length; i += 2) {
          if (!hash.has(rest[i])) added++;
          hash.set(String(rest[i]), rest[i + 1] == null ? '' : String(rest[i + 1]));
        }
      }
      state.hash.set(key, hash);
      return cmd === 'hmset' ? 'OK' : added;
    }
    case 'hget': {
      if (!alive(state, a[0])) return null;
      const hash = state.hash.get(a[0]);
      return hash && hash.has(a[1]) ? hash.get(a[1]) : null;
    }
    case 'hgetall': {
      const out = {};
      if (!alive(state, a[0])) return out;
      const hash = state.hash.get(a[0]);
      if (hash) for (const [field, value] of hash) out[field] = value;
      return out;
    }
    case 'hdel': {
      const hash = alive(state, a[0]) ? state.hash.get(a[0]) : null;
      let n = 0;
      if (hash) for (const field of a.slice(1)) if (hash.delete(field)) n++;
      return n;
    }
    case 'zadd': {
      const key = a[0];
      alive(state, key);
      const zset = state.zset.get(key) || new Map();
      let added = 0;
      for (let i = 1; i + 1 < a.length; i += 2) {
        const score = Number(a[i]);
        const member = String(a[i + 1]);
        if (!zset.has(member)) added++;
        zset.set(member, score);
      }
      state.zset.set(key, zset);
      return added;
    }
    case 'zrem': {
      const zset = alive(state, a[0]) ? state.zset.get(a[0]) : null;
      let n = 0;
      if (zset) for (const member of a.slice(1)) if (zset.delete(String(member))) n++;
      return n;
    }
    case 'zrevrange':
    case 'zrange': {
      if (!alive(state, a[0])) return [];
      const zset = state.zset.get(a[0]);
      if (!zset) return [];
      const reverse = cmd === 'zrevrange';
      const sorted = [...zset.entries()].sort((x, y) =>
        reverse ? y[1] - x[1] || (x[0] < y[0] ? 1 : -1) : x[1] - y[1] || (x[0] < y[0] ? -1 : 1)
      );
      const start = parseInt(a[1], 10) || 0;
      const stop = parseInt(a[2], 10);
      const from = start < 0 ? Math.max(0, sorted.length + start) : start;
      const to = Number.isFinite(stop) ? (stop < 0 ? sorted.length + stop : stop) : sorted.length - 1;
      return sorted.slice(from, to + 1).map(([member]) => member);
    }
    case 'publish': {
      const [channel, message] = a;
      const set = state.channels.get(channel);
      let receivers = 0;
      if (set) {
        for (const target of set) {
          for (const handler of target.messageHandlers) {
            handler(channel, message);
            receivers = 1;
          }
        }
      }
      return receivers ? set.size : 0;
    }
    case 'subscribe': {
      for (const rawChannel of a) {
        const channel = String(rawChannel);
        if (!state.channels.has(channel)) state.channels.set(channel, new Set());
        state.channels.get(channel).add(client);
        client.channels.add(channel);
      }
      return 'OK';
    }
    case 'unsubscribe': {
      const channels = a.length ? a.map(String) : [...client.channels];
      for (const channel of channels) {
        const set = state.channels.get(channel);
        if (set) {
          set.delete(client);
          if (set.size === 0) state.channels.delete(channel);
        }
        client.channels.delete(channel);
      }
      return 'OK';
    }
    default:
      throw new Error(`Memory store: unsupported command '${cmd}'`);
  }
}

function makePipeline(state, client) {
  const queue = [];
  const push = (name, args) => {
    queue.push([name, args]);
    return pipeline;
  };

  const pipeline = {
    hset: (...args) => push('hset', args),
    hget: (...args) => push('hget', args),
    hgetall: (...args) => push('hgetall', args),
    hdel: (...args) => push('hdel', args),
    get: (...args) => push('get', args),
    set: (...args) => push('set', args),
    del: (...args) => push('del', args),
    expire: (...args) => push('expire', args),
    zadd: (...args) => push('zadd', args),
    zrem: (...args) => push('zrem', args),
    zrevrange: (...args) => push('zrevrange', args),
    publish: (...args) => push('publish', args),
    // Mirrors ioredis: exec() resolves to [[err, result], ...]
    exec: async () =>
      queue.map(([name, args]) => {
        try {
          return [null, run(state, client, name, args)];
        } catch (err) {
          return [err, null];
        }
      }),
    // Same as exec(), for internal seeding before any request is served.
    executeSync: () =>
      queue.map(([name, args]) => {
        try {
          return [null, run(state, client, name, args)];
        } catch (err) {
          return [err, null];
        }
      }),
  };

  return pipeline;
}

function makeClient(state, { subscriber = false } = {}) {
  const client = { channels: new Set(), messageHandlers: new Set() };

  const send = async (name, ...args) => run(state, client, name, args);

  Object.assign(client, {
    get: (...a) => send('get', ...a),
    set: (...a) => send('set', ...a),
    del: (...a) => send('del', ...a),
    exists: (...a) => send('exists', ...a),
    keys: (...a) => send('keys', ...a),
    expire: (...a) => send('expire', ...a),
    ttl: (...a) => send('ttl', ...a),
    hset: (...a) => send('hset', ...a),
    hget: (...a) => send('hget', ...a),
    hgetall: (...a) => send('hgetall', ...a),
    hdel: (...a) => send('hdel', ...a),
    zadd: (...a) => send('zadd', ...a),
    zrem: (...a) => send('zrem', ...a),
    zrevrange: (...a) => send('zrevrange', ...a),
    publish: (...a) => send('publish', ...a),
    pipeline: () => makePipeline(state, client),
    // Pub/sub bits used by /api/chatstream (an ioredis-compatible subset).
    subscribe: async (channel, callback) => {
      await send('subscribe', channel);
      if (typeof callback === 'function') queueMicrotask(() => callback(null));
    },
    unsubscribe: async (...channels) => send('unsubscribe', ...channels),
    on: (event, handler) => {
      if (event === 'message') client.messageHandlers.add(handler);
      return client;
    },
    removeListener: (event, handler) => {
      if (event === 'message') client.messageHandlers.delete(handler);
      return client;
    },
    off: (...a) => client.removeListener(...a),
    // ioredis-style lifecycle helpers, no-ops here.
    connect: async () => client,
    quit: async () => 'OK',
    disconnect: () => {},
    status: 'ready',
  });

  if (subscriber) {
    // Nothing subscriber-specific beyond the handler set above; kept as a
    // separate instance so code that expects two connections still works.
  }

  return client;
}

function getState() {
  if (!globalThis[GLOBAL_KEY]) {
    const state = createState();
    globalThis[GLOBAL_KEY] = state;

    // Seed the sample conversations right away, so /api/conversations and
    // /api/messages both see them even if they run in different bundles and
    // requests race each other on first load.
    const seeder = makeClient(state);
    const results = buildSeedCommands(seeder, Date.now()).executeSync();
    const failure = results.find(([err]) => err);
    if (failure) console.error('Failed to seed memory store', failure[0]);
    else run(state, seeder, 'set', ['test_mode:seeded', '1', 'EX', 86400]);
  }
  return globalThis[GLOBAL_KEY];
}

// Fresh clients that all share one store (like two connections to one Redis).
export function createMemoryRedis() {
  return makeClient(getState());
}

export function createMemorySubscriber() {
  return makeClient(getState(), { subscriber: true });
}
