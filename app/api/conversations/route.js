import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const WEEK = 604800; // 7 days in seconds

export async function GET(req) {
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
  return NextResponse.json(rows);
}

export async function POST(req) {
  const { id, title } = await req.json();
  const now = Date.now();

  const pipeline = redis.pipeline();
  pipeline.zadd('conversations:index', now, id);
  pipeline.hset(`conv:${id}`, { id, title: title || 'New Conversation', created_at: now });
  
  // Set 1 week expiration
  pipeline.expire('conversations:index', WEEK);
  pipeline.expire(`conv:${id}`, WEEK);
  
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
