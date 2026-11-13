// GET /api/radio/status
//
// Returns the station list plus a server-side availability check for each one.
// The /radio page polls this, so the response is always a snapshot of the
// in-process cache (see lib/radio.js) and never blocks on upstream probes: any
// station that has not been checked yet, or whose result went stale, comes back
// as `pending: true` and is re-probed in the background. The page polls again a
// moment later and picks up the result.
//
// ?force=1 drops the cache and re-probes everything (manual "Проверить" action).
// ?force=1&i=<id> re-probes just that one station — used when the audio element
// reports a dead stream, so a station that died since the last sweep is dimmed
// immediately instead of after the success cache expires.
import { NextResponse } from 'next/server';
import { RADIO_STATIONS } from '@/lib/radioStations';
import {
  clearProbeCache,
  clearProbeCacheFor,
  getProbeCache,
  hasFreshResult,
  isHlsUrl,
  startBackgroundSweep,
  waitForSweep,
} from '@/lib/radio';

// Bounded wait so a cold cache gets useful answers in one round trip, without
// the response ever hanging on slow upstream stations.
const SWEEP_WAIT_MS = 9000;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === '1';
  const only = searchParams.get('i');
  if (force) {
    if (only !== null && RADIO_STATIONS[Number(only)]) {
      clearProbeCacheFor(RADIO_STATIONS[Number(only)].url);
    } else {
      clearProbeCache();
    }
  }

  const cache = getProbeCache();
  const pending = RADIO_STATIONS.filter((station) => !hasFreshResult(station.url));
  if (pending.length) {
    // Fire and forget — the next poll will see the results. The route only waits
    // a bounded amount, so a slow station cannot hold the response hostage.
    startBackgroundSweep(pending, { concurrency: 6 });
    await waitForSweep(SWEEP_WAIT_MS);
  }

  const stations = RADIO_STATIONS.map((station, index) => {
    const cached = cache.get(station.url);
    const fresh = hasFreshResult(station.url);
    return {
      id: index,
      name: station.name,
      city: station.city,
      url: station.url,
      // http:// streams are proxied through /api/radio/stream so the https://
      // page does not get blocked as mixed content. https:// streams (and HLS
      // playlists, whose relative segment URLs must resolve against the real
      // origin) are played directly.
      playUrl:
        station.url.startsWith('https://') || isHlsUrl(station.url)
          ? station.url
          : `/api/radio/stream?i=${index}`,
      // A station we are still checking keeps its last known answer, so the card
      // does not flicker.
      available: cached ? !!cached.ok : false,
      reason: cached ? cached.reason : 'checking',
      pending: !cached,
      stale: !!cached && !fresh,
      hls: !!cached?.hls || isHlsUrl(station.url),
      checkedAt: cached ? cached.checkedAt : null,
    };
  });

  return NextResponse.json(
    {
      stations,
      updatedAt: Date.now(),
      availableCount: stations.filter((station) => station.available).length,
      total: stations.length,
      pending: stations.filter((station) => station.pending).length,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
