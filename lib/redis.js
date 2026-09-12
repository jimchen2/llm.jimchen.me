// lib/redis.js
//
// Redis access for the app. `REDIS_URL` points at a real Redis server (that is
// always what happens in production). In development, if that server is not
// reachable, the app transparently falls back to an in-process store
// (lib/memory-redis.js) so `npm run dev` runs with zero configuration.
//
// Override the behaviour with REDIS_DRIVER=redis|memory.

import Redis from 'ioredis';
import { IS_DEV } from './config';
import { getMemoryRedis } from './memory-redis';

export const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || '86400', 10);

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DRIVER = (process.env.REDIS_DRIVER || '').trim().toLowerCase();
const REDIS_PROBE_TIMEOUT_MS = 800;

// The dev server may load several route bundles, each with its own copy of this
// module: keep the driver decision and the memory store shared process-wide.
const DECISION_KEY = Symbol.for('llm.jimchen.me/redis-driver');
let warned = false;

function warnOnce(message) {
  if (warned) return;
  warned = true;
  console.warn(message);
}

function logRedisError(err) {
  // In development the fallback message below says everything that matters.
  if (!IS_DEV || DRIVER === 'redis') {
    console.warn(`[redis] ${err?.code || err?.message || err}`);
  }
}

function createRealClient() {
  const client = new Redis(REDIS_URL, {
    // Only connect when a command is actually sent: importing a route during a
    // production build must not try to reach Redis.
    lazyConnect: true,
    // Fail fast instead of queueing commands forever when the server is down.
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 150, 800)),
  });
  client.on('error', logRedisError);
  client.on('end', () => {
    if (DRIVER === 'redis') console.warn('[redis] connection closed');
  });
  return client;
}

function probeRealClient(client) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), REDIS_PROBE_TIMEOUT_MS);
    client
      .ping()
      .then(() => {
        clearTimeout(timer);
        resolve(true);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(false);
      });
  });
}

/** Which backend does this process use? Decided once, shared by every bundle. */
function getDriverDecision() {
  if (!globalThis[DECISION_KEY]) {
    globalThis[DECISION_KEY] = (async () => {
      if (DRIVER === 'memory') {
        warnOnce('[redis] REDIS_DRIVER=memory → using the in-memory store (development only).');
        return 'memory';
      }
      if (!IS_DEV) return 'redis';

      // Probe with a throwaway connection: each facade keeps its own client,
      // because a subscribed ioredis connection cannot run normal commands.
      const probe = createRealClient();
      const reachable = await probeRealClient(probe);
      try {
        probe.disconnect();
      } catch {
        /* ignore */
      }
      if (reachable) return 'redis';
      warnOnce(
        `[redis] Could not reach ${REDIS_URL} — falling back to the in-memory development store.\n` +
          '[redis] Messages live in this process only (they disappear when the dev server restarts).\n' +
          '[redis] Start Redis, or set REDIS_URL/REDIS_DRIVER, to keep conversations across restarts.'
      );
      return 'memory';
    })();
  }
  return globalThis[DECISION_KEY];
}

/**
 * A client facade that resolves its backend lazily, so a request never has to
 * know whether it is talking to Redis or to the in-memory development store.
 * It exposes the same shape as an ioredis client for the commands we use, plus
 * a chainable pipeline.
 */
function createClientFacade() {
  const memory = getMemoryRedis();
  const real = DRIVER === 'memory' ? null : createRealClient();
  let readyPromise = null;
  let backend = null;

  // Pub/sub handlers are registered synchronously (the SSE stream may start
  // before the backend has been decided), so they always go on the in-process
  // store first and additionally on the real client once it is selected.
  const messageHandlers = new Set();

  function attach(handler) {
    memory.on('message', handler);
    if (backend && backend !== memory) backend.on('message', handler);
  }

  function detach(handler) {
    memory.removeListener('message', handler);
    if (backend && backend !== memory) backend.removeListener('message', handler);
  }

  function ready() {
    if (!readyPromise) {
      readyPromise = getDriverDecision().then((driver) => {
        backend = driver === 'memory' || !real ? memory : real;
        // Attach whatever was registered before the decision was known.
        if (backend !== memory) {
          for (const handler of messageHandlers) backend.on('message', handler);
        }
        return backend;
      });
    }
    return readyPromise;
  }

  // Kick the decision off immediately so the first request does not wait for it.
  if (IS_DEV && DRIVER !== 'memory') ready().catch(() => {});

  const call = async (command, args) => {
    const target = await ready();
    const fn = target[command];
    if (typeof fn !== 'function') throw new Error(`[redis] unsupported command "${command}"`);
    return fn.apply(target, args);
  };

  const pipeline = () => {
    const queued = [];
    const chain = new Proxy(
      {
        exec: async () => {
          const target = await ready();
          const results = [];
          for (const [command, args] of queued) {
            try {
              results.push([null, await target[command](...args)]);
            } catch (err) {
              results.push([err, null]);
            }
          }
          return results;
        },
      },
      {
        get(target, prop) {
          if (prop in target) return target[prop];
          if (typeof prop !== 'string') return undefined;
          // Never pretend to be a thenable: awaiting a pipeline must fail loudly
          // instead of queueing a "then" command.
          if (['then', 'catch', 'finally', 'constructor', 'toJSON', 'inspect'].includes(prop)) {
            return undefined;
          }
          // Any Redis command can be queued, and every queue call is chainable.
          return (...args) => {
            queued.push([prop, args]);
            return chain;
          };
        },
      }
    );
    return chain;
  };

  const client = {
    ready,
    get driver() {
      if (DRIVER === 'memory' || !real || backend === memory) return 'memory';
      return 'redis';
    },
    pipeline,
    // Commands used by the app.
    get: (...args) => call('get', args),
    set: (...args) => call('set', args),
    del: (...args) => call('del', args),
    keys: (...args) => call('keys', args),
    expire: (...args) => call('expire', args),
    hget: (...args) => call('hget', args),
    hgetall: (...args) => call('hgetall', args),
    hset: (...args) => call('hset', args),
    hsetnx: (...args) => call('hsetnx', args),
    hdel: (...args) => call('hdel', args),
    zadd: (...args) => call('zadd', args),
    zrem: (...args) => call('zrem', args),
    zrevrange: (...args) => call('zrevrange', args),
    publish: (...args) => call('publish', args),
    subscribe: (...args) => ready().then((target) => target.subscribe(...args)),
    unsubscribe: (...args) => ready().then((target) => target.unsubscribe(...args)),
    on: (event, handler) => {
      if (event === 'message') {
        messageHandlers.add(handler);
        attach(handler);
      }
      return client;
    },
    removeListener: (event, handler) => {
      if (event === 'message') {
        messageHandlers.delete(handler);
        detach(handler);
      }
      return client;
    },
  };

  return client;
}

export const redis = createClientFacade();
export const redisSubscriber = createClientFacade();
