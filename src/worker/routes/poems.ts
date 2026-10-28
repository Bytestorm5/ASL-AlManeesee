/* Verse data — the only copy of every matn lives in R2, so these routes ARE
   the critical path. Each reading page loads its verses from data.js, a
   blocking same-origin script, and the service worker keeps the last good
   copy for offline. The data loader on the page then watches the manifest and
   patches in any newer version without a reload.

   GET  /api/manifest                   → {ok, version, updatedAt, poems, qiraat}
   GET  /api/poems/:id/data.js          → window.ASL_CH=…;window.ASL_CH_V=…;window.ASL_VARIANTS=…
   GET  /api/poems/:id[?weld=1]         → the document, no-store (the editors read this)
   PUT  /api/poems/:id                  → merge bayts   body {baseVersion, bayts:[…]}
   PUT  /api/poems/:id/document[?overwrite=1] → create/replace body {doc:{chapters, variants?}}

   Writes are password-gated, validated whole, versioned, backed up, and made
   with a compare-and-swap on the stored object, so a save can never land on
   top of someone else's. */
import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { requireAdmin } from '../auth.ts';
import { edgeCached, listAll, pruneBackups, purgeCached, readJson, writeJson, type Waiter } from '../store.ts';
import { isPoemId } from '../../poems/index.ts';
import type { Manifest, ManifestEntry, PoemDoc } from '../../poems/types.ts';
import {
  BACKUPS_KEPT, backupKey, mergeBayts, nowIso, poemKey, stripPoemTeX, validateBayt,
  validatePoemDoc, versesOf, weldPoemDoc,
} from '../../shared/poem-data.ts';

export const poems = new Hono<AppEnv>();

const versionMeta = (doc: { version: number; updatedAt: string | null }) => ({
  version: String(doc.version),
  updatedAt: doc.updatedAt ?? '',
});

/* ── manifest ─────────────────────────────────────────────────────────────
   Derived from the listing every time rather than kept as a document of its
   own: each dataset carries its version as object metadata, and an R2 listing
   is consistent with the writes before it, so there is nothing to drift and
   nothing to rebuild. */
async function entries(bucket: R2Bucket, prefix: string, re: RegExp): Promise<Record<string, ManifestEntry>> {
  const out: Record<string, ManifestEntry> = {};
  for (const o of await listAll(bucket, prefix, { metadata: true })) {
    const m = re.exec(o.key);
    if (!m || !isPoemId(m[1])) continue;
    let version = parseInt(o.customMetadata?.version ?? '', 10);
    let updatedAt = o.customMetadata?.updatedAt || null;
    if (!Number.isInteger(version)) {
      // written by hand, without metadata — read the header from the body
      const doc = await readJson<{ version?: number; updatedAt?: string }>(bucket, o.key);
      version = doc?.value.version ?? 1;
      updatedAt = doc?.value.updatedAt ?? null;
    }
    out[m[1]!] = { version, updatedAt };
  }
  return out;
}

export async function buildManifest(bucket: R2Bucket): Promise<Manifest> {
  const [poemsMap, qiraatMap] = await Promise.all([
    entries(bucket, 'data/poem/', /^data\/poem\/([^/]+)\.json$/),
    entries(bucket, 'data/qiraat/', /^data\/qiraat\/([^/.]+)\.json$/),
  ]);
  const all = [...Object.values(poemsMap), ...Object.values(qiraatMap)];
  return {
    ok: true,
    version: all.reduce((s, e) => s + e.version, 0),
    updatedAt: all.map((e) => e.updatedAt).filter(Boolean).sort().pop() ?? null,
    poems: poemsMap,
    qiraat: qiraatMap,
  };
}

poems.get('/manifest', (c) =>
  edgeCached(c.executionCtx, c.req.raw, 10, async () => {
    try {
      return c.json(await buildManifest(c.env.STORE), 200, { 'Cache-Control': 'public, max-age=0' });
    } catch {
      // An unreachable store must never break a page: an empty manifest simply
      // means "nothing newer than your snapshot".
      const empty: Manifest = { ok: true, version: 0, updatedAt: null, poems: {}, qiraat: {}, source: 'unavailable' };
      return c.json(empty, 200, { 'Cache-Control': 'no-store' });
    }
  }));

