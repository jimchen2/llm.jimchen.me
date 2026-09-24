/*
 * yt.js - A stripped-down YouTube video downloader that runs in the browser
 *         console (pure browser APIs, no dependencies).
 *
 * Browser port of yt.py, which itself was distilled from yt-dlp
 * (https://github.com/yt-dlp/yt-dlp). It mirrors the same flow:
 *
 *   1. Parse the video ID
 *   2. Grab INNERTUBE_API_KEY from the page's ytcfg blob (or the watch page)
 *   3. POST to the Innertube `player` API with a mobile client context
 *   4. Read direct stream URLs from streamingData.formats/adaptiveFormats
 *   5. Download the bytes and hand them to the browser as a file download
 *
 * HOW TO USE
 *   1. Open any youtube.com page in Chrome/Firefox/Edge (ideally the video's
 *      own watch page - then you don't even need to pass a URL).
 *   2. Open DevTools (F12) -> Console tab, paste this whole file, press Enter.
 *      (Chrome may ask you to type "allow pasting" first - that's expected.)
 *   3. Run one of:
 *
 *        yt()                              // video on this page, best muxed mp4
 *        yt('https://youtu.be/dQw4w9WgXcQ') // any watch/shorts/youtu.be URL or id
 *        yt(url, { list: true })           // list available formats   (yt.py -F)
 *        yt(url, { itag: 18 })             // pick a format by itag    (yt.py -f)
 *        yt(url, { out: 'clip.mp4' })      // custom output filename   (yt.py -o)
 *        yt.abort()                        // cancel a running download
 *
 *      The browser then saves the file like any other download. Progress is
 *      logged to the console. Options can be combined: yt(url, { itag: 22, out: 'x' })
 *
 * WHY IT HAS TO RUN ON youtube.com
 *   Browsers enforce the same-origin policy. youtube.com/youtubei/... only
 *   answers requests from youtube.com pages and *.googlevideo.com only sends
 *   CORS headers for youtube.com origins. From any other page both calls are
 *   blocked, so this is a console script rather than a standalone web page.
 *
 * DIFFERENCES FROM yt.py (all forced by the browser sandbox)
 *   - `User-Agent` is a forbidden request header: page JavaScript cannot set
 *     it, so yt.py's per-client user agents are dropped and every request
 *     goes out with your browser's own UA. The Innertube context body itself
 *     is identical to yt.py's.
 *   - Downloads are fetched in bounded 10 MiB `range=` chunks, like yt-dlp's
 *     native downloader (http_chunk_size). googlevideo throttles - and lately
 *     rejects with 403 - single open-ended requests, and the `range=` query
 *     parameter needs no CORS preflight, unlike a `Range` header.
 *   - There is no filesystem. Chunks are collected into a Blob and saved with
 *     an <a download> click, so the whole file sits in memory until it is
 *     saved. Fine for the muxed formats this picks by default (<= 720p).
 *   - Innertube is called with `credentials: 'omit'`, i.e. without your
 *     YouTube cookies, so the request is anonymous exactly like the Python one.
 *
 * Everything else the Python script stripped away (playlists, HLS/DASH, SABR,
 * JS signature decryption, n-challenge, PO tokens, subtitles, ffmpeg merging)
 * is still stripped away here.
 */
