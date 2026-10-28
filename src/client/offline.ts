/* Offline recitations manager.
   The app text, translations, fonts and UI are precached automatically by the
   service worker, so the mutūn open with no connection out of the box. The
   recitation audio is NOT precached — it is an opt-in download so installs stay
   small and users choose whether to store it.

   The recordings live in R2 and are enumerated per recording set by the audio
   manifest (/api/audio/<set>), exactly as the player (reading/audio.ts) does.
   The sets are every listed matn's (src/poems/registry.ts) — one per edition —
   plus, on a reading page, the matn being read even while it is a draft, so
   the recitations a reader is playing can always be kept.

   The URL cached for a bayt must be the URL the player will later ask for, so
   srcFor() below mirrors the player's own resolution: the same-origin /media/
   URL the manifest names. The service worker (src/sw/sw.ts) serves it back
   from the audio cache when offline. */
import type { AslOfflineApi, AslOfflineStatus } from './globals.d.ts';
import { getAudioManifest } from './api.ts';
import { audioSetsOf, type AudioSet } from '../poems/index.ts';
import type { AudioManifest } from '../poems/types.ts';
import { currentPoem, listedPoems, lsGet, lsSet } from './page.ts';

const AUDIO_CACHE = 'asl-audio';

/** The recording sets this page offers, in registry order. */
function audioSets(): AudioSet[] {
  const poems = [...listedPoems()];
  const here = currentPoem();
  if (here && !poems.some((p) => p.id === here.id)) poems.push(here);
  return poems.flatMap(audioSetsOf);
}

interface Entry { poem: string; url: string; bytes: number }

// The manifest's URL for that bayt: anything else would cache a URL nobody requests.
function srcFor(n: number, urls: Record<string, string> | undefined): string | null {
  return (urls && urls[n]) || null;
}

function entriesFrom(set: string, data: AudioManifest | null): Entry[] {
  const out: Entry[] = [];
  if (!data) return out;
  for (const r of data.reciters || []) {
    if (!r || !r.id || !Array.isArray(r.abyat)) continue;
    // Spread the reciter total evenly so a per-file estimate exists without a
    // HEAD request per bayt.
    const per = r.abyat.length && r.bytes ? r.bytes / r.abyat.length : 0;
    for (const n of r.abyat) {
      const url = srcFor(n, r.urls);
      if (url) out.push({ poem: set, url, bytes: per });
    }
  }
  return out;
}

// `fromApi` is reported back because pruning is only safe against a complete
// list — see pruneOrphans.
function entriesForSet(set: string): Promise<{ entries: Entry[]; fromApi: boolean }> {
  return getAudioManifest(set)
    .then((d) => ({ entries: entriesFrom(set, d), fromApi: true }))
    .catch(() => ({ entries: [] as Entry[], fromApi: false }));
}

let entriesMemo: Entry[] | null = null;
let allFromApi = false;
function collectEntries(): Promise<Entry[]> {
  if (entriesMemo) return Promise.resolve(entriesMemo);
  return Promise.all(audioSets().map((s) => entriesForSet(s.id))).then((results) => {
    const seen = new Set<string>(), all: Entry[] = [];
    for (const res of results) {
      for (const e of res.entries) {
        if (seen.has(e.url)) continue;        // a bayt shared by two manifests counts once
        seen.add(e.url); all.push(e);
      }
    }
    allFromApi = results.every((r) => r.fromApi);
    // Only a complete answer is kept for the page; a set that could not be
    // reached is asked again next time.
    if (allFromApi) entriesMemo = all;
    return all;
  });
}

// Keyed by absolute URL, as the Cache API stores them.
function cachedSet(): Promise<Set<string>> {
  return caches.open(AUDIO_CACHE)
    .then((c) => c.keys())
    .then((keys) => new Set(keys.map((req) => new URL(req.url, location.href).href)))
    .catch(() => new Set<string>());
}
function abs(u: string): string { return new URL(u, location.href).href; }

