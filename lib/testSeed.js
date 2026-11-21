// lib/testSeed.js
//
// Sample conversations for test mode (TEST_MODE=true). The data lives in
// lib/testConversations.js; this file writes it once per cache TTL.
//
// When test mode runs without Redis (lib/memoryStore.js) the samples are
// already in memory, so seeding is a no-op here.
import { redis, CACHE_TTL_SECONDS, USING_MEMORY_STORE } from './redis';
import { buildSeedCommands } from './testConversations.js';

const SEED_MARKER_KEY = 'test_mode:seeded';

// Writes the sample conversations once. Concurrent callers in this process share
// one in-flight promise. Across processes, the Redis marker (SET NX) makes sure
// only one of them writes.
let inFlight = null;

export function ensureTestSeed() {
  if (USING_MEMORY_STORE) return Promise.resolve();
  if (!inFlight) {
    inFlight = seed().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function seed() {
  const claimed = await redis.set(SEED_MARKER_KEY, '1', 'EX', CACHE_TTL_SECONDS, 'NX');
  if (claimed !== 'OK') return; // already seeded (recently)

  try {
    await buildSeedCommands(redis, Date.now(), CACHE_TTL_SECONDS).exec();
  } catch (err) {
    // Let the next request try again instead of leaving a marker with no data.
    await redis.del(SEED_MARKER_KEY);
    console.error('Failed to seed test conversations', err);
  }
}
