import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRedis, createMemorySubscriber } from '../lib/memoryStore.js';

// Test mode can run without Redis (TEST_MODE=true): the same routes talk to this
// in-memory store instead. These checks cover the commands the routes rely on.

test('memory store is seeded with the sample conversations', async () => {
  const redis = createMemoryRedis();
  const ids = await redis.zrevrange('conversations:index', 0, -1);
  assert.ok(ids.includes('test-conv-coding'));
  assert.ok(ids.includes('test-conv-math'));
  assert.ok(ids.includes('test-conv-russian'));
  assert.ok(ids.includes('test-conv-random'));

  const conv = await redis.hgetall('conv:test-conv-coding');
  assert.equal(conv.title, 'Binary search complexity');
  assert.equal(conv.mode, 'default');

  // The random-mode sample is visible like the others but has no expiry, and
  // the shared index is kept forever because it contains that conversation.
  assert.equal((await redis.hgetall('conv:test-conv-random')).mode, 'random');
  assert.equal(await redis.ttl('conv:test-conv-random'), -1);
  assert.equal(await redis.ttl('msgs:test-conv-random'), -1);
  assert.equal(await redis.ttl('conversations:index'), -1);

  const messages = await redis.hgetall('msgs:test-conv-coding');
  const parsed = Object.values(messages).map((m) => JSON.parse(m));
  assert.equal(parsed.length, 4);
  assert.equal(parsed[0].parent_id, null);
  assert.equal(parsed[1].parent_id, parsed[0].id);
});

test('memory store supports the writes the API routes make', async () => {
  const redis = createMemoryRedis();

  const pipeline = redis.pipeline();
  pipeline.zadd('conversations:index', Date.now(), 'unit-conv');
  pipeline.hset('conv:unit-conv', { id: 'unit-conv', title: 'Unit', mode: 'default' });
  pipeline.hset('msgs:unit-conv', 'm1', JSON.stringify({ id: 'm1', role: 'user', content: 'hi' }));
  pipeline.expire('conv:unit-conv', 60);
  const results = await pipeline.exec();
  assert.ok(results.every(([err]) => err === null));

  assert.equal(await redis.exists('conv:unit-conv'), 1);
  assert.equal(await redis.hget('msgs:unit-conv', 'm1').then(JSON.parse).then((m) => m.content), 'hi');

  await redis.set('flag', '1', 'EX', 60, 'NX');
  assert.equal(await redis.get('flag'), '1');
  assert.equal(await redis.set('flag', '2', 'EX', 60, 'NX'), null);

  assert.deepEqual(await redis.keys('conv:unit-*'), ['conv:unit-conv']);

  const del = redis.pipeline();
  del.zrem('conversations:index', 'unit-conv');
  del.del('conv:unit-conv');
  del.del('msgs:unit-conv');
  await del.exec();
  assert.equal(await redis.exists('conv:unit-conv'), 0);
});

test('memory store can drop a key TTL (random mode keeps conversations forever)', async () => {
  const redis = createMemoryRedis();
  const pipeline = redis.pipeline();
  pipeline.hset('conv:unit-forever', { id: 'unit-forever', mode: 'random' });
  pipeline.expire('conv:unit-forever', 60);
  await pipeline.exec();
  assert.equal(await redis.ttl('conv:unit-forever'), 60);

  const clear = redis.pipeline();
  clear.persist('conv:unit-forever');
  await clear.exec();
  // -1 means "exists, no expiry" — exactly like ioredis.
  assert.equal(await redis.ttl('conv:unit-forever'), -1);
  assert.equal(await redis.persist('conv:unit-forever'), 0);
  assert.equal(await redis.persist('conv:unit-missing'), 0);

  await redis.del('conv:unit-forever');
});

test('memory store publishes to subscribers for chat streaming', async () => {
  const redis = createMemoryRedis();
  const subscriber = createMemorySubscriber();

  const received = [];
  await subscriber.subscribe('msg:test:channel', (err) => {
    assert.equal(err, null);
    subscriber.on('message', (channel, message) => {
      if (channel === 'msg:test:channel') received.push(message);
    });
  });

  await redis.publish('msg:test:channel', JSON.stringify('chunk'));
  await redis.publish('msg:test:channel', '[DONE]');

  assert.deepEqual(received, [JSON.stringify('chunk'), '[DONE]']);

  await subscriber.unsubscribe('msg:test:channel');
  await redis.publish('msg:test:channel', JSON.stringify('ignored'));
  assert.equal(received.length, 2);
});
