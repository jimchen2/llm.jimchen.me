import { NextResponse } from "next/server";
import { redis, CACHE_TTL_SECONDS } from "@/lib/redis";
import { callLLM } from "@/lib/llm";
import { getModeConfig, normalizeMode } from "@/lib/modes";

export async function POST(req) {
  const { messages, userMsgId, botMsgId, parentId, conversationId, model, mode: requestedMode } = await req.json();
  const userMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const msgKey = `msgs:${conversationId}`;

  // A conversation always continues in the mode it was created with (stored on
  // the conversation record). Only conversations without a stored mode yet fall
  // back to the requested mode — and that mode is then locked in.
  let mode = normalizeMode(requestedMode);
  let lockMode = false;
  if (conversationId) {
    const storedMode = await redis.hget(`conv:${conversationId}`, "mode");
    if (storedMode) {
      mode = normalizeMode(storedMode);
    } else {
      lockMode = true;
    }
  }

  const { apiKey, systemPrompt } = getModeConfig(mode);

  const pipeline = redis.pipeline();

  if (lockMode) {
    pipeline.hset(`conv:${conversationId}`, { mode });
  }

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

    // Prepend the mode's system prompt (from env) when configured.
    const llmMessages =
      systemPrompt && systemPrompt.length > 0
        ? [{ role: "system", content: systemPrompt }, ...messages]
        : messages;

    await callLLM({
      model,
      messages: llmMessages,
      apiKey,
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
