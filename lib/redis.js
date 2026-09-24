import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisOptions = {
  // Next.js imports route modules during production builds. Lazy connections keep
  // those imports from trying to dial Redis until a request actually uses it.
  lazyConnect: true,
};

export const redis = new Redis(redisUrl, redisOptions);
export const redisSubscriber = new Redis(redisUrl, redisOptions);

export const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || '86400', 10);
