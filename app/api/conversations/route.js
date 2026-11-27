import { NextResponse } from 'next/server';
import { redis, CACHE_TTL_SECONDS } from '@/lib/redis';
import {
  DEFAULT_MODE,
  normalizeMode,
  isDesktopOnlyMode,
  modePersistsConversation,
} from '@/lib/modes';
import { allowsRandomMode } from '@/lib/desktopGate';
import { isTestMode } from '@/lib/testMode';
import { ensureTestSeed } from '@/lib/testSeed';

export async function GET(req) {
  const url = new URL(req.url);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = parseInt(url.searchParams.get('limit') || '10', 10);

  // In test mode, make sure the sample conversations exist before listing them.
  if (isTestMode()) await ensureTestSeed();

  // "conversations:index" is a sorted set of conversation IDs (newest first).
  // Each conversation's data lives in `conv:{id}` with its own TTL, while the
  // index TTL is refreshed by *any* chat activity — so the index can contain
  // IDs whose hash has already expired. Hydrate every ID and drop the stale
  // ones so the frontend never receives phantom conversations.
  const indexedIds = await redis.zrevrange('conversations:index', 0, -1);

  // Random-mode conversations are stored without a TTL, so their hashes can
  // outlive the index (which still expires). Recover those hashes and put them
  // back into the index, so "never expires" really means never disappears from
  // the sidebar.
  const indexed = new Set(indexedIds);
  const orphanIds = [];
  for (const key of await redis.keys('conv:*')) {
    const id = key.slice('conv:'.length);
    if (id && !indexed.has(id)) orphanIds.push(id);
  }
  const orphanSet = new Set(orphanIds);
  const convIds = [...indexedIds, ...orphanIds];

  if (convIds.length === 0) return NextResponse.json([]);

  const rows = [];
  const staleIds = [];
  const recovered = []; // orphaned conversations re-added to the index
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

      if (orphanSet.has(chunkIds[j])) {
        recovered.push({ id: chunkIds[j], createdAt: Number(data.created_at) || Date.now() });
      }

      if (skip > 0) {
        skip -= 1;
        continue;
      }

      rows.push({ ...data, mode: normalizeMode(data.mode) });
    }
  }

  // Remove expired conversations from the index (and their leftover messages)
  // so they can't come back as phantom rows on later requests. Note that this
  // only ever removes IDs and message hashes that are already gone: random-mode
  // conversations have no TTL and are never collected here.
  if (staleIds.length > 0) {
    const pipeline = redis.pipeline();
    pipeline.zrem('conversations:index', ...staleIds);
    staleIds.forEach((id) => pipeline.del(`msgs:${id}`));
    await pipeline.exec();
  }

  // Index the recovered conversations again, keeping the usual newest-first order.
  if (recovered.length > 0) {
    const pipeline = redis.pipeline();
    recovered.forEach(({ id, createdAt }) => pipeline.zadd('conversations:index', createdAt, id));
    await pipeline.exec();
  }

  return NextResponse.json(rows);
}

export async function POST(req) {
  const { id, title, mode } = await req.json();
  const now = Date.now();
  const resolvedMode = normalizeMode(mode || DEFAULT_MODE);

  // Random mode is desktop-only (see lib/desktopGate.js).
  if (isDesktopOnlyMode(resolvedMode) && !allowsRandomMode(req)) {
    return NextResponse.json({ error: 'random_mode_desktop_only' }, { status: 403 });
  }

  const pipeline = redis.pipeline();
  pipeline.zadd('conversations:index', now, id);
  pipeline.hset(`conv:${id}`, { id, title: title || 'New Conversation', created_at: now, mode: resolvedMode });

  // Expiration: most conversations are cache-like and expire after
  // CACHE_TTL_SECONDS. Random-mode conversations never expire — PERSIST also
  // clears a TTL if the same ID was written before.
  if (modePersistsConversation(resolvedMode)) {
    pipeline.persist(`conv:${id}`);
  } else {
    pipeline.expire(`conv:${id}`, CACHE_TTL_SECONDS);
  }
  pipeline.expire('conversations:index', CACHE_TTL_SECONDS);

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
