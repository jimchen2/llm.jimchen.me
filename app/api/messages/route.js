import { NextResponse } from 'next/server';
import { redis, CACHE_TTL_SECONDS } from '@/lib/redis';

export async function GET(req) {
  const conversationId = req.nextUrl.searchParams.get('conversationId');
  if (!conversationId) return NextResponse.json([]);

  const rawMessages = await redis.hgetall(`msgs:${conversationId}`);
  if (!rawMessages) return NextResponse.json([]);

  const rows = Object.values(rawMessages)
    .map((m) => (typeof m === 'string' ? JSON.parse(m) : m))
    .sort((a, b) => a.created_at - b.created_at);

  return NextResponse.json(rows);
}

// Find the Redis key that holds a message without scanning every key.
// Prefer the caller-supplied conversation_id (fast); fall back to KEYS for
// older clients that don't send it.
async function findMessageKey(id, conversationId) {
  if (conversationId) {
    const key = `msgs:${conversationId}`;
    const raw = await redis.hget(key, id);
    if (raw) return { key, msg: typeof raw === 'string' ? JSON.parse(raw) : raw };
    return null;
  }
  const keys = await redis.keys('msgs:*');
  for (const key of keys) {
    const rawMsg = await redis.hget(key, id);
    if (rawMsg) {
      return { key, msg: typeof rawMsg === 'string' ? JSON.parse(rawMsg) : rawMsg };
    }
  }
  return null;
}

export async function DELETE(req) {
  const { id, conversationId } = await req.json();

  const found = await findMessageKey(id, conversationId);
  if (found) {
    const { key, msg } = found;
    const parentId = msg.parent_id;

    // Re-parent children so a deleted link doesn't orphan the rest of the branch
    const allMsgs = await redis.hgetall(key);
    const pipeline = redis.pipeline();
    for (const [mId, mRaw] of Object.entries(allMsgs)) {
      const m = typeof mRaw === 'string' ? JSON.parse(mRaw) : mRaw;
      if (m.parent_id === id) {
        m.parent_id = parentId;
        pipeline.hset(key, mId, JSON.stringify(m));
      }
    }
    pipeline.hdel(key, id);
    await pipeline.exec();
  }

  return NextResponse.json({ success: true });
}

export async function PUT(req) {
  const { id, content, conversationId } = await req.json();

  const found = await findMessageKey(id, conversationId);
  if (found) {
    found.msg.content = content;
    await redis.hset(found.key, id, JSON.stringify(found.msg));
    await redis.expire(found.key, CACHE_TTL_SECONDS);
  }
  return NextResponse.json({ success: true });
}

export async function POST(req) {
  const { messages } = await req.json();
  if (Array.isArray(messages) && messages.length > 0) {
    const convId = messages[0].conversation_id;
    const key = `msgs:${convId}`;
    const pipeline = redis.pipeline();

    for (const m of messages) {
      pipeline.hset(key, m.id, JSON.stringify(m));
    }
    pipeline.expire(key, CACHE_TTL_SECONDS);
    await pipeline.exec();
  }
  return NextResponse.json({ success: true });
}