async function readPoem(bucket: R2Bucket, id: string) {
  const stored = await readJson<PoemDoc>(bucket, poemKey(id));
  if (!stored || !Array.isArray(stored.value.chapters)) return null;
  /* Every read, not just the reading pages': the editors read through here
     too, so a bayt saved afterwards writes the cleaned text back. */
  stripPoemTeX(stored.value);
  return stored;
}

/* data.js — the verse data as a classic, blocking <script> that defines
   window.ASL_CH before the reading page's renderer runs. The page (and every
   feature that walks the rendered verses) depends on the poem being in the DOM
   by DOMContentLoaded, so the data cannot arrive asynchronously. Same-origin
   so the service worker can keep it for offline. */
const JS = { 'Content-Type': 'application/javascript; charset=utf-8' };
poems.get('/poems/:id/data.js', async (c) => {
  const id = c.req.param('id');
  if (!isPoemId(id)) return c.body('/* unknown matn */', 404, JS);
  return edgeCached(c.executionCtx, c.req.raw, 10, async () => {
    try {
      const stored = await readPoem(c.env.STORE, id);
      if (!stored) return c.body('/* matn not stored yet */', 404, { ...JS, 'Cache-Control': 'no-store' });
      /* Stored text is plain; the joiners that keep a word whole across a
         ramz's <span> are added on the way to the page. */
      const doc = weldPoemDoc(stored.value);
      const body = 'window.ASL_CH=' + JSON.stringify(doc.chapters)
        + ';window.ASL_CH_V=' + (doc.version || 1)
        + ';window.ASL_VARIANTS=' + JSON.stringify(doc.variants ?? null) + ';';
      return c.body(body, 200, { ...JS, 'Cache-Control': 'public, max-age=0' });
    } catch {
      return c.body('/* storage error */', 502, { ...JS, 'Cache-Control': 'no-store' });
    }
  });
});

/* The document itself, explicitly uncacheable: the editors save against the
   version they loaded, so they must always read the true current one. Plain
   by default — the editors want the text as stored. With ?weld=1 it matches
   data.js, which is what the page's live patching compares against. */
poems.get('/poems/:id', async (c) => {
  const id = c.req.param('id');
  if (!isPoemId(id)) return c.json({ error: 'Unknown matn' }, 400);
  try {
    const stored = await readPoem(c.env.STORE, id);
    if (!stored) return c.json({ error: 'Not stored yet', id }, 404, { 'Cache-Control': 'no-store' });
    if (c.req.query('weld')) weldPoemDoc(stored.value);
    return c.json(stored.value, 200, { 'Cache-Control': 'no-store, max-age=0' });
  } catch {
    return c.json({ error: 'Storage error' }, 502);
  }
});

function afterPoemWrite(c: { executionCtx: Waiter; req: { url: string }; env: AppEnv['Bindings'] }, id: string, backedUp: boolean) {
  purgeCached(c.executionCtx, c.req.url, ['/api/manifest', `/api/poems/${id}/data.js`]);
  if (backedUp) c.executionCtx.waitUntil(pruneBackups(c.env.STORE, `data/backup/poem-${id}-v`, BACKUPS_KEPT));
}

/* ── merge ────────────────────────────────────────────────────────────────
   body {baseVersion, bayts:[{n, sadr, ajuz, sadrW, ajuzW, tr?, ur?, exp?, expBy?}]}
   A bayt carrying only prose (tr/ur/exp/expBy) and no hemistichs is a
   prose-only patch: the verse text is left exactly as stored. 409 when
   baseVersion is stale or someone else saved in between. */
