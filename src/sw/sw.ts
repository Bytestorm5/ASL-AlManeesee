/* Service worker — offline support for the reading pages.

   Built by integrations/site-output.ts after the site itself, which fills in
   the four constants below from the files actually built: the version is a
   hash of the precached files, so every deploy that changes the shell ships a
   new worker on its own. Installed users pick it up after fully closing and
   reopening the app. */
declare const __SW_VERSION__: string;
declare const __PRECACHE__: string[];
declare const __SHELL_PAGES__: string[];
declare const __DATA_ASSETS__: string[];

const sw = self as unknown as ServiceWorkerGlobalScope;

const SHELL = 'asl-shell-' + __SW_VERSION__;
const RUNTIME = 'asl-runtime-' + __SW_VERSION__;

/* The opt-in recitation download (the offline manager) lives in its own
   unversioned cache. It must survive activation: it is user-chosen, and
   re-fetching it can cost hundreds of megabytes. Only the versioned
   shell/runtime caches are swept. */
const AUDIO_CACHE = 'asl-audio';

/* The pages among the precached files, for the navigation rule further down.
   Only these are served from the cache first; anything else that returns
   HTML — the admin tools above all — keeps going to the network. */
const SHELL_PAGES = new Set(__SHELL_PAGES__);

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll(__PRECACHE__)
        /* The verse data comes from storage through the API. It is precached
           so an installed app can open the mutūn with no connection, but best
           effort only: a matn not imported yet, or a store that is down, must
           never stop the worker from installing. */
        .then(() => Promise.all(__DATA_ASSETS__.map((u) => cache.add(u).catch(() => undefined)))))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k !== SHELL && k !== RUNTIME && k !== AUDIO_CACHE)
        .map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') void sw.skipWaiting();
});

/* An <audio> element usually asks for a byte range, and a range request never
   lines up with the whole-file response sitting in the cache. Match on the URL
   alone (which drops the Range header), then cut the slice ourselves and answer
   206 — iOS in particular will not play a 200 sent in reply to a Range. */
async function serveAudio(req: Request): Promise<Response> {
  let cached: Response | undefined;
  try { cached = await caches.match(req.url); } catch { /* fall through */ }
  if (!cached) {
    try { return await fetch(req); } catch { return new Response('', { status: 504 }); }
  }
  const range = req.headers.get('range');
  if (!range) return cached;
  try {
    const buf = await cached.arrayBuffer();
    const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end = m[2] ? parseInt(m[2], 10) : buf.byteLength - 1;
    if (!isFinite(start) || start < 0 || start >= buf.byteLength) start = 0;
    if (!isFinite(end) || end >= buf.byteLength) end = buf.byteLength - 1;
    if (end < start) end = buf.byteLength - 1;
    const body = buf.slice(start, end + 1);
    return new Response(body, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Type': cached.headers.get('Content-Type') || 'audio/mp4',
        'Content-Length': String(body.byteLength),
        'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
        'Accept-Ranges': 'bytes',
      },
    });
  } catch {
    return cached;
  }
}

function keep(cacheName: string, key: RequestInfo, res: Response): void {
  const copy = res.clone();
  void caches.open(cacheName).then((c) => c.put(key, copy));
}

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url: URL;
  try { url = new URL(req.url); } catch { return; }
  const sameOrigin = url.origin === sw.location.origin;

  /* Verse data is the one API route that MUST be cacheable — without a cached
     copy the app could not open offline at all. Network-first, so an edit shows
     up on the next visit, falling back to the last good copy. */
  if (sameOrigin && /^\/api\/poems\/[^/]+\/data\.js$/.test(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => { if (res.status === 200) keep(SHELL, req, res); return res; })
        .catch(() => caches.match(req).then((r) => r || new Response('/* offline */', {
          status: 504, headers: { 'Content-Type': 'application/javascript' },
        }))),
    );
    return;
  }

  /* The qirāʾāt panels (index and cards): network-first like the verses, so
     an edit shows at once, with the last copy kept for reading offline. */
  if (sameOrigin && /^\/api\/qiraat\/[^/]+(\/index)?$/.test(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => { if (res.status === 200) keep(RUNTIME, req, res); return res; })
        .catch(() => caches.match(req).then((r) => r || Response.error())),
    );
    return;
  }

  /* Other API routes are network-only: the audio manifest must always be
     fresh, and when offline the failed fetch is what the players fall back on. */
  if (sameOrigin && url.pathname.startsWith('/api/')) return;

  /* Recitations: served from the audio cache first. A re-recorded bayt arrives
     under a new key, so a cached URL is never stale. */
  if (sameOrigin && url.pathname.startsWith('/media/')) {
    event.respondWith(serveAudio(req));
    return;
  }

  /* The app's own pages: served from the cache, with the network copy fetched
     behind it for next time. A network-first navigation means the launch waits
     a full round trip against a blank screen; from the cache it paints at once.
     The page served is at most one launch behind.

     ignoreSearch because the app launches at /?source=twa and opens a matn at
     ?mode=read — the query is read by the page, never by the server — and the
     refreshed copy is stored back under the bare path that was read, or the
     precached entry would keep winning for the life of the version. */
  const accept = req.headers.get('accept') || '';
  if (req.mode === 'navigate' || accept.includes('text/html')) {
    const shellPage = sameOrigin && SHELL_PAGES.has(url.pathname);
    const key = shellPage ? url.pathname : req;
    event.respondWith(
      (shellPage ? caches.match(req, { ignoreSearch: true, cacheName: SHELL }) : Promise.resolve(undefined))
        .then((hit) => {
          const net = fetch(req)
            .then((res) => {
              // Only a good response is kept: one 500 must not be served for the rest of the version.
              if (res.ok) keep(SHELL, key, res);
              return res;
            })
            .catch(() => hit || caches.match(req).then((r) => r || caches.match('/')).then((r) => r || Response.error()));
          return hit || net;
        }),
    );
    return;
  }

  // Same-origin assets (bundles, fonts, icons): stale-while-revalidate.
  if (sameOrigin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res.status === 200 && (res.type === 'basic' || res.type === 'cors')) keep(RUNTIME, req, res);
            return res;
          })
          .catch(() => cached || Response.error());
        return cached || network;
      }),
    );
  }
});

export {};
