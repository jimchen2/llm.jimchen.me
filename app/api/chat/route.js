import { NextResponse } from "next/server";
import { redis, CACHE_TTL_SECONDS } from "@/lib/redis";
import { callLLM, resolveModel } from "@/lib/llm";
import { DEFAULT_MODE, normalizeMode } from "@/lib/modes";
import { isAuthorized, unauthorized } from "@/lib/auth";

export async function POST(req) {
  if (!isAuthorized(req)) return unauthorized();

  const {
    messages = [],
    userMsgId,
    botMsgId,
    parentId,
    conversationId,
    mode: requestedMode,
    model: modelOverride,
  } = await req.json();

  if (!conversationId || !botMsgId) {
    return NextResponse.json({ error: "conversationId and botMsgId are required" }, { status: 400 });
  }

  const userMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const msgKey = `msgs:${conversationId}`;
  const convKey = `conv:${conversationId}`;

  // The mode belongs to the conversation (and with it the system prompt and the
  // API key that pays for this answer). It is read from the stored conversation
  // so that history can never be replayed under a different mode.
  const storedMode = await redis.hget(convKey, "mode");
  const mode = normalizeMode(storedMode || requestedMode || DEFAULT_MODE);
  const model = resolveModel(mode, modelOverride);

  const pipeline = redis.pipeline();

  // Save User Message
  if (userMsg && userMsg.role === "user" && userMsgId) {
    const userPayload = {
      id: userMsgId, conversation_id: conversationId, parent_id: parentId,
      role: "user", content: userMsg.content, mode, created_at: Date.now()
    };
    pipeline.hset(msgKey, userMsgId, JSON.stringify(userPayload));
  }

  // Create Bot Message placeholder
  const botPayload = {
    id: botMsgId, conversation_id: conversationId, parent_id: userMsgId || parentId,
    role: "assistant", content: "", mode, model, created_at: Date.now() + 1
  };
  pipeline.hset(msgKey, botMsgId, JSON.stringify(botPayload));
  pipeline.expire(msgKey, CACHE_TTL_SECONDS);

  // Conversations created before modes existed get the default mode written once.
  if (!storedMode) pipeline.hsetnx(convKey, "mode", mode);

  // Extend conversation index expiration
  pipeline.expire('conversations:index', CACHE_TTL_SECONDS);
  pipeline.expire(convKey, CACHE_TTL_SECONDS);

  await pipeline.exec();

  // Background processing
  process.nextTick(async () => {
    let finalContent = "";
    await callLLM({
      mode,
      model,
      messages,
      onChunk: async (chunk) => {
        finalContent += chunk;
        await redis.publish(`msg:${botMsgId}:channel`, JSON.stringify(chunk));
      },
      onDone: async (text, meta) => {
        botPayload.content = text ?? finalContent;
        // Kept for backend accounting: mode/model/tokens per answer.
        botPayload.usage = meta?.usage ?? null;
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

  return NextResponse.json({ success: true, mode, model });
}
