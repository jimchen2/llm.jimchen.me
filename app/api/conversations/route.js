import { NextResponse } from 'next/server';
import { redis, CACHE_TTL_SECONDS } from '@/lib/redis';
import { MODES, VALID_MODES } from '@/lib/config';

const normalizeMode = (mode) => (VALID_MODES.includes(mode) ? mode : MODES.TECH);

const normalizeConversation = (conv) => ({
  ...conv,
  mode: normalizeMode(conv.mode),
});

export async function GET(req) {
  // Single conversation lookup: /api/conversations?id=xxx
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const conv = await redis.hgetall(`conv:${id}`);
    if (!conv || !conv.id) return NextResponse.json(null);
    return NextResponse.json(normalizeConversation(conv));
  }

  const url = new URL(req.url);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = parseInt(url.searchParams.get('limit') || '10', 10);

  // Get conversation IDs sorted by newest first
  const convIds = await redis.zrevrange('conversations:index', offset, offset + limit - 1);

  if (convIds.length === 0) return NextResponse.json([]);

  const pipeline = redis.pipeline();
  convIds.forEach(id => pipeline.hgetall(`conv:${id}`));
  const results = await pipeline.exec();

  const rows = results.map(([err, data]) => data).filter(Boolean);
  return NextResponse.json(rows.map(normalizeConversation));
}

export async function POST(req) {
  const { id, title, mode } = await req.json();
  const now = Date.now();

  const pipeline = redis.pipeline();
  pipeline.zadd('conversations:index', now, id);
  // Mode is baked into the conversation at creation time (defaults to tech)
  pipeline.hset(`conv:${id}`, { id, title: title || 'New Conversation', mode: normalizeMode(mode), created_at: now });

  // Set expiration
  pipeline.expire('conversations:index', CACHE_TTL_SECONDS);
  pipeline.expire(`conv:${id}`, CACHE_TTL_SECONDS);

  await pipeline.exec();
  return NextResponse.json({ success: true });
}

// Update an existing conversation (currently: its mode)
export async function PATCH(req) {
  const { id, mode } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing conversation id' }, { status: 400 });
  if (!VALID_MODES.includes(mode)) return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });

  const pipeline = redis.pipeline();
  pipeline.hset(`conv:${id}`, { mode });
  pipeline.expire(`conv:${id}`, CACHE_TTL_SECONDS);
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
