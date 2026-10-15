import { NextResponse } from 'next/server';
import { redis, CACHE_TTL_SECONDS } from '@/lib/redis';
import { DEFAULT_MODE, normalizeMode } from '@/lib/modes';

export async function GET(req) {
  const url = new URL(req.url);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50);

  // Optimized: windowed pagination instead of full ZRANGE 0 -1.
  // Previously we fetched the entire sorted set (O(N)) then hydrated all IDs
  // even though the client only needed `limit` rows. Now we page directly on
  // the sorted set with ZREVRANGE offset windows O(log(N)+M) and hydrate at
  // most limit + stale slack rows.
  const total = await redis.zcard('conversations:index');
  if (total === 0) return NextResponse.json([]);

  const rows = [];
  const staleIds = [];
  let skip = offset;
  const CHUNK_SIZE = 50;
  let windowsScanned = 0;
  const maxWindows = Math.ceil(total / CHUNK_SIZE) + 2;

  for (let start = 0; start < total && rows.length < limit && windowsScanned < maxWindows; start += CHUNK_SIZE) {
    // Windowed ZREVRANGE: O(log(N)+CHUNK_SIZE) instead of O(N)
    const chunkIds = await redis.zrevrange('conversations:index', start, start + CHUNK_SIZE - 1);
    if (chunkIds.length === 0) break;
    windowsScanned++;

    const pipeline = redis.pipeline();
    chunkIds.forEach((id) => pipeline.hgetall(`conv:${id}`));
    const results = await pipeline.exec();

    for (let j = 0; j < chunkIds.length; j++) {
      const [err, data] = results[j] || [];
      if (err) continue;

      if (!data || !data.id) {
        staleIds.push(chunkIds[j]);
        continue;
      }

      if (skip > 0) {
        skip -= 1;
        continue;
      }

      rows.push({ ...data, mode: normalizeMode(data.mode) });
      if (rows.length >= limit) break;
    }
  }

  // Lazy cleanup: remove stale IDs discovered in scanned windows.
  if (staleIds.length > 0) {
    const pipeline = redis.pipeline();
    for (let i = 0; i < staleIds.length; i += 100) {
      pipeline.zrem('conversations:index', ...staleIds.slice(i, i + 100));
    }
    for (const id of staleIds) pipeline.del(`msgs:${id}`);
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
