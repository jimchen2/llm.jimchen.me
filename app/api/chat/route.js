import { NextResponse, after } from "next/server";
import { redis, CACHE_TTL_SECONDS } from "@/lib/redis";
import { callLLM } from "@/lib/llm";

export async function POST(req) {
  const {
    messages,
    userMsgId,
    botMsgId,
    parentId,
    conversationId,
    apiKey,
    model,
    thinkingLevel = "low",
  } = await req.json();
  const userMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const msgKey = `msgs:${conversationId}`;

  const pipeline = redis.pipeline();

  // Save User Message
  if (userMsg && userMsg.role === "user" && userMsgId) {
    const userPayload = {
      id: userMsgId, conversation_id: conversationId, parent_id: parentId,
      role: "user", content: userMsg.content, created_at: Date.now(),
    };
    pipeline.hset(msgKey, userMsgId, JSON.stringify(userPayload));
  }

  // Create Bot Message placeholder
  const botPayload = {
    id: botMsgId, conversation_id: conversationId, parent_id: userMsgId || parentId,
    role: "assistant", content: "", created_at: Date.now() + 1,
  };
  pipeline.hset(msgKey, botMsgId, JSON.stringify(botPayload));
  pipeline.expire(msgKey, CACHE_TTL_SECONDS);

  // Extend conversation index expiration
  pipeline.expire("conversations:index", CACHE_TTL_SECONDS);
  pipeline.expire(`conv:${conversationId}`, CACHE_TTL_SECONDS);

  // Marks this bot message as currently generating so a page refresh can
  // resume its stream (flag lives longer than the LLM timeout).
  pipeline.set(`streaming:${botMsgId}`, "1", "EX", 300);

  await pipeline.exec();

  // Publish [DONE] twice with a small gap: a subscriber can subscribe between
  // the state write and the publish, missing the sentinel. The second publish
  // (or the chatstream replay check) covers that race.
  const publishDone = async (botId) => {
    await redis.publish(`msg:${botId}:channel`, "[DONE]");
    setTimeout(() => {
      redis.publish(`msg:${botId}:channel`, "[DONE]").catch(() => {});
    }, 400);
  };

  const runGeneration = async () => {
    let finalContent = "";

    try {
      await callLLM({
        apiKey,
        model,
        messages,
        thinkingLevel,
        onChunk: async (chunk) => {
          finalContent += chunk;

          // Persist + publish + refresh TTL in ONE round trip so every chunk
          // survives a refresh, and the stream stays resumable even if the
          // SSE connection drops.
          botPayload.content = finalContent;
          const p = redis.pipeline();
          p.hset(msgKey, botMsgId, JSON.stringify(botPayload));
          p.expire(msgKey, CACHE_TTL_SECONDS);
          p.expire(`conv:${conversationId}`, CACHE_TTL_SECONDS);
          p.publish(`msg:${botMsgId}:channel`, JSON.stringify(chunk));
          await p.exec();
        },
        onDone: async () => {
          botPayload.content = finalContent;
          await redis.hset(msgKey, botMsgId, JSON.stringify(botPayload));
          await redis.del(`streaming:${botMsgId}`);
          await publishDone(botMsgId);
        },
        onError: async (err) => {
          const errorMsg = `\n\n[Error: ${err.message}]`;
          botPayload.content = finalContent + errorMsg;
          await redis.hset(msgKey, botMsgId, JSON.stringify(botPayload));
          await redis.del(`streaming:${botMsgId}`);
          await redis.publish(`msg:${botMsgId}:channel`, JSON.stringify(errorMsg));
          await publishDone(botMsgId);
        },
      });
    } catch (err) {
      // Defensive: never leave an empty placeholder with a dangling stream flag.
      botPayload.content = finalContent || `\n\n[Error: ${err.message}]`;
      await redis.hset(msgKey, botMsgId, JSON.stringify(botPayload));
      await redis.del(`streaming:${botMsgId}`);
      await publishDone(botMsgId);
    }
  };

  // Run after the response is sent (works on serverless too, unlike
  // process.nextTick which may be frozen once the response returns).
  try {
    after(runGeneration);
  } catch {
    process.nextTick(runGeneration);
  }

  return NextResponse.json({ success: true });
}