poems.put('/poems/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!isPoemId(id)) return c.json({ error: 'Unknown matn' }, 400);
  let body: { baseVersion?: number | string | null; bayts?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Bad JSON' }, 400); }
  const bayts = Array.isArray(body?.bayts) ? body.bayts : null;
  if (!bayts || !bayts.length) return c.json({ error: 'Missing "bayts" array' }, 400);

  let stored;
  try { stored = await readJson<PoemDoc>(c.env.STORE, poemKey(id)); }
  catch { return c.json({ error: 'Storage error reading the matn' }, 502); }
  if (!stored || !Array.isArray(stored.value.chapters))
    return c.json({ error: `${id} is not stored yet — import it first (/admin/import)` }, 404);
  const doc = stored.value;

  const current = doc.version ?? 1;
  if (body.baseVersion != null && Number(body.baseVersion) !== current)
    return c.json({ error: 'Stale version — reload and reapply', version: current, yours: body.baseVersion }, 409);

  const { doc: merged, applied, skipped, problems } = mergeBayts(doc, bayts);
  if (problems.length) return c.json({ error: 'Validation failed', problems }, 422);
  const structural = validatePoemDoc(merged);
  if (structural.length) return c.json({ error: 'Validation failed', problems: structural }, 422);
  if (!applied.length) return c.json({ ok: true, version: current, applied: [], skipped, note: 'no changes' });

  merged.version = current + 1;
  merged.updatedAt = nowIso();
  delete merged.source;

  try {
    // Back up what is about to be replaced, then swap — only if nobody wrote in between.
    await writeJson(c.env.STORE, backupKey(id, current), doc);
    const put = await writeJson(c.env.STORE, poemKey(id), merged, { ifEtag: stored.etag, meta: versionMeta(merged) });
    if (!put) return c.json({ error: 'Someone else saved this matn a moment ago — reload and reapply', version: current }, 409);
    afterPoemWrite(c, id, true);
    return c.json({ ok: true, poem: id, version: merged.version, applied, skipped });
  } catch (e) {
    return c.json({ error: 'Storage error: ' + ((e as Error)?.message || 'unknown') }, 500);
  }
});

/* ── create / replace ─────────────────────────────────────────────────────
   The merge path can only rewrite verses that are already stored, so on its
   own it could never introduce a matn. This takes the whole document, which
   is what the importer produces. The id must be registered: the registry
   declares the verse count the upload is checked against.

   Replacing an existing document is refused unless asked for (&overwrite=1):
   overwriting a thousand verses is not something to do by accident. When it
   is asked for, the old copy is backed up and the version carries on climbing
   — restarting at 1 would leave every reader holding a higher version
   convinced they were up to date. */
poems.put('/poems/:id/document', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!isPoemId(id)) return c.json({ error: 'Unknown matn — register it in src/poems/registry.ts first' }, 400);
  let payload: { doc?: unknown } & Record<string, unknown>;
  try { payload = await c.req.json(); } catch { return c.json({ error: 'Bad JSON' }, 400); }
  const incoming = (payload && typeof payload.doc === 'object' && payload.doc ? payload.doc : payload) as Partial<PoemDoc>;
  if (!incoming || !Array.isArray(incoming.chapters) || !incoming.chapters.length)
    return c.json({ error: 'Missing "chapters" — send the whole document as {doc:{chapters:[…]}}' }, 400);

  const doc: PoemDoc = { ...(incoming as PoemDoc), id, version: 1, updatedAt: nowIso() };
  delete doc.source;

  /* Structural first (verse count, duplicates — the headline when a parse has
     gone wrong), then every verse against the same rules the merge enforces,
     so create can never store markup that an edit would have refused. */
  const problems = validatePoemDoc(doc);
  const verses = versesOf(doc.chapters);
  for (const v of verses) problems.push(...validateBayt(v));
  if (problems.length)
    return c.json({ error: 'Validation failed', problems: problems.slice(0, 50), problemCount: problems.length }, 422);

  let existing;
  try { existing = await readJson<PoemDoc>(c.env.STORE, poemKey(id)); }
  catch { return c.json({ error: 'Storage error reading the matn' }, 502); }
  if (existing && !c.req.query('overwrite')) {
    const v = existing.value.version || 1;
    return c.json({ error: `${id} is already stored (version ${v}) — add &overwrite=1 to replace it`, version: v }, 409);
  }
  if (existing) doc.version = (existing.value.version || 1) + 1;

  try {
    if (existing) await writeJson(c.env.STORE, backupKey(id, existing.value.version || 1), existing.value);
    const put = await writeJson(c.env.STORE, poemKey(id), doc, { ifEtag: existing?.etag, meta: versionMeta(doc) });
    if (!put) return c.json({ error: 'The stored copy changed while importing — try again' }, 409);
    afterPoemWrite(c, id, !!existing);
    return c.json({
      ok: true, poem: id, version: doc.version, created: !existing, replaced: !!existing,
      verses: verses.length, chapters: doc.chapters.length,
    });
  } catch (e) {
    return c.json({ error: 'Storage error: ' + ((e as Error)?.message || 'unknown') }, 500);
  }
});
