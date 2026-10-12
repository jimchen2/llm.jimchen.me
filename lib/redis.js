import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
export const redis = new Redis(redisUrl);
export const redisSubscriber = new Redis(redisUrl);

// How long chat data (conversations, messages, the conversation index) is kept
// in Redis, in seconds. 0 — the default — means "keep it forever": history is
// only removed when the user deletes it or the key is explicitly dropped.
// Set CACHE_TTL_SECONDS to a positive number to instead expire data after that
// many seconds of inactivity.
const parsedTtl = parseInt(process.env.CACHE_TTL_SECONDS ?? '', 10);
export const CACHE_TTL_SECONDS = Number.isFinite(parsedTtl) ? parsedTtl : 0;

// Applies the configured retention to the given keys on the given pipeline.
// With a TTL configured it (re)sets the sliding expiry; with the "keep forever"
// default it clears any TTL already sitting on those keys — for example one
// left behind by a deployment that used to run with CACHE_TTL_SECONDS set.
export function applyCacheLifetime(pipeline, keys) {
  for (const key of keys) {
    if (CACHE_TTL_SECONDS > 0) pipeline.expire(key, CACHE_TTL_SECONDS);
    else pipeline.persist(key);
  }
  return pipeline;
}

let sweepStarted = false;

// One-time (per server process) cleanup that strips leftover TTLs from keys
// written while CACHE_TTL_SECONDS was set, so old conversations are not
// reclaimed by Redis mid-week. No-op when a TTL is configured.
export async function sweepExpiringKeys() {
  if (CACHE_TTL_SECONDS > 0 || sweepStarted) return;
  sweepStarted = true;

  try {
    const convKeys = await redis.keys('conv:*');
    const msgKeys = await redis.keys('msgs:*');
    const keys = [...convKeys, ...msgKeys, 'conversations:index'];
    if (keys.length === 0) return;
    await applyCacheLifetime(redis.pipeline(), keys).exec();
  } catch (err) {
    console.error('[redis] Failed to clear leftover key TTLs:', err);
  }
}
