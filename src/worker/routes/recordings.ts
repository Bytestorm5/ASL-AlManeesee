/* Recitations: uploads, the public per-matn audio manifest, the reciter
   registry and the file manager. Every recording is stored in R2 under
   mutun/<set>/<bayt>/<reciter>/<timestamp>.<ext> and played from /media/.

   GET    /api/audio/:set                         → {ok, poem, reciters:[{id,name,abyat,urls,bytes}]}  public
   GET    /api/recordings?poem=<set>&reciter=     → {ok, next, populated}   first bayt this reciter lacks
   POST   /api/recordings?poem=&bayt=&reciter=&ext=&mime=   raw audio body → {ok, key, url, size}
   GET    /api/files?prefix=mutun/<set>/          → {ok, files:[{key,url,size,uploadedAt}]}
   DELETE /api/files       body {keys:[…]}        → {ok, deleted}
   GET    /api/reciters                           → {ok, reciters:[{id,name}], source}
   PUT    /api/reciters    body {reciters:[…]}    → {ok, reciters}
   Everything but the audio manifest needs the admin password. */
import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { requireAdmin } from '../auth.ts';
import { edgeCached, listAll, purgeCached, readJson, writeJson } from '../store.ts';
import { getAudioSet } from '../../poems/index.ts';
import type { AudioManifest, AudioReciter, Reciter } from '../../poems/types.ts';
import {
  MAX_UPLOAD_BYTES, RECITERS_KEY, RECORDINGS_PREFIX, extOk, mediaUrl, mimeOk, parseRecordingKey,
  recordingKey, slug,
} from '../../shared/media.ts';

export const recordings = new Hono<AppEnv>();

async function readReciters(bucket: R2Bucket): Promise<{ reciters: Reciter[]; source: 'stored' | 'default' }> {
  const stored = await readJson<{ reciters?: Reciter[] }>(bucket, RECITERS_KEY);
  if (!stored) return { reciters: [], source: 'default' };
  return { reciters: Array.isArray(stored.value.reciters) ? stored.value.reciters : [], source: 'stored' };
}

/* ── public audio manifest ────────────────────────────────────────────────
   For each reciter/bayt the NEWEST upload wins, so a re-recorded bayt
   replaces the old one without any cleanup. Briefly edge-cached so fresh
   uploads appear within a minute. */
recordings.get('/audio/:set', (c) => {
  const set = getAudioSet(c.req.param('set'));
  if (!set) return c.json({ error: 'Unknown matn' }, 400);
  return edgeCached(c.executionCtx, c.req.raw, 60, async () => {
    try {
      const best = new Map<string, { key: string; at: number; file: string; reciter: string; bayt: number; size: number }>();
      for (const o of await listAll(c.env.STORE, `${RECORDINGS_PREFIX}${set.id}/`)) {
        const p = parseRecordingKey(o.key);
        if (!p) continue;
        const k = p.reciter + '|' + p.bayt;
        const at = o.uploaded.getTime();
        const cur = best.get(k);
        // the filename is a timestamp, so it breaks a tie in upload time
        if (!cur || at > cur.at || (at === cur.at && p.file > cur.file))
          best.set(k, { key: o.key, at, file: p.file, reciter: p.reciter, bayt: p.bayt, size: o.size });
      }
      const names: Record<string, string> = {};
      try { for (const r of (await readReciters(c.env.STORE)).reciters) names[r.id] = r.name || r.id; } catch { /* ids will do */ }

      const byReciter = new Map<string, AudioReciter>();
      for (const v of best.values()) {
        let r = byReciter.get(v.reciter);
        if (!r) { r = { id: v.reciter, name: names[v.reciter] || v.reciter, abyat: [], urls: {}, bytes: 0 }; byReciter.set(v.reciter, r); }
        r.abyat.push(v.bayt);
        r.urls[v.bayt] = mediaUrl(v.key);
        r.bytes += v.size;
      }
      const reciters = [...byReciter.values()];
      for (const r of reciters) r.abyat.sort((a, b) => a - b);
      reciters.sort((a, b) => b.abyat.length - a.abyat.length);
      const body: AudioManifest = { ok: true, poem: set.id, reciters };
      return c.json(body, 200, { 'Cache-Control': 'public, max-age=0' });
    } catch (e) {
      return c.json({ error: 'Storage error: ' + ((e as Error)?.message || 'unknown') }, 500);
    }
  });
});

/* ── uploads ─────────────────────────────────────────────────────────────── */
recordings.get('/recordings', requireAdmin, async (c) => {
  const set = getAudioSet(c.req.query('poem'));
  if (!c.req.query('poem')) return c.json({ ok: true });            // password probe
  if (!set) return c.json({ error: 'Unknown matn' }, 400);
  const reciter = slug(c.req.query('reciter'));
  try {
    const have = new Set<number>();
    for (const o of await listAll(c.env.STORE, `${RECORDINGS_PREFIX}${set.id}/`)) {
      const p = parseRecordingKey(o.key);
      if (p && (!reciter || p.reciter === reciter)) have.add(p.bayt);
    }
    // `next` is per reciter, so a second voice starting over is not sent to the end of the matn
    let next = 1;
    while (have.has(next)) next++;
    if (next > set.poem.verses) next = set.poem.verses;
    return c.json({ ok: true, next, populated: have.size });
  } catch {
    return c.json({ ok: true, next: null, populated: null });
  }
});