function status(poems?: string[]): Promise<AslOfflineStatus> {
  return Promise.all([collectEntries(), cachedSet()]).then(([all, have]) => {
    let es = all;
    if (poems && poems.length) es = es.filter((e) => poems.includes(e.poem));
    let cached = 0, bytes = 0, bytesLeft = 0;
    const byPoem: Record<string, AslOfflineStatus['poems'][number]> = {};
    const labels = new Map(audioSets().map((s) => [s.id, s.label]));
    for (const e of es) {
      const got = have.has(abs(e.url));
      if (got) cached++; else bytesLeft += e.bytes;
      bytes += e.bytes;
      const p = byPoem[e.poem] ??= { poem: e.poem, name: labels.get(e.poem) || e.poem, total: 0, cached: 0, bytes: 0 };
      p.total++; p.bytes += e.bytes; if (got) p.cached++;
    }
    return {
      total: es.length, cached, bytes, bytesLeft,
      complete: es.length > 0 && cached === es.length,
      poems: audioSets().map((s) => byPoem[s.id]).filter((p): p is NonNullable<typeof p> => !!p),
    };
  });
}

// ---- download with bounded concurrency + progress ----
let abort = false;
function download(onProgress?: (done: number, total: number, failed?: number) => void, poems?: string[] | null) {
  abort = false;
  return Promise.all([collectEntries(), caches.open(AUDIO_CACHE), cachedSet()])
    .then(([all, cache, have]) => {
      let es = all;
      if (poems && poems.length) es = es.filter((e) => poems.includes(e.poem));
      const urls = es.map((e) => e.url);
      const todo = urls.filter((u) => !have.has(abs(u)));
      let done = urls.length - todo.length, failed = 0, i = 0;
      const CONC = 6;
      const total = urls.length;
      onProgress?.(done, total, failed);
      const next = (): Promise<void> => {
        if (abort || i >= todo.length) return Promise.resolve();
        const u = todo[i++]!;
        return fetch(u, { cache: 'reload' })
          .then((res) => { if (res && res.ok) return cache.put(u, res.clone()); throw new Error('HTTP ' + res.status); })
          .catch(() => { failed++; })
          .then(() => { done++; onProgress?.(done, total, failed); return next(); });
      };
      const runners: Promise<void>[] = [];
      for (let k = 0; k < CONC; k++) runners.push(next());
      return Promise.all(runners).then(() => ({ total, cached: done - failed, failed, aborted: abort }));
    });
}
function cancel(): void { abort = true; }
function remove(): Promise<boolean> { return caches.delete(AUDIO_CACHE); }

/* One-time tidy-up of recordings the inventory no longer lists — a bayt since
   re-recorded under a new key, or a recording deleted in the file manager —
   which would otherwise sit in the cache doing nothing.

   Two guards, because this deletes things:
     · only when every set's list came from the API. If that route was
       unreachable the list is short, and pruning against it would delete
       perfectly good recordings.
     · only when the cache is non-empty, so a fresh install never pays for
       the manifest requests just to discover there is nothing to clean. */
const PRUNE_KEY = 'asl-offline-pruned-1';
function pruneOrphans(): Promise<number> {
  if (lsGet(PRUNE_KEY) === '1') return Promise.resolve(0);
  return caches.open(AUDIO_CACHE)
    .then((c) => c.keys().then((keys) => ({ c, keys })))
    .then((o) => {
      if (!o.keys.length) {                      // nothing saved — nothing to prune
        lsSet(PRUNE_KEY, '1');
        return 0;
      }
      return collectEntries().then((es) => {
        if (!allFromApi) return 0;               // try again on a later launch
        const keep = new Set(es.map((e) => abs(e.url)));
        const dead = o.keys.filter((r) => !keep.has(abs(r.url)));
        return Promise.all(dead.map((r) => o.c.delete(r))).then(() => {
          lsSet(PRUNE_KEY, '1');
          return dead.length;
        });
      });
    })
    .catch(() => 0);
}

