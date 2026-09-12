import { NextResponse } from 'next/server';
import { redis, CACHE_TTL_SECONDS } from '@/lib/redis';
import { DEFAULT_MODE, normalizeMode } from '@/lib/modes';
import { isAuthorized, unauthorized } from '@/lib/auth';

function toConversation(data) {
  if (!data || !data.id) return null;
  return {
    id: data.id,
    title: data.title || 'New Conversation',
    // Conversations created before modes existed are tech conversations.
    mode: normalizeMode(data.mode || DEFAULT_MODE),
    created_at: Number(data.created_at) || 0,
  };
}

export async function GET(req) {
  if (!isAuthorized(req)) return unauthorized();

  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  // Single conversation (used to restore the mode when opening a chat link).
  if (id) {
    const data = await redis.hgetall(`conv:${id}`);
    return NextResponse.json(toConversation(data));
  }

  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = parseInt(url.searchParams.get('limit') || '10', 10);

  // Get conversation IDs sorted by newest first
  const convIds = await redis.zrevrange('conversations:index', offset, offset + limit - 1);

  if (convIds.length === 0) return NextResponse.json([]);

  const pipeline = redis.pipeline();
  convIds.forEach(id => pipeline.hgetall(`conv:${id}`));
  const results = await pipeline.exec();

  const rows = results
    .map(([err, data]) => toConversation(data))
    .filter(Boolean);

  return NextResponse.json(rows);
}

export async function POST(req) {
  if (!isAuthorized(req)) return unauthorized();

  const { id, title, mode } = await req.json();
  const now = Date.now();
  const conversationMode = normalizeMode(mode);

  const pipeline = redis.pipeline();
  pipeline.zadd('conversations:index', now, id);
  pipeline.hset(`conv:${id}`, {
    id,
    title: title || 'New Conversation',
    // The mode is fixed when the conversation is created: every message in this
    // conversation keeps using this mode's prompt and API key until it is deleted.
    mode: conversationMode,
    created_at: now,
  });

  // Set expiration
  pipeline.expire('conversations:index', CACHE_TTL_SECONDS);
  pipeline.expire(`conv:${id}`, CACHE_TTL_SECONDS);

  await pipeline.exec();
  return NextResponse.json({ success: true, mode: conversationMode });
}

export async function DELETE(req) {
  if (!isAuthorized(req)) return unauthorized();

  const { id } = await req.json();

  const pipeline = redis.pipeline();
  pipeline.zrem('conversations:index', id);
  pipeline.del(`conv:${id}`);
  pipeline.del(`msgs:${id}`);
  await pipeline.exec();

  return NextResponse.json({ success: true });
}