recordings.post('/recordings', requireAdmin, async (c) => {
  const q = c.req.query();
  const set = getAudioSet(q.poem);
  if (!set) return c.json({ error: 'Unknown matn' }, 400);
  const max = set.poem.verses;
  const bayt = parseInt(String(q.bayt ?? ''), 10);
  if (!bayt || bayt < 1 || bayt > max) return c.json({ error: `Bayt must be 1–${max} for this matn` }, 400);
  const reciter = slug(q.reciter);
  if (!reciter) return c.json({ error: 'Missing reciter' }, 400);
  const ext = extOk(q.ext);
  if (!ext) return c.json({ error: 'Unsupported audio format — send MP3, M4A/AAC, MP4 (audio), WAV, OGG/Opus, WebM or FLAC' }, 415);

  const declared = parseInt(c.req.header('content-length') || '', 10);
  if (declared && declared > MAX_UPLOAD_BYTES) return c.json({ error: 'File too large (max 25 MB)' }, 413);
  let body: ArrayBuffer;
  try { body = await c.req.arrayBuffer(); } catch { return c.json({ error: 'Could not read upload' }, 400); }
  if (!body.byteLength) return c.json({ error: 'Empty upload' }, 400);
  if (body.byteLength > MAX_UPLOAD_BYTES) return c.json({ error: 'File too large (max 25 MB)' }, 413);
  // A dropped connection can end the stream "normally" — never store half a file as a success.
  if (declared && declared !== body.byteLength)
    return c.json({ error: `Upload incomplete (${body.byteLength} of ${declared} bytes arrived) — try again` }, 400);

  const key = recordingKey(set.id, bayt, reciter, ext);
  try {
    await c.env.STORE.put(key, body, { httpMetadata: { contentType: mimeOk(q.mime, ext) } });
    purgeCached(c.executionCtx, c.req.url, [`/api/audio/${set.id}`]);
    return c.json({ ok: true, key, url: mediaUrl(key), size: body.byteLength });
  } catch (e) {
    return c.json({ error: 'Storage error: ' + ((e as Error)?.message || 'unknown') }, 500);
  }
});

/* ── file manager ────────────────────────────────────────────────────────
   Confined to the mutun/ prefix; the reciter registry is not a recording and
   is never listed or deleted here. */
recordings.get('/files', requireAdmin, async (c) => {
  let prefix = String(c.req.query('prefix') || RECORDINGS_PREFIX);
  if (!prefix.startsWith(RECORDINGS_PREFIX)) prefix = RECORDINGS_PREFIX; // never escape the namespace
  try {
    const files = (await listAll(c.env.STORE, prefix, { max: 5000 }))
      .filter((o) => o.key !== RECITERS_KEY)
      .map((o) => ({ key: o.key, url: mediaUrl(o.key), size: o.size, uploadedAt: o.uploaded.toISOString() }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return c.json({ ok: true, files });
  } catch (e) {
    return c.json({ error: 'Storage error: ' + ((e as Error)?.message || 'unknown') }, 500);
  }
});

recordings.delete('/files', requireAdmin, async (c) => {
  let body: { keys?: unknown; key?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Bad JSON' }, 400); }
  const raw = Array.isArray(body?.keys) ? body.keys : body?.key ? [body.key] : [];
  const keys = raw.filter((k): k is string => typeof k === 'string' && !!parseRecordingKey(k));
  if (!keys.length) return c.json({ error: 'No valid recording keys to delete' }, 400);
  try {
    await c.env.STORE.delete(keys);
    const sets = [...new Set(keys.map((k) => parseRecordingKey(k)!.set))];
    purgeCached(c.executionCtx, c.req.url, sets.map((s) => `/api/audio/${s}`));
    return c.json({ ok: true, deleted: keys.length });
  } catch (e) {
    return c.json({ error: 'Storage error: ' + ((e as Error)?.message || 'unknown') }, 500);
  }
});

/* ── reciter registry ─────────────────────────────────────────────────── */
function cleanReciters(input: unknown): Reciter[] {
  const out: Reciter[] = [], seen = new Set<string>();
  for (const r of Array.isArray(input) ? input : []) {
    const rec = (r && typeof r === 'object' ? r : {}) as Partial<Reciter>;
    const id = slug(rec.id || rec.name);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: String(rec.name || '').trim().slice(0, 80) || id });
  }
  return out;
}

recordings.get('/reciters', requireAdmin, async (c) => {
  try { return c.json({ ok: true, ...(await readReciters(c.env.STORE)) }); }
  catch { return c.json({ ok: true, reciters: [], source: 'default' }); }
});

recordings.put('/reciters', requireAdmin, async (c) => {
  let body: { reciters?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Bad JSON' }, 400); }
  const reciters = cleanReciters(body?.reciters);
  if (!reciters.length) return c.json({ error: 'At least one reciter is required' }, 400);
  try {
    await writeJson(c.env.STORE, RECITERS_KEY, { reciters });
    return c.json({ ok: true, reciters });
  } catch (e) {
    return c.json({ error: 'Storage error: ' + ((e as Error)?.message || 'unknown') }, 500);
  }
});
