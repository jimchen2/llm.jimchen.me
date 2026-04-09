import { redis, redisSubscriber } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const id = req.nextUrl.searchParams.get('id');
  
  const stream = new ReadableStream({
    async start(controller) {
      // Send anything already generated (if user reconnected)
      const existingContent = await redis.get(`msg:${id}:content`);
      if (existingContent) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(existingContent)}\n\n`));
      }

      const channel = `msg:${id}:channel`;
      await redisSubscriber.subscribe(channel);

      redisSubscriber.on('message', (chan, message) => {
        if (chan === channel) {
          if (message === '[DONE]') {
            redisSubscriber.unsubscribe(channel);
            controller.close();
          } else {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(message)}\n\n`));
          }
        }
      });

      req.signal.addEventListener('abort', () => {
        redisSubscriber.unsubscribe(channel);
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}