import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const createClient = (name) => {
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => Math.min(times * 500, 5000),
  });
  // Without an error handler, ioredis crashes the process on connection errors.
  client.on('error', (err) => {
    console.error(`[redis:${name}] ${err.message}`);
  });
  return client;
};

export const redis = createClient('main');
export const redisSubscriber = createClient('subscriber');

export const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || '86400', 10);