/* ---- the "Listen offline" panel ----
   Opened from the app's ⋯ More menu, never planted on Home: the home screen
   belongs to Continue reading, the stats strip and the mutūn. The per-matn
   rows live here because the full set can run past 150 MB and nobody should be
   handed that behind one unlabelled button. */
const CSS = [
  '.asloff-ov{position:fixed;inset:0;z-index:430;background:rgba(58,42,43,.5);display:grid;place-items:center;padding:18px}',
  '.asloff{width:100%;max-width:430px;max-height:86vh;overflow:auto;padding:18px 18px 16px;border-radius:16px;',
  'background:var(--surface,#fffdf8);border:1px solid var(--paper-edge,#e8dcc7);',
  'box-shadow:0 18px 50px rgba(0,0,0,.3);font-family:"Montserrat",system-ui,sans-serif}',
  '.asloff-h{display:flex;align-items:center;gap:10px;margin-bottom:6px}',
  '.asloff-h .ic{flex:0 0 auto;color:var(--madder,#8a4447);display:grid;place-items:center}',
  '.asloff-h .ic svg{width:20px;height:20px}',
  '.asloff-t{font-weight:700;font-size:.98rem;color:var(--ink,#3a2a2b)}',
  '.asloff-d{font-size:.82rem;color:var(--ink-soft,#6c585a);line-height:1.5;margin:0 0 12px}',
  '.asloff-d b{color:var(--madder,#8a4447)}',
  '.asloff-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}',
  '.asloff-btn{cursor:pointer;border:0;border-radius:22px;padding:9px 18px;font:inherit;font-weight:600;',
  'font-size:.85rem;background:var(--madder,#8a4447);color:#fff;-webkit-tap-highlight-color:transparent}',
  '.asloff-btn[disabled]{opacity:.6;cursor:default}',
  '.asloff-btn.ghost{background:transparent;color:var(--madder,#8a4447);border:1px solid var(--paper-edge,#e8dcc7);padding:8px 15px}',
  '.asloff-link{cursor:pointer;background:0;border:0;font:inherit;font-size:.8rem;color:var(--sage,#9c7f80);text-decoration:underline;padding:4px}',
  '.asloff-prog{flex:1 1 160px;min-width:120px;height:8px;border-radius:6px;background:var(--paper-2,#f1e7d6);overflow:hidden}',
  '.asloff-prog i{display:block;height:100%;width:0;background:var(--madder,#8a4447);transition:width .2s ease}',
  '.asloff-count{font-size:.78rem;color:var(--ink-soft,#6c585a);font-variant-numeric:tabular-nums;white-space:nowrap}',
  '.asloff-ok{color:var(--sage,#6f7d5f);font-weight:700}',
  '.asloff-matn{margin:0 0 12px}',
  '.asloff-mrow{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid var(--paper-edge,#e8dcc7)}',
  '.asloff-mrow:first-child{border-top:0}',
  '.asloff-mn{flex:1 1 auto;min-width:0;font-size:.86rem;font-weight:600;color:var(--ink,#3a2a2b);',
  'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.asloff-ms{flex:0 0 auto;font-size:.74rem;color:var(--sage,#9c7f80);font-variant-numeric:tabular-nums}',
  '.asloff-mrow .asloff-btn{padding:5px 12px;font-size:.76rem}',
  'html[data-theme="dark"] .asloff{background:#241f1b;border-color:#3a322a}',
  'html[data-theme="dark"] .asloff-prog{background:#33291f}',
  'html[data-theme="dark"] .asloff-mrow{border-top-color:#3a322a}',
].join('');
let cssDone = false;
function injectCss(): void {
  if (cssDone) return; cssDone = true;
  const s = document.createElement('style');
  s.appendChild(document.createTextNode(CSS));
  document.head.appendChild(s);
}

