/* Thin, typed helpers over the R2 bucket.

   R2 is strongly consistent: a read straight after a write sees that write,
   and a listing reflects it too. That retires the cache-busting and
   head-then-list dance the Vercel Blob version needed. What R2 adds is a real
   compare-and-swap — a put can be made conditional on the etag that was read —
   so two editors saving at once can never silently overwrite each other. */

export interface Stored<T> { value: T; etag: string; uploaded: Date }

export async function readJson<T>(bucket: R2Bucket, key: string): Promise<Stored<T> | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;
  try {
    return { value: (await obj.json()) as T, etag: obj.etag, uploaded: obj.uploaded };
  } catch {
    return null; // unreadable JSON is treated as absent, never as a crash
  }
}

export interface WriteOptions {
  /** Only write if the stored object still has this etag (compare-and-swap). */
  ifEtag?: string;
  /** Kept on the object; listings can return it without reading the body. */
  meta?: Record<string, string>;
}

/** Returns the stored object, or null when `ifEtag` no longer matches. */
export async function writeJson(bucket: R2Bucket, key: string, value: unknown, opts: WriteOptions = {}): Promise<R2Object | null> {
  return bucket.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: opts.meta,
    onlyIf: opts.ifEtag ? { etagMatches: opts.ifEtag } : undefined,
  });
}

/** Every object under a prefix, following the cursor to the end. */
export async function listAll(bucket: R2Bucket, prefix: string, opts: { metadata?: boolean; max?: number } = {}): Promise<R2Object[]> {
  const out: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({
      prefix, cursor, limit: 1000,
      include: opts.metadata ? ['customMetadata', 'httpMetadata'] : undefined,
    });
    out.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor && (!opts.max || out.length < opts.max));
  return out;
}

/** Keep the newest `keep` backups under a prefix ending in -v<N>.json. */
export async function pruneBackups(bucket: R2Bucket, prefix: string, keep: number): Promise<void> {
  try {
    const objs = await listAll(bucket, prefix);
    if (objs.length <= keep) return;
    const versionOf = (k: string) => parseInt(/-v(\d+)\.json$/.exec(k)?.[1] ?? '0', 10);
    const doomed = objs.sort((a, b) => versionOf(b.key) - versionOf(a.key)).slice(keep);
    await bucket.delete(doomed.map((o) => o.key));
  } catch {
    /* pruning is housekeeping — never fail a save over it */
  }
}

/* A few routes are read on every page load (the manifest, a matn's verses, the
   audio manifest). Worker responses are not cached by the CDN on their own, so
   these go through the colo's cache for a few seconds: a burst of readers
   opening one matn costs one storage read, and an edit still shows within
   that window. A write purges the entry in its own colo straight away. */
/** All a handler needs of its execution context (Hono's and the runtime's
    types for it differ in fields we never touch). */
export interface Waiter { waitUntil(p: Promise<unknown>): void }

export async function edgeCached(
  ctx: Waiter,
  req: Request,
  ttl: number,
  produce: () => Promise<Response>,
): Promise<Response> {
  const cache = typeof caches !== 'undefined' ? caches.default : undefined;
  const key = new Request(new URL(req.url).toString(), { method: 'GET' });
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  const res = await produce();
  if (cache && res.status === 200) {
    const copy = new Response(res.clone().body, res);
    copy.headers.set('Cache-Control', `public, max-age=0, s-maxage=${ttl}`);
    ctx.waitUntil(cache.put(key, copy));
  }
  return res;
}

export function purgeCached(ctx: Waiter, reqUrl: string, paths: string[]): void {
  const cache = typeof caches !== 'undefined' ? caches.default : undefined;
  if (!cache) return;
  const origin = new URL(reqUrl).origin;
  ctx.waitUntil(Promise.all(paths.map((p) => cache.delete(new Request(origin + p)).catch(() => false))));
}
