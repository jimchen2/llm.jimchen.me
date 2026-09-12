import { NextResponse } from "next/server";
import { redis, CACHE_TTL_SECONDS } from "@/lib/redis";
import { callLLM, getApiKey, getSystemPrompt } from "@/lib/llm";
import { normalizeMode } from "@/lib/constants";

export async function POST(req) {
  const { messages, userMsgId, botMsgId, parentId, conversationId, model, mode: requestedMode } = await req.json();
  const userMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const msgKey = `msgs:${conversationId}`;

  // The mode belongs to the conversation itself and never expires: coming back
  // to a "random" conversation always keeps it random. It is stored on the
  // conversation record in Redis; the client value is only a fallback for the
  // very first message of a brand new conversation.
  const conv = await redis.hgetall(`conv:${conversationId}`).catch(() => null);
  const mode = normalizeMode(conv?.mode || requestedMode);

  // Two separate API keys (one per mode) so usage is calculated and billed
  // separately in the backend. The system prompt comes from the environment:
  // tech mode uses SYSTEM_PROMPT_TECH, random mode has none at all.
  const apiKey = getApiKey(mode);
  const systemPrompt = getSystemPrompt(mode);
  if (mode === "tech" && !systemPrompt) {
    console.warn("[chat] SYSTEM_PROMPT_TECH is not set — tech conversations will run without a system prompt.");
  }

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
  pipeline.expire(msgKey, CACHE_TTL_SECONDS);
  
  // Extend conversation index expiration
  pipeline.expire('conversations:index', CACHE_TTL_SECONDS);
  pipeline.expire(`conv:${conversationId}`, CACHE_TTL_SECONDS);
  
  await pipeline.exec();

  // Background processing
  process.nextTick(async () => {
    let finalContent = "";
    await callLLM({
      apiKey,
      model,
      systemPrompt,
      mode,
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
