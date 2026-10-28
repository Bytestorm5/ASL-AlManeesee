/* Qirāʾāt panels — the cards the mushaf button opens under a bayt, for a matn
   registered with `qiraat: true`.

   GET /api/qiraat/:id          → the whole dataset, no-store (editor + panel)
   GET /api/qiraat/:id/index    → {id, version, bayts:[…]} — which bayts get a button
   PUT /api/qiraat/:id          → body {baseVersion, cards:{<bayt>:[card]|null}}

   Same contract as a verse save — a partial patch, optimistic concurrency,
   a backup of what is replaced — but keyed by bayt, since a bayt's panel is a
   whole list of cards replaced as a unit. The first save creates the dataset. */
import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { requireAdmin } from '../auth.ts';
import { edgeCached, pruneBackups, purgeCached, readJson, writeJson } from '../store.ts';
import { getPoem } from '../../poems/index.ts';
import type { QiraatDoc, QiraatIndex } from '../../poems/types.ts';
import {
  BACKUPS_KEPT, mergeQiraatCards, nowIso, qiraatBackupKey, qiraatIndexDoc, qiraatIndexKey, qiraatKey,
} from '../../shared/poem-data.ts';

export const qiraat = new Hono<AppEnv>();

const qiraatPoem = (id: string) => { const p = getPoem(id); return p && p.qiraat ? p : null; };

qiraat.get('/qiraat/:id', async (c) => {
  const id = c.req.param('id');
  if (!qiraatPoem(id)) return c.json({ error: 'This matn has no qirāʾāt panels' }, 400);
  const stored = await readJson<QiraatDoc>(c.env.STORE, qiraatKey(id));
  if (!stored) return c.json({ error: 'Not stored yet', id }, 404, { 'Cache-Control': 'no-store' });
  return c.json(stored.value, 200, { 'Cache-Control': 'no-store, max-age=0' });
});

qiraat.get('/qiraat/:id/index', (c) => {
  const id = c.req.param('id');
  if (!qiraatPoem(id)) return c.json({ error: 'This matn has no qirāʾāt panels' }, 400);
  return edgeCached(c.executionCtx, c.req.raw, 10, async () => {
    const stored = await readJson<QiraatIndex>(c.env.STORE, qiraatIndexKey(id));
    const empty: QiraatIndex = { id, version: 0, updatedAt: null, bayts: [] };
    return c.json(stored?.value ?? empty, 200, { 'Cache-Control': 'public, max-age=0' });
  });
});

qiraat.put('/qiraat/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const p = qiraatPoem(id);
  if (!p) return c.json({ error: 'This matn has no qirāʾāt panels' }, 400);
  let body: { baseVersion?: number | string | null; cards?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Bad JSON' }, 400); }
  const cards = body && typeof body.cards === 'object' && body.cards !== null && !Array.isArray(body.cards)
    ? (body.cards as Record<string, unknown>) : null;
  if (!cards || !Object.keys(cards).length) return c.json({ error: 'Missing "cards" map' }, 400);

  let stored;
  try { stored = await readJson<QiraatDoc>(c.env.STORE, qiraatKey(id)); }
  catch { return c.json({ error: 'Storage error reading qirāʾāt' }, 502); }
  const qdoc: QiraatDoc = stored?.value ?? { id, version: 0, updatedAt: null, examples: {} };

  const current = qdoc.version || 0;
  if (body.baseVersion != null && Number(body.baseVersion) !== current)
    return c.json({ error: 'Stale version — reload and reapply', version: current, yours: body.baseVersion }, 409);

  const merged = mergeQiraatCards(qdoc, cards, p.verses);
  if (merged.problems.length) return c.json({ error: 'Validation failed', problems: merged.problems.slice(0, 50) }, 422);
  if (!merged.applied.length && !merged.removed.length)
    return c.json({ ok: true, poem: id, version: current, applied: [], removed: [], skipped: merged.skipped, note: 'no changes' });

  const next = merged.doc;
  next.id = id;
  next.version = current + 1;
  next.updatedAt = nowIso();

  try {
    if (stored) await writeJson(c.env.STORE, qiraatBackupKey(id, current), qdoc);
    const put = await writeJson(c.env.STORE, qiraatKey(id), next, {
      ifEtag: stored?.etag,
      meta: { version: String(next.version), updatedAt: next.updatedAt ?? '' },
    });
    if (!put) return c.json({ error: 'Someone else saved a moment ago — reload and reapply' }, 409);
    // The index is derived — rewritten from the merged document every time.
    await writeJson(c.env.STORE, qiraatIndexKey(id), qiraatIndexDoc(next));
    purgeCached(c.executionCtx, c.req.url, ['/api/manifest', `/api/qiraat/${id}/index`]);
    if (stored) c.executionCtx.waitUntil(pruneBackups(c.env.STORE, `data/backup/qiraat-${id}-v`, BACKUPS_KEPT));
    return c.json({
      ok: true, poem: id, version: next.version,
      applied: merged.applied, removed: merged.removed, skipped: merged.skipped,
      bayts: Object.keys(next.examples || {}).length,
    });
  } catch (e) {
    return c.json({ error: 'Storage error: ' + ((e as Error)?.message || 'unknown') }, 500);
  }
});
