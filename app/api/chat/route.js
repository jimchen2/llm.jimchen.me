import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { callLLM } from "@/lib/llm";
import pool from "../../../lib/db";

export async function POST(req) {
  const { messages, userMsgId, botMsgId, parentId, conversationId, apiKey, model } = await req.json();

  const userMsg = messages.length > 0 ? messages[messages.length - 1] : null;

  // Save User Message (skipped if userMsgId is null, e.g. when "retrying" a bot message)
  if (userMsg && userMsg.role === "user" && userMsgId) {
    await pool.query(
      "INSERT INTO messages (id, conversation_id, parent_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING", 
      [userMsgId, conversationId, parentId, "user", userMsg.content, Date.now()]
    );
  }

  // Create empty Bot Message placeholder
  await pool.query(
    "INSERT INTO messages (id, conversation_id, parent_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING", 
    [botMsgId, conversationId, userMsgId || parentId, "assistant", "", Date.now() + 1]
  );

  // Background processing
  process.nextTick(async () => {
    await callLLM({
      apiKey,
      model,
      messages,
      onChunk: async (chunk) => {
        await redis.publish(`msg:${botMsgId}:channel`, JSON.stringify(chunk));
      },
      onDone: async (fullText) => {
        await pool.query("UPDATE messages SET content = $1 WHERE id = $2", [fullText, botMsgId]);
        await redis.publish(`msg:${botMsgId}:channel`, "[DONE]");
      },
      onError: async (err) => {
        const errorMsg = `\n\n[Error: ${err.message}]`;
        await pool.query("UPDATE messages SET content = content || $1 WHERE id = $2", [errorMsg, botMsgId]);
        await redis.publish(`msg:${botMsgId}:channel`, JSON.stringify(errorMsg));
        await redis.publish(`msg:${botMsgId}:channel`, "[DONE]");
      },
    });
  });

  return NextResponse.json({ success: true });
}