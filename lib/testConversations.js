// lib/testConversations.js
//
// Sample conversations used by test mode (TEST_MODE=true). This file is pure
// data with no imports, so both the memory store (lib/memoryStore.js, used when
// there is no Redis) and the Redis seeder (lib/testSeed.js) can share it.
//
// IDs are fixed, so seeding again is harmless.

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;

export const TEST_CONVERSATIONS = [
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
    id: 'test-conv-math',
    title: 'Geometric series and a comparison',
    mode: 'default',
    ageMs: 150 * MINUTE,
    messages: [
      {
        role: 'user',
        content: 'Show me the geometric series formula and a quick example.',
      },
      {
        role: 'assistant',
        content:
          'For $|r| < 1$ the infinite geometric series converges:\n\n' +
          '$$\\sum_{k=0}^{\\infty} ar^k = \\frac{a}{1-r}$$\n\n' +
          'With $a = 1$ and $r = \\tfrac{1}{2}$:\n\n' +
          '$$1 + \\frac{1}{2} + \\frac{1}{4} + \\cdots = \\frac{1}{1-\\tfrac{1}{2}} = 2$$\n\n' +
          '| Partial sum | Value |\n' +
          '| --- | --- |\n' +
          '| $S_1$ | 1 |\n' +
          '| $S_2$ | 1.5 |\n' +
          '| $S_3$ | 1.75 |\n' +
          '| $S_4$ | 1.875 |\n\n' +
          'The partial sums approach 2 from below, and the error after $n$ terms is $r^n$.',
      },
      {
        role: 'user',
        content: 'What if r = 2?',
      },
      {
        role: 'assistant',
        content:
          'Then the series diverges: $1 + 2 + 4 + 8 + \\cdots$ grows without bound, so there is no finite sum. The formula $\\frac{a}{1-r}$ only applies when $|r| < 1$.',
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
  {
    id: 'test-conv-branching',
    title: 'Branching and retry demo',
    mode: 'default',
    ageMs: 30 * MINUTE,
    messages: [
      {
        role: 'user',
        content: 'Give me one advantage of a linked list over an array.',
      },
      {
        role: 'assistant',
        content:
          'Inserting or deleting a node at a known position is **O(1)** and never requires moving the rest of the elements.',
      },
      {
        role: 'user',
        content: 'And one disadvantage?',
      },
      {
        role: 'assistant',
        content:
          'No random access: reaching element $i$ costs **O(i)** pointer hops, while an array is O(1). Nodes also need extra memory for the pointers.',
      },
    ],
  },
];

// Writes the samples through a Redis-compatible client. Shared by the Redis
// seeder and the memory store so both produce identical data.
export function buildSeedCommands(client, now = Date.now(), ttlSeconds = 86400) {
  const pipeline = client.pipeline();

  for (const conv of TEST_CONVERSATIONS) {
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
    pipeline.expire(convKey, ttlSeconds);

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
    pipeline.expire(msgKey, ttlSeconds);
  }

  pipeline.expire('conversations:index', ttlSeconds);
  return pipeline;
}
