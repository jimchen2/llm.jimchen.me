import Redis from 'ioredis';
import { isTestMode } from './testMode';
import { createMemoryRedis, createMemorySubscriber } from './memoryStore';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// In test mode (TEST_MODE=true) the app runs without Redis: everything lives in
// a small in-memory store so the site can be previewed with no extra services.
// It exposes the same async API (plus a pub/sub subset) that the routes use.
const useMemoryStore = isTestMode();

export const redis = useMemoryStore ? createMemoryRedis() : new Redis(redisUrl);
export const redisSubscriber = useMemoryStore ? createMemorySubscriber() : new Redis(redisUrl);

export const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || '86400', 10);
export const USING_MEMORY_STORE = useMemoryStore;
