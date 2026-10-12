// Runs once when a Next.js server process boots (see Next's `instrumentation`).
// Clears leftover Redis key TTLs from deployments that ran with
// CACHE_TTL_SECONDS set, so existing chats stop disappearing. The sweep is a
// no-op when a TTL is configured. It is fire-and-forget so that an unreachable
// Redis can never delay server startup, and the Redis client is imported
// lazily so the Edge runtime never loads it.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  try {
    const { sweepExpiringKeys } = await import('./lib/redis');
    sweepExpiringKeys().catch((err) => {
      console.error('[instrumentation] Redis TTL sweep failed:', err);
    });
  } catch (err) {
    console.error('[instrumentation] Could not start Redis TTL sweep:', err);
  }
}
