import { redisSubscriber } from '@/lib/redis';

export async function GET(req) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return new Response('Missing message ID', { status: 400 });

  const stream = new ReadableStream({
    start(controller) {
      const targetChannel = `msg:${id}:channel`;

      const handler = (incomingChannel, message) => {
        // FIX: Ignore messages meant for other concurrent streams/windows
        if (incomingChannel !== targetChannel) return;

        if (message === '[DONE]') {
          cleanup();
          controller.close();
          return;
        }
        // The data from redis is already JSON stringified
        controller.enqueue(`data: ${message}\n\n`);
      };
      
      const cleanup = () => {
        redisSubscriber.unsubscribe(targetChannel);
        redisSubscriber.removeListener('message', handler);
      };

      // Handle client disconnect
      req.signal.onabort = () => {
        cleanup();
        console.log(`Stream for ${id} aborted.`);
      };

      redisSubscriber.subscribe(targetChannel, (err) => {
        if (err) {
          console.error(`Error subscribing to Redis channel ${targetChannel}`, err);
          controller.error(err);
        } else {
          redisSubscriber.on('message', handler);
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
