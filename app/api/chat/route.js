// app/api/chat/route.js
import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { callLLM } from "@/lib/llm";
import pool from "../../../lib/db";

export async function POST(req) {
  // NOTE: apiBase removed
  const { messages, userMsgId, botMsgId, parentId, apiKey, model } = await req.json();

  const userMsg = messages[messages.length - 1];

  // Save User Message
  if (userMsg.role === "user") {
    await pool.query("INSERT INTO messages (id, parent_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING", [
      userMsgId,
      parentId,
      "user",
      userMsg.content,
      Date.now(),
    ]);
  }

  // Create empty Bot Message placeholder
  await pool.query("INSERT INTO messages (id, parent_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING", [
    botMsgId,
    userMsgId || parentId,
    "assistant",
    "",
    Date.now() + 1,
  ]);

  // Background processing - does not block the response so user can close the tab!
  process.nextTick(async () => {
    await callLLM({
      apiKey,
      model,
      messages, // NOTE: apiBase removed
      onChunk: async (chunk) => {
        // We don't need to append to redis here as the frontend doesn't use it.
        // We just publish the chunk for the streaming endpoint.
        await redis.publish(`msg:${botMsgId}:channel`, JSON.stringify(chunk));
      },
      onDone: async (fullText) => {
        await pool.query("UPDATE messages SET content = $1 WHERE id = $2", [fullText, botMsgId]);
        // Signal the stream to end
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
