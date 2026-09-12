// lib/chatHandler.js
// Shared implementation for the two chat APIs:
//   POST /api/chat/tech   — tech mode, TECH_SYSTEM_PROMPT is applied server-side
//   POST /api/chat/random — random mode, no system prompt at all
import { NextResponse } from "next/server";
import { redis, CACHE_TTL_SECONDS } from "@/lib/redis";
import { callLLM } from "@/lib/llm";
import { TECH_SYSTEM_PROMPT, GEMINI_API_KEY, DEFAULT_MODEL, MODES } from "@/lib/config";

export async function handleChatPOST(req, mode) {
  const { messages, userMsgId, botMsgId, parentId, conversationId, apiKey, model } = await req.json();

  // Client-provided key wins, otherwise fall back to the server key from env.
  const effectiveApiKey = apiKey || GEMINI_API_KEY;
  if (!effectiveApiKey) {
    return NextResponse.json(
      { error: "Missing API key. Set GEMINI_API_KEY on the server or add one in Settings." },
      { status: 400 }
    );
  }

  // The server owns the system prompt: tech mode injects it, random mode strips it.
  const userVisibleMessages = (messages || []).filter((m) => m.role !== "system");
  const llmMessages =
    mode === MODES.RANDOM
      ? userVisibleMessages
      : [{ role: "system", content: TECH_SYSTEM_PROMPT }, ...userVisibleMessages];

  const userMsg = userVisibleMessages.length > 0 ? userVisibleMessages[userVisibleMessages.length - 1] : null;
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
  pipeline.expire(msgKey, CACHE_TTL_SECONDS);

  // Extend conversation index expiration
  pipeline.expire('conversations:index', CACHE_TTL_SECONDS);
  pipeline.expire(`conv:${conversationId}`, CACHE_TTL_SECONDS);

  await pipeline.exec();

  // Background processing
  process.nextTick(async () => {
    let finalContent = "";
    await callLLM({
      apiKey: effectiveApiKey,
      model: model || DEFAULT_MODEL,
      messages: llmMessages,
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
