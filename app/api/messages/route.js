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

  // If the conversation itself has already expired (its hash is gone), tell
  // the client so it can remove the phantom entry from its sidebar instead of
  // opening an empty chat. A conversation that exists but simply has no
  // messages yet is still a valid, empty conversation.
  const convExists = await redis.exists(`conv:${conversationId}`);
  if (!convExists) {
    return NextResponse.json(
      { error: 'conversation_expired', conversationId },
      { status: 404 }
    );
  }

  const rawMessages = await redis.hgetall(messageKey(conversationId));
  if (!rawMessages) return NextResponse.json([]);

  const rows = Object.values(rawMessages)
    .map(parseMessage)
    .sort((a, b) => a.created_at - b.created_at);

  return NextResponse.json(rows);
}

export async function DELETE(req) {
  const { id, conversationId } = await req.json();
  const location = await getMessageLocation({ id, conversationId });

  if (location) {
    const { key, rawMsg } = location;
    const msg = parseMessage(rawMsg);
    const parentId = msg.parent_id;

    // Re-parent children in the same conversation only. The client now sends
    // conversationId so the common path is a direct hash lookup instead of a
    // Redis-wide KEYS scan.
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
    await pipeline.exec();
  }
  return NextResponse.json({ success: true });
}
