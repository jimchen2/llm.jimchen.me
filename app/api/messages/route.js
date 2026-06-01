import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const WEEK = 604800; 

export async function GET(req) {
  const conversationId = req.nextUrl.searchParams.get('conversationId');
  if (!conversationId) return NextResponse.json([]);

  const rawMessages = await redis.hgetall(`msgs:${conversationId}`);
  if (!rawMessages) return NextResponse.json([]);

  const rows = Object.values(rawMessages)
    .map(m => typeof m === 'string' ? JSON.parse(m) : m)
    .sort((a, b) => a.created_at - b.created_at);

  return NextResponse.json(rows);
}

export async function DELETE(req) {
  const { id } = await req.json();
  
  // Since we don't pass conversationId in DELETE easily, we have to find it
  // This is a bit expensive but fine for single user/small scale. 
  // Alternatively, pass conversation_id from the frontend.
  const keys = await redis.keys('msgs:*');
  for (const key of keys) {
    const rawMsg = await redis.hget(key, id);
    if (rawMsg) {
      const msg = typeof rawMsg === 'string' ? JSON.parse(rawMsg) : rawMsg;
      const parentId = msg.parent_id;

      // Re-parent children
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
      break;
    }
  }
  
  return NextResponse.json({ success: true });
}

export async function PUT(req) {
  const { id, content } = await req.json();
  const keys = await redis.keys('msgs:*');
  for (const key of keys) {
    const rawMsg = await redis.hget(key, id);
    if (rawMsg) {
      const msg = typeof rawMsg === 'string' ? JSON.parse(rawMsg) : rawMsg;
      msg.content = content;
      await redis.hset(key, id, JSON.stringify(msg));
      break;
    }
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
    pipeline.expire(key, WEEK);
    await pipeline.exec();
  }
  return NextResponse.json({ success: true });
}
