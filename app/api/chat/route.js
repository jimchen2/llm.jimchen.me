import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { redis } from '@/lib/redis';
import { callLLM } from '@/lib/llm';

export async function POST(req) {
  const { messages, userMsgId, botMsgId, parentId, apiBase, apiKey, model } = await req.json();
  
  const userMsg = messages[messages.length - 1];

  // Save User Message
  if (userMsg.role === 'user') {
    await pool.query(
      'INSERT INTO messages (id, parent_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
      [userMsgId, parentId, 'user', userMsg.content, Date.now()]
    );
  }

  // Create empty Bot Message placeholder
  await pool.query(
    'INSERT INTO messages (id, parent_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
    [botMsgId, userMsgId || parentId, 'assistant', '', Date.now() + 1]
  );

  // Background processing - does not block the response so user can close the tab!
  process.nextTick(async () => {
    await callLLM({
      apiBase, apiKey, model, messages,
      onChunk: async (chunk) => {
        await redis.append(`msg:${botMsgId}:content`, chunk);
        await redis.publish(`msg:${botMsgId}:channel`, chunk);
      },
      onDone: async (fullText) => {
        await pool.query('UPDATE messages SET content = $1 WHERE id = $2', [fullText, botMsgId]);
        await redis.publish(`msg:${botMsgId}:channel`, '[DONE]');
        await redis.del(`msg:${botMsgId}:content`);
      },
      onError: async (err) => {
        const errorMsg = `\n\n[Error: ${err.message}]`;
        await pool.query('UPDATE messages SET content = content || $1 WHERE id = $2', [errorMsg, botMsgId]);
        await redis.publish(`msg:${botMsgId}:channel`, errorMsg);
        await redis.publish(`msg:${botMsgId}:channel`, '[DONE]');
      }
    });
  });

  return NextResponse.json({ success: true });
}