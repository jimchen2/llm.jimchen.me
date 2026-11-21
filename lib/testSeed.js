// lib/testSeed.js
//
// Sample conversations written to Redis in test mode (TEST_MODE=true). They use
// fixed IDs, so writing them again is harmless. They expire with the normal
// CACHE_TTL like any other conversation, and are written again after that.
import { redis, CACHE_TTL_SECONDS } from './redis';

const SEED_MARKER_KEY = 'test_mode:seeded';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const SEED_CONVERSATIONS = [
  {
    id: 'test-conv-coding',
    title: 'Binary search complexity',
    mode: 'default',
    ageMs: 3 * HOUR,
    messages: [
      {
        role: 'user',
        content: 'What is the time complexity of binary search?',
      },
      {
        role: 'assistant',
        content:
          'Binary search runs in **O(log n)** time. Each comparison halves the remaining range, so it needs at most about log₂(n) comparisons. The iterative version uses O(1) extra space.\n\n' +
          '```python\n' +
          'def binary_search(arr, target):\n' +
          '    lo, hi = 0, len(arr) - 1\n' +
          '    while lo <= hi:\n' +
          '        mid = (lo + hi) // 2\n' +
          '        if arr[mid] == target:\n' +
          '            return mid\n' +
          '        if arr[mid] < target:\n' +
          '            lo = mid + 1\n' +
          '        else:\n' +
          '            hi = mid - 1\n' +
          '    return -1\n' +
          '```',
      },
      {
        role: 'user',
        content: 'Does it work on unsorted input?',
      },
      {
        role: 'assistant',
        content:
          'No. Binary search depends on the array being sorted. On unsorted input, the halving step can throw away the half that holds the target.',
      },
    ],
  },
  {
    id: 'test-conv-russian',
    title: 'Исправление грамматики',
    mode: 'grammar',
    ageMs: 2 * HOUR,
    messages: [
      {
        role: 'user',
        content: 'Вчера я ходил в магазине и купил хлеб.',
      },
      {
        role: 'assistant',
        content:
          'Вчера я ходил в ~~магазине~~ **магазин** и купил хлеб.',
      },
    ],
  },
  {
    id: 'test-conv-practical',
    title: 'What is a hash table?',
    mode: 'practical',
    ageMs: 1 * HOUR,
    messages: [
      {
        role: 'user',
        content: 'What is a hash table?',
      },
      {
        role: 'assistant',
        content:
          'A hash table maps keys to values. A hash function turns each key into an array index, so lookups take O(1) on average.',
      },
      {
        role: 'user',
        content: 'What about collisions?',
      },
      {
        role: 'assistant',
        content: 'Collisions are handled by chaining (a list per bucket) or by open addressing (probing for a free slot).',
      },
    ],
  },
];

// Writes the sample conversations once. Concurrent callers in this process share
// one in-flight promise. Across processes, the Redis marker (SET NX) makes sure
// only one of them writes.
let inFlight = null;

export function ensureTestSeed() {
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
    const now = Date.now();
    const pipeline = redis.pipeline();

    for (const conv of SEED_CONVERSATIONS) {
      const createdAt = now - conv.ageMs;
      const convKey = `conv:${conv.id}`;
      const msgKey = `msgs:${conv.id}`;

      pipeline.zadd('conversations:index', createdAt, conv.id);
      pipeline.hset(convKey, {
        id: conv.id,
        title: conv.title,
        created_at: createdAt,
        mode: conv.mode,
      });
      pipeline.expire(convKey, CACHE_TTL_SECONDS);

      let parentId = null;
      conv.messages.forEach((m, i) => {
        const id = `${conv.id}-msg-${i + 1}`;
        const payload = {
          id,
          conversation_id: conv.id,
          parent_id: parentId,
          role: m.role,
          content: m.content,
          created_at: createdAt + (i + 1) * MINUTE,
        };
        pipeline.hset(msgKey, id, JSON.stringify(payload));
        parentId = id;
      });
      pipeline.expire(msgKey, CACHE_TTL_SECONDS);
    }

    pipeline.expire('conversations:index', CACHE_TTL_SECONDS);
    await pipeline.exec();
  } catch (err) {
    // Let the next request try again instead of leaving a marker with no data.
    await redis.del(SEED_MARKER_KEY);
    console.error('Failed to seed test conversations', err);
  }
}
