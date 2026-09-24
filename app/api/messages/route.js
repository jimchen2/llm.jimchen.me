import { NextResponse } from 'next/server';
import { redis, CACHE_TTL_SECONDS } from '@/lib/redis';

const messageKey = (conversationId) => `msgs:${conversationId}`;

const parseMessage = (raw) => (typeof raw === 'string' ? JSON.parse(raw) : raw);

async function findMessageById(id) {
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'msgs:*', 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length === 0) continue;
    const pipeline = redis.pipeline();
    keys.forEach((key) => pipeline.hget(key, id));
    const results = await pipeline.exec();
    for (let i = 0; i < results.length; i += 1) {
      const [err, rawMsg] = results[i] || [];
      if (!err && rawMsg) return { key: keys[i], rawMsg };
    }
  } while (cursor !== '0');
  return null;
}

async function getMessageLocation({ id, conversationId }) {
  if (conversationId) {
    const key = messageKey(conversationId);
    const rawMsg = await redis.hget(key, id);
    if (rawMsg) return { key, rawMsg };
  }
  // Compatibility fallback for older clients that only send a message ID.
  // SCAN is incremental and avoids blocking Redis the way KEYS msgs:* can.
  return findMessageById(id);
}

export async function GET(req) {
  const conversationId = req.nextUrl.searchParams.get('conversationId');
  if (!conversationId) return NextResponse.json([]);

  const convExists = await redis.exists(`conv:${conversationId}`);
  if (!convExists) {
    return NextResponse.json(
      { error: 'conversation_expired', conversationId },
      { status: 404 }
    );
  }

  const rawMessages = await redis.hgetall(messageKey(conversationId));
  if (!rawMessages || Object.keys(rawMessages).length === 0) return NextResponse.json([]);

  // Optimized: preallocate array and parse in single pass, avoid double Object.values + map allocation
  const rows = new Array(Object.keys(rawMessages).length);
  let i = 0;
  for (const v of Object.values(rawMessages)) {
    rows[i++] = parseMessage(v);
  }
  rows.sort((a, b) => a.created_at - b.created_at);

  return NextResponse.json(rows);
}

export async function DELETE(req) {
  const { id, conversationId } = await req.json();
  const location = await getMessageLocation({ id, conversationId });
  if (location) {
    const { key, rawMsg } = location;
    const msg = parseMessage(rawMsg);
    const parentId = msg.parent_id;
    const allMsgs = await redis.hgetall(key);
    const pipeline = redis.pipeline();
    for (const [mId, mRaw] of Object.entries(allMsgs)) {
      const m = parseMessage(mRaw);
      if (m.parent_id === id) {
        m.parent_id = parentId;
        pipeline.hset(key, mId, JSON.stringify(m));
      }
    }
    pipeline.hdel(key, id);
    pipeline.expire(key, CACHE_TTL_SECONDS);
    await pipeline.exec();
  }
  return NextResponse.json({ success: true });
}

export async function PUT(req) {
  const { id, conversationId, content } = await req.json();
  const location = await getMessageLocation({ id, conversationId });
  if (location) {
    const msg = parseMessage(location.rawMsg);
    msg.content = content;
    await redis
      .pipeline()
      .hset(location.key, id, JSON.stringify(msg))
      .expire(location.key, CACHE_TTL_SECONDS)
      .exec();
  }
  return NextResponse.json({ success: true });
}

export async function POST(req) {
  const { messages } = await req.json();
  if (Array.isArray(messages) && messages.length > 0) {
    const convId = messages[0].conversation_id;
    const key = messageKey(convId);
    const pipeline = redis.pipeline();
    for (const m of messages) {
      pipeline.hset(key, m.id, JSON.stringify(m));
    }
    pipeline.expire(key, CACHE_TTL_SECONDS);
    pipeline.expire(`conv:${convId}`, CACHE_TTL_SECONDS);
    await pipeline.exec();
  }
  return NextResponse.json({ success: true });
}
