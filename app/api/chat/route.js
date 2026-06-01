import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { callLLM } from "@/lib/llm";

const WEEK = 604800;

export async function POST(req) {
  const { messages, userMsgId, botMsgId, parentId, conversationId, apiKey, model } = await req.json();
  const userMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const msgKey = `msgs:${conversationId}`;

  const pipeline = redis.pipeline();

  // Save User Message
  if (userMsg && userMsg.role === "user" && userMsgId) {
    const userPayload = {
      id: userMsgId, conversation_id: conversationId, parent_id: parentId,
      role: "user", content: userMsg.content, created_at: Date.now()
    };
    pipeline.hset(msgKey, userMsgId, JSON.stringify(userPayload));
  }

  // Create Bot Message placeholder
  const botPayload = {
    id: botMsgId, conversation_id: conversationId, parent_id: userMsgId || parentId,
    role: "assistant", content: "", created_at: Date.now() + 1
  };
  pipeline.hset(msgKey, botMsgId, JSON.stringify(botPayload));
  pipeline.expire(msgKey, WEEK);
  
  // Extend conversation index expiration
  pipeline.expire('conversations:index', WEEK);
  pipeline.expire(`conv:${conversationId}`, WEEK);
  
  await pipeline.exec();

  // Background processing
  process.nextTick(async () => {
    let finalContent = "";
    await callLLM({
      apiKey,
      model,
      messages,
      onChunk: async (chunk) => {
        finalContent += chunk;
        await redis.publish(`msg:${botMsgId}:channel`, JSON.stringify(chunk));
      },
      onDone: async () => {
        botPayload.content = finalContent;
        await redis.hset(msgKey, botMsgId, JSON.stringify(botPayload));
        await redis.publish(`msg:${botMsgId}:channel`, "[DONE]");
      },
      onError: async (err) => {
        const errorMsg = `\n\n[Error: ${err.message}]`;
        botPayload.content = finalContent + errorMsg;
        await redis.hset(msgKey, botMsgId, JSON.stringify(botPayload));
        await redis.publish(`msg:${botMsgId}:channel`, JSON.stringify(errorMsg));
        await redis.publish(`msg:${botMsgId}:channel`, "[DONE]");
      },
    });
  });

  return NextResponse.json({ success: true });
}