(() => {
  'use strict';

  // Same clients as yt.py. `clientNameId` becomes the X-YouTube-Client-Name
  // header; every other field is sent as the Innertube `context.client`.
  // yt.py's per-client `userAgent` is gone: it only ever went into the HTTP
  // User-Agent header, which page JavaScript is not allowed to set.
  const CLIENTS = [
    {
      clientName: 'ANDROID',
      clientVersion: '21.26.364',
      androidSdkVersion: 30,
      osName: 'Android',
      osVersion: '11',
      clientNameId: '3',
    },
    {
      clientName: 'IOS',
      clientVersion: '21.26.4',
      deviceMake: 'Apple',
      deviceModel: 'iPhone16,2',
      clientNameId: '5',
    },
    {
      clientName: 'VISIONOS',
      clientVersion: '1.02',
      deviceMake: 'Apple',
      deviceModel: 'RealityDevice17,1',
      osName: 'visionOS',
      osVersion: '26.5.23O471',
      clientNameId: '101',
    },
  ];

  const CHUNK_SIZE = 10 * 1024 * 1024; // yt-dlp's http_chunk_size for YouTube
  const RETRIES = 3;                   // attempts per chunk before giving up

  // Talk to whichever youtube.com host we are on (www / m / music all serve
  // /youtubei/v1/player); anywhere else we can only try and warn.
  const ON_YOUTUBE = /(^|\.)youtube\.com$/.test(globalThis.location?.hostname || '');
  const ORIGIN = ON_YOUTUBE ? globalThis.location.origin : 'https://www.youtube.com';

  let controller = null; // AbortController of the most recent yt() run

  const USAGE = [
    'yt.js loaded. usage:',
    "  yt()                              download the video on this page (best muxed mp4)",
    "  yt('https://youtu.be/ID')         download a specific video (URL or 11-char id)",
    "  yt(url, { list: true })           list available formats           (yt.py -F)",
    "  yt(url, { itag: 18 })             download a specific format by itag (yt.py -f)",
    "  yt(url, { out: 'clip.mp4' })      custom output filename            (yt.py -o)",
    "  yt.abort()                        cancel a running download",
  ].join('\n');

  function extractVideoId(url) {
    url = String(url || '');
    let m = url.match(/^([\w-]{11})(?:\?\S*)?$/);
    if (m) return m[1];
    m = url.match(/(?:youtube\.com\/(?:watch\?[^#]*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
    if (m) return m[1];
    throw new Error(`could not extract a video ID from ${JSON.stringify(url)} - ` +
                    "pass a watch/shorts/youtu.be URL or an 11-character id, e.g. yt('https://youtu.be/dQw4w9WgXcQ')");
  }

  async function getApiKey(videoId, signal) {
    // On youtube.com the page already carries the ytcfg blob - no refetch needed.
    let apiKey = null;
    try { apiKey = globalThis.ytcfg?.get?.('INNERTUBE_API_KEY') || null; } catch { /* not a youtube page */ }
    if (apiKey) {
      console.log(`innertube api key: ${apiKey} (from page ytcfg)`);
      return apiKey;
    }
    // Same as yt.py: fetch the watch page and regex the key out of it.
    try {
      const res = await fetch(`${ORIGIN}/watch?v=${videoId}`, { signal });
      const m = (await res.text()).match(/"INNERTUBE_API_KEY":"([^"]+)"/);
      if (m) {
        console.log(`innertube api key: ${m[1]}`);
        return m[1];
      }
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      console.warn(`watch page fetch failed: ${e.message}`);
    }
    // The `key` query parameter is optional for Innertube nowadays (yt-dlp no
    // longer sends it), so unlike yt.py we carry on without it.
    console.warn('INNERTUBE_API_KEY not found on watch page; calling the player API without a key');
    return null;
  }

  async function requestPlayer(videoId, apiKey, signal) {
    let best = null;
    const fmts = [];
    const seen = new Set();
    let lastError = 'no playable formats';
    for (const client of CLIENTS) {
      console.log(`\n--- querying innertube client: ${client.clientName} ---`);
      const { clientNameId, ...context } = client; // same context shape as yt.py
      const payload = {
        context: { client: context },
        videoId,
        playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
        contentCheckOk: true,
        racyCheckOk: true,
      };
      const url = `${ORIGIN}/youtubei/v1/player?prettyPrint=false${apiKey ? `&key=${apiKey}` : ''}`;

      console.log(`post url: ${url}`);
      console.log(`post payload (summary): videoId=${videoId}, client=${client.clientName}`);

      let data;
      try {
        const res = await fetch(url, {
          method: 'POST',
          credentials: 'omit', // anonymous, like yt.py (no cookies -> no SAPISIDHASH needed)
          signal,
          headers: {
            'Content-Type': 'application/json',
            'X-YouTube-Client-Name': clientNameId,
            'X-YouTube-Client-Version': client.clientVersion,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        lastError = `${client.clientName} request failed: ${e.message}`;
        console.log(`request error: ${lastError}`);
        continue;
      }

      const status = data.playabilityStatus || {};
      console.log(`playability status: ${status.status}`);
      console.log(`json blob keys received: ${Object.keys(data).join(', ')}`);
      if (data.streamingData) {
        const sd = data.streamingData;
        console.log(`streamingData found: ${(sd.formats || []).length} muxed formats, ` +
                    `${(sd.adaptiveFormats || []).length} adaptive formats`);
      }

      if (status.status !== 'OK') {
        lastError = `${client.clientName}: ${status.reason || status.status}`;
        continue;
      }
      if (!best) best = data;
      for (const f of parseFormats(data, client)) {
        const key = `${f.itag}|${f.hasAudio}|${!!f.height}`;
        if (!seen.has(key)) {
          seen.add(key);
          fmts.push(f);
        }
      }
    }
    if (!fmts.length) throw new Error(`video not playable - ${lastError}`);
    console.log('--------------------------------------------\n');
    return { player: best, fmts };
  }

  function parseFormats(playerResponse, client) {
    const fmts = [];
    const sd = playerResponse.streamingData || {};
    for (const f of [...(sd.formats || []), ...(sd.adaptiveFormats || [])]) {
      if (!f.url) continue; // signatureCipher-only formats need JS decryption: skipped, as in yt.py
      const mime = f.mimeType || '';
      const type = mime.split(';')[0];
      fmts.push({
        itag: f.itag,
        url: f.url,
        mime: type,
        container: type.split('/').pop() || 'mp4',
        codecs: (mime.split('codecs="')[1] || '').replace(/"+$/, ''),
        width: f.width, height: f.height,
        fps: f.fps, bitrate: f.bitrate || 0,
        hasAudio: 'audioQuality' in f || !!f.audioChannels,
        size: parseInt(f.contentLength, 10) || 0,
        client: client.clientName,
        label: f.qualityLabel || (f.audioQuality || '').replace('AUDIO_QUALITY_', ''),
      });
    }
    return fmts;
  }

  function human(n) {
    for (const unit of ['B', 'KiB', 'MiB', 'GiB']) {
      if (n < 1024 || unit === 'GiB') return `${n.toFixed(1)} ${unit}`;
      n /= 1024;
    }
  }

  function describe(f) {
    const kind = f.hasAudio && f.height ? 'muxed' : f.height ? 'video' : 'audio';
    return `${String(f.itag).padStart(4)}  ${f.container.padEnd(5)} ${kind.padEnd(6)} ` +
           `${(f.label || '?').padEnd(8)} ${(f.size ? human(f.size) : '?').padStart(9)}  ${f.codecs}`;
  }

  function pickFormat(fmts, itag) {
    if (itag != null) {
      const f = fmts.find((x) => x.itag === itag);
      if (!f) throw new Error(`itag ${itag} not available; use yt(url, { list: true }) to list formats`);
      return f;
    }
    const muxed = fmts.filter((f) => f.hasAudio && f.height);
    const video = fmts.filter((f) => f.height);
    const pool = muxed.length ? muxed : video.length ? video : fmts;
    if (!muxed.length) {
      console.warn('warning: no muxed format found; downloading the best video-only stream (no audio)');
    }
    // max by (height, bitrate); first one wins on ties, like Python's max()
    return pool.reduce((a, b) =>
      (((b.height || 0) - (a.height || 0)) || (b.bitrate - a.bitrate)) > 0 ? b : a);
  }

  async function fetchChunk(url, signal) {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(url, { credentials: 'omit', signal });
        if (res.status === 416) return new ArrayBuffer(0); // asked past the end
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.arrayBuffer();
      } catch (e) {
        if (e.name === 'AbortError' || attempt >= RETRIES) throw e;
        console.warn(`chunk failed (${e.message}); retry ${attempt}/${RETRIES - 1}`);
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  async function download(fmt, outName, signal) {
    console.log(`final download link: ${fmt.url}`);
    const total = fmt.size; // from contentLength; 0 when YouTube didn't say
    const sep = fmt.url.includes('?') ? '&' : '?';
    const chunks = [];
    let got = 0;
    const t0 = Date.now();
    while (!total || got < total) {
      const want = total ? Math.min(CHUNK_SIZE, total - got) : CHUNK_SIZE;
      let buf;
      try {
        buf = await fetchChunk(`${fmt.url}${sep}range=${got}-${got + want - 1}`, signal);
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        throw new Error(`download failed at byte ${got}: ${e.message}`);
      }
      if (!buf.byteLength) break; // server says there is nothing more
      chunks.push(buf);
      got += buf.byteLength;
      const secs = (Date.now() - t0) / 1000;
      const rate = secs > 0 ? `  ${human(got / secs)}/s` : '';
      console.log(total
        ? `${(got / total * 100).toFixed(1).padStart(5)}% of ${human(total)}${rate}`
        : `${human(got)}${rate}`);
      if (!total && buf.byteLength < want) break; // short read = end of file
    }
    if (!got) throw new Error('download failed: the stream URL returned no data');
    saveBlob(new Blob(chunks, { type: fmt.mime }), outName);
    console.log(`saved -> ${outName} (${human(got)})`);
    return got;
  }

  // The browser's stand-in for open(out_path, 'wb'): hand the bytes to the
  // download manager via a temporary <a download> link.
  function saveBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60 * 1000);
  }

  async function yt(urlOrId, opts = {}) {
    if (typeof opts === 'number') opts = { itag: opts }; // yt(url, 18) shorthand
    const ctl = new AbortController();
    controller = ctl;
    try {
      if (!ON_YOUTUBE) {
        console.warn('yt.js: not on youtube.com - the same-origin policy will most likely block ' +
                     'the Innertube and googlevideo requests. Run this from a youtube.com tab.');
      }
      const videoId = extractVideoId(urlOrId || globalThis.location?.href);
      console.log(`video id: ${videoId}`);
      const apiKey = await getApiKey(videoId, ctl.signal);
      const { player, fmts } = await requestPlayer(videoId, apiKey, ctl.signal);

      const title = player.videoDetails?.title || videoId;
      console.log(`title: ${title}`);
      console.log(`${fmts.length} downloadable format(s)`);

      if (opts.list) {
        const sorted = [...fmts].sort((a, b) =>
          ((b.height || 0) - (a.height || 0)) || (a.bitrate - b.bitrate));
        for (const f of sorted) console.log(`${describe(f)}\n  -> ${f.url.slice(0, 90)}...`);
        return sorted; // full objects (with complete URLs) for poking at in the console
      }

      let itag = null;
      if (opts.itag != null) {
        itag = Number(opts.itag);
        if (!Number.isInteger(itag)) throw new Error(`invalid itag: ${JSON.stringify(opts.itag)}`);
      }
      const fmt = pickFormat(fmts, itag);
      console.log('selected:', describe(fmt).trim());

      let out = opts.out || title.replace(/[\\/:*?"<>|]+/g, '_');
      if (!out.toLowerCase().endsWith('.' + fmt.container)) out += '.' + fmt.container;
      const size = await download(fmt, out, ctl.signal);
      return { videoId, title, filename: out, size, format: fmt };
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('aborted by yt.abort()');
      throw e;
    } finally {
      if (controller === ctl) controller = null;
    }
  }

  yt.abort = () => { if (controller) controller.abort(); };

  globalThis.yt = yt;
  console.log(USAGE);
})();
