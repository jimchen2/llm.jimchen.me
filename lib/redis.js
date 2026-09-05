import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
export const redis = new Redis(redisUrl);
export const redisSubscriber = new Redis(redisUrl);

export const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || '86400', 10);
