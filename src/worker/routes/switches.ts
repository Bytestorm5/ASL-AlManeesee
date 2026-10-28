/* Per-bayt visibility switches for what sits under a verse — one document per
   matn (switches/<id>.json) holding three sparse maps:

     enabled   {bayt:true}  explanation panel SHOWN    (missing = hidden)
     trHidden  {bayt:true}  English translation HIDDEN  (missing = shown)
     urHidden  {bayt:true}  Urdu translation HIDDEN     (missing = shown)

   The explanation switch is an accuracy gate — commentary stays out of sight
   until it has been checked — so it defaults off, unless the matn registers
   its explanations as already checked (explanations.defaultOn). Translations
   are finished work, so theirs defaults on: absence must never take one off
   the page. Only the exceptions are stored.

   GET /api/switches/:id   → {ok, poem, enabled, trHidden, urHidden, source}   public
   PUT /api/switches/:id   → body {enabled?, trHidden?, urHidden?}             gated
       Only the maps actually sent are replaced, so the content editor can save
       one track without having to hold the other two. */
import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { requireAdmin } from '../auth.ts';
import { readJson, writeJson } from '../store.ts';
import { explanationBayts, getPoem } from '../../poems/index.ts';
import type { PoemConfig, Switches } from '../../poems/types.ts';

export const switches = new Hono<AppEnv>();

export const switchesKey = (id: string) => `switches/${id}.json`;

/** Full map with every explanation-bearing bayt present, the stored value where set. */
function normalize(stored: Partial<Switches> | null | undefined, bayts: number[]): Record<string, boolean> {
  const src = (stored && typeof stored.enabled === 'object' && stored.enabled) || {};
  const enabled: Record<string, boolean> = {};
  for (const n of bayts) enabled[n] = src[n] === true;
  return enabled;
}
/* The hidden maps stay sparse: a bayt is listed only when it is switched OFF,
   so the absence of the whole map means "everything shows", which is what an
   unreachable store and a never-touched matn must both come out as. */
function sparse(src: unknown, max: number): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!src || typeof src !== 'object') return out;
  for (const [k, v] of Object.entries(src)) {
    if (v !== true) continue;
    const n = parseInt(k, 10);
    if (n >= 1 && n <= max) out[n] = true;
  }
  return out;
}
/** First-time defaults: per the matn's registration, nothing hidden. */
function seed(p: PoemConfig): Switches {
  const enabled: Record<string, boolean> = {};
  for (const n of explanationBayts(p)) enabled[n] = p.explanations?.defaultOn === true;
  return { enabled, trHidden: {}, urHidden: {} };
}

switches.get('/switches/:id', async (c) => {
  const p = getPoem(c.req.param('id'));
  if (!p) return c.json({ error: 'Unknown matn' }, 400);
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const stored = await readJson<Partial<Switches>>(c.env.STORE, switchesKey(p.id));
    if (stored) {
      return c.json({
        ok: true, poem: p.id, source: 'stored',
        enabled: normalize(stored.value, explanationBayts(p)),
        trHidden: sparse(stored.value.trHidden, p.verses),
        urHidden: sparse(stored.value.urHidden, p.verses),
      }, 200, headers);
    }
  } catch { /* fall through to the defaults */ }
  /* Nothing stored, or it could not be read: answer with the defaults and
     write nothing. A GET must never be able to lose data; the document is
     created by the first PUT. */
  return c.json({ ok: true, poem: p.id, source: 'default', ...seed(p) }, 200, headers);
});

switches.put('/switches/:id', requireAdmin, async (c) => {
  const p = getPoem(c.req.param('id'));
  if (!p) return c.json({ error: 'Unknown matn' }, 400);
  let body: Partial<Record<keyof Switches, unknown>>;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Bad JSON' }, 400); }
  const has = (k: keyof Switches) => !!body && typeof body[k] === 'object' && body[k] !== null;
  if (!has('enabled') && !has('trHidden') && !has('urHidden'))
    return c.json({ error: 'Send at least one of "enabled", "trHidden", "urHidden"' }, 400);

  /* Whichever maps were not sent keep what is stored. The content editor
     shows one track at a time and only ever holds that one, so a save must not
     be able to wipe the other two by omission. */
  let stored = null;
  try { stored = await readJson<Partial<Switches>>(c.env.STORE, switchesKey(p.id)); } catch { /* treated as absent */ }
  const current = stored?.value ?? seed(p);
  const bayts = explanationBayts(p);

  const maps: Switches = {
    enabled: normalize(current, bayts),
    trHidden: has('trHidden') ? sparse(body.trHidden, p.verses) : sparse(current.trHidden, p.verses),
    urHidden: has('urHidden') ? sparse(body.urHidden, p.verses) : sparse(current.urHidden, p.verses),
  };
  if (has('enabled')) {
    const sent = body.enabled as Record<string, unknown>;
    for (const n of bayts) maps.enabled[n] = sent[n] === true || sent[String(n)] === true;
  }
  const on = Object.values(maps.enabled).filter(Boolean).length;

  try {
    await writeJson(c.env.STORE, switchesKey(p.id), { poem: p.id, updatedAt: new Date().toISOString(), ...maps });
    return c.json({
      ok: true, poem: p.id, ...maps, count: bayts.length, on,
      hidden: { tr: Object.keys(maps.trHidden).length, ur: Object.keys(maps.urHidden).length },
    });
  } catch (e) {
    return c.json({ error: 'Storage error: ' + ((e as Error)?.message || 'unknown') }, 500);
  }
});
