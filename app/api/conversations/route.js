import { NextResponse } from 'next/server';
import { redis, CACHE_TTL_SECONDS } from '@/lib/redis';
import { DEFAULT_MODE, normalizeMode } from '@/lib/modes';

export async function GET(req) {
  const url = new URL(req.url);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = parseInt(url.searchParams.get('limit') || '10', 10);

  // "conversations:index" is a sorted set of conversation IDs (newest first).
  // Each conversation's data lives in `conv:{id}` with its own TTL, while the
  // index TTL is refreshed by *any* chat activity — so the index can contain
  // IDs whose hash has already expired. Hydrate every ID and drop the stale
  // ones so the frontend never receives phantom conversations.
  const convIds = await redis.zrevrange('conversations:index', 0, -1);

  if (convIds.length === 0) return NextResponse.json([]);

  const rows = [];
  const staleIds = [];
  let skip = offset;
  const CHUNK_SIZE = 50; // hydrate in chunks so we don't build one giant pipeline

  for (let i = 0; i < convIds.length && rows.length < limit; i += CHUNK_SIZE) {
    const chunkIds = convIds.slice(i, i + CHUNK_SIZE);
    const pipeline = redis.pipeline();
    chunkIds.forEach((id) => pipeline.hgetall(`conv:${id}`));
    const results = await pipeline.exec();

    for (let j = 0; j < chunkIds.length; j++) {
      const [err, data] = results[j] || [];
      if (err) continue; // Redis error — skip this row, don't delete anything

      // An expired (or missing) hash returns {} — its ID lingers in the index.
      if (!data || !data.id) {
        staleIds.push(chunkIds[j]);
        continue;
      }

      if (skip > 0) {
        skip -= 1;
        continue;
      }

      rows.push({ ...data, mode: normalizeMode(data.mode) });
    }
  }

  // Remove expired conversations from the index (and their leftover messages)
  // so they can't come back as phantom rows on later requests.
  if (staleIds.length > 0) {
    const pipeline = redis.pipeline();
    pipeline.zrem('conversations:index', ...staleIds);
    staleIds.forEach((id) => pipeline.del(`msgs:${id}`));
    await pipeline.exec();
  }

  return NextResponse.json(rows);
}

export async function POST(req) {
  const { id, title, mode } = await req.json();
  const now = Date.now();
  const resolvedMode = normalizeMode(mode || DEFAULT_MODE);

  const pipeline = redis.pipeline();
  pipeline.zadd('conversations:index', now, id);
  pipeline.hset(`conv:${id}`, { id, title: title || 'New Conversation', created_at: now, mode: resolvedMode });
  
  // Set expiration
  pipeline.expire('conversations:index', CACHE_TTL_SECONDS);
  pipeline.expire(`conv:${id}`, CACHE_TTL_SECONDS);
  
  await pipeline.exec();
  return NextResponse.json({ success: true });
}

export async function DELETE(req) {
  const { id } = await req.json();
  
  const pipeline = redis.pipeline();
  pipeline.zrem('conversations:index', id);
  pipeline.del(`conv:${id}`);
  pipeline.del(`msgs:${id}`);
  await pipeline.exec();

  return NextResponse.json({ success: true });
}
