import { NextResponse } from "next/server";
import { redis, CACHE_TTL_SECONDS } from "@/lib/redis";
import { callLLM } from "@/lib/llm";
import {
  getModeConfig,
  getModeMemory,
  getModeMaxMessages,
  isDesktopOnlyMode,
  modePersistsConversation,
} from "@/lib/modes";
import { allowsRandomMode } from "@/lib/desktopGate";

export async function POST(req) {
  const { messages, userMsgId, botMsgId, parentId, conversationId, model, mode } = await req.json();
  const userMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const msgKey = `msgs:${conversationId}`;

  // Random mode is desktop-only: reject it unless the request carries the
  // header the desktop-only Mode dropdown sets and is not coming from a phone.
  if (isDesktopOnlyMode(mode) && !allowsRandomMode(req)) {
    return NextResponse.json({ error: "random_mode_desktop_only" }, { status: 403 });
  }

  // Enforce the short-conversation cap on the server as well as in the UI.
  // Count the ancestry before accepting another complete user/assistant turn.
  const maxMessages = getModeMaxMessages(mode);
  if (userMsgId && Number.isFinite(maxMessages)) {
    const stored = await redis.hgetall(msgKey);
    let cursor = parentId;
    let pathLength = 0;
    const visited = new Set();
    while (cursor && stored[cursor] && !visited.has(cursor)) {
      visited.add(cursor);
      const message = typeof stored[cursor] === "string"
        ? JSON.parse(stored[cursor])
        : stored[cursor];
      pathLength++;
      cursor = message.parent_id;
    }
    if (pathLength + 2 > maxMessages) {
      return NextResponse.json(
        { error: "conversation_limit_reached" },
        { status: 409 }
      );
    }
  }

  const { systemPrompt } = getModeConfig(mode);

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

  // Random-mode conversations are kept in Redis forever: no TTL on the messages
  // or on the conversation hash (PERSIST also clears a TTL set earlier). Every
  // other mode keeps the normal cache expiry.
  if (modePersistsConversation(mode)) {
    pipeline.persist(msgKey);
    pipeline.persist(`conv:${conversationId}`);
  } else {
    pipeline.expire(msgKey, CACHE_TTL_SECONDS);
    pipeline.expire(`conv:${conversationId}`, CACHE_TTL_SECONDS);
  }

  // Extend conversation index expiration (the index itself is shared by all
  // modes; app/api/conversations recovers persistent conversations if it ever
  // expires before their data does).
  pipeline.expire('conversations:index', CACHE_TTL_SECONDS);

  await pipeline.exec();

  // Background processing
  process.nextTick(async () => {
    let finalContent = "";

    // Enforce the mode's memory server-side too, so capped modes stay capped
    // even if a client sends the full history: short conversation mode only
    // forwards its last few messages. The messages are still saved above
    // exactly as before — this only limits LLM context.
    const memory = getModeMemory(mode);
    const contextMessages =
      memory === Infinity ? messages : messages.slice(-(memory + 1));

    // Prepend the mode's system prompt (from env) when configured. Random mode
    // resolves to no system prompt at all, so the model sees only the
    // conversation itself.
    const llmMessages =
      systemPrompt && systemPrompt.length > 0
        ? [{ role: "system", content: systemPrompt }, ...contextMessages]
        : contextMessages;

    await callLLM({
      model,
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