const DL_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';
function fmtMB(b: number): string { return (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB'; }
const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function open(): HTMLElement {
  injectCss();
  const ov = document.createElement('div');
  ov.className = 'asloff-ov';
  const card = document.createElement('section');
  card.className = 'asloff';
  ov.appendChild(card);
  document.body.appendChild(ov);

  const close = () => { ov.remove(); };
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);

  const draw = (s: AslOfflineStatus) => {
    const head = '<div class="asloff-h"><span class="ic">' + DL_IC + '</span>'
      + '<span class="asloff-t">Listen offline</span></div>';
    if (!s.total) {
      card.innerHTML = head + '<p class="asloff-d">No recitations are available to download yet.</p>'
        + '<div class="asloff-row"><button type="button" class="asloff-btn" data-act="close">Close</button></div>';
      return;
    }
    if (s.complete) {
      card.innerHTML = head + '<p class="asloff-d"><b>Every recitation is saved</b> on this device — '
        + s.total.toLocaleString() + ' of them. They stay saved when the app updates.</p>'
        + '<div class="asloff-row"><button type="button" class="asloff-btn ghost" data-act="remove">Delete downloads</button>'
        + '<button type="button" class="asloff-btn" data-act="close">Close</button></div>';
      return;
    }
    const size = s.bytesLeft ? ' · about ' + fmtMB(s.bytesLeft) + ' still to save' : '';
    const rows = (s.poems || []).filter((p) => p.total).map((p) => {
      const whole = p.cached === p.total;
      return '<div class="asloff-mrow"><span class="asloff-mn">' + escHtml(p.name) + '</span>'
        + '<span class="asloff-ms">' + (whole ? 'saved' : p.total + ' · ' + fmtMB(p.bytes)) + '</span>'
        + (whole ? '<span class="asloff-ok">✓</span>'
          : '<button type="button" class="asloff-btn ghost" data-act="download" data-poem="' + escHtml(p.poem) + '">Save</button>')
        + '</div>';
    }).join('');
    card.innerHTML = head
      + '<p class="asloff-d">Save the recitations to this device so you can <b>listen without a connection</b>. '
      + '<b>' + s.total.toLocaleString() + '</b> recitations' + size + '.</p>'
      + '<div class="asloff-matn">' + rows + '</div>'
      + '<div class="asloff-row">'
      + '<button type="button" class="asloff-btn" data-act="download">' + (s.cached > 0 ? 'Resume all' : 'Save all') + '</button>'
      + '<button type="button" class="asloff-btn ghost" data-act="close">Close</button>'
      + (s.cached > 0 ? '<span class="asloff-count">' + s.cached + ' / ' + s.total + ' saved</span>' : '')
      + '</div>';
  };
  const redraw = () => { void status().then(draw); };

  card.innerHTML = '<p class="asloff-d">Checking what is available…</p>';
  redraw();

  card.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.('[data-act]');
    if (!el) return;
    const act = el.getAttribute('data-act');
    if (act === 'close') { close(); return; }
    if (act === 'remove') { void remove().then(redraw); return; }
    if (act === 'cancel') { cancel(); setTimeout(redraw, 200); return; }
    if (act === 'download') {
      const only = el.getAttribute('data-poem');
      const row = card.querySelector('.asloff-row');
      if (row) {
        row.innerHTML = '<span class="asloff-prog"><i></i></span><span class="asloff-count">0 / …</span>'
          + '<button type="button" class="asloff-link" data-act="cancel">Cancel</button>';
      }
      const bar = card.querySelector<HTMLElement>('.asloff-prog i'), cnt = card.querySelector('.asloff-count');
      void download((done, total, failed) => {
        if (bar) bar.style.width = (total ? Math.round(done / total * 100) : 0) + '%';
        if (cnt) cnt.textContent = done + ' / ' + total + (failed ? ' (' + failed + ' failed)' : '');
      }, only ? [only] : null).then(redraw);
    }
  });
  return ov;
}

export function init(): void {
  if (!('caches' in window) || !('serviceWorker' in navigator)) return;
  const api: AslOfflineApi = { status, download, cancel, remove, prune: pruneOrphans, open };
  window.AslOffline = api;

  // Runs wherever this module loads, not just on Home, so the tidy-up happens
  // on whichever page the app is reopened to after updating. Guarded above, so
  // it is a single cache-keys read on every launch after the first.
  void pruneOrphans();
}
