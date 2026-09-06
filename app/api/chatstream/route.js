import { redis, redisSubscriber } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return new Response('Missing message ID', { status: 400 });
  const conversationId = req.nextUrl.searchParams.get('conversationId');

  const stream = new ReadableStream({
    start(controller) {
      const targetChannel = `msg:${id}:channel`;
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          redisSubscriber.unsubscribe(targetChannel);
          redisSubscriber.removeListener('message', handler);
        } catch {
          /* already cleaned up */
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const sendDone = () => {
        try {
          controller.enqueue('data: [DONE]\n\n');
        } catch {
          /* stream already closed */
        }
        close();
      };

      const handler = (incomingChannel, message) => {
        // FIX: Ignore messages meant for other concurrent streams/windows
        if (incomingChannel !== targetChannel) return;

        if (message === '[DONE]') {
          sendDone();
          return;
        }
        // The data from redis is already JSON stringified
        controller.enqueue(`data: ${message}\n\n`);
      };

      // Handle client disconnect
      req.signal.onabort = () => {
        close();
        console.log(`Stream for ${id} aborted.`);
      };

      redisSubscriber.subscribe(targetChannel, async (err) => {
        if (err) {
          console.error(`Error subscribing to Redis channel ${targetChannel}`, err);
          controller.error(err);
          return;
        }
        redisSubscriber.on('message', handler);

        // Redis pub/sub has no replay: if this stream already finished before
        // we subscribed (e.g. a fast-failing API call, or reconnect after a
        // refresh), the [DONE] publish was missed. Detect that and finish.
        try {
          let msg = null;
          if (conversationId) {
            const raw = await redis.hget(`msgs:${conversationId}`, id);
            if (raw) msg = JSON.parse(raw);
          }
          const streaming = await redis.get(`streaming:${id}`);
          if ((msg?.content || msg?.content === '') && !streaming) {
            sendDone();
          }
        } catch (e) {
          console.error(`Error checking stream state for ${id}`, e);
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
