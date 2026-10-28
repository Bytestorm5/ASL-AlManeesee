/* Keeps a reading page's verse data fresh without ever getting in the way of
   showing the matn.

   The page renders from data.js — a blocking same-origin script — at once.
   Afterwards, idle, this asks for the tiny manifest of dataset versions. Only
   if storage holds a NEWER version than the page loaded does it fetch the
   document, and even then it does not re-render: it patches just the verses
   whose text actually changed, straight into the DOM.

     · first paint never waits on the network;
     · with no connection (or nothing imported yet) nothing happens at all;
     · an edit made in the Bayt Editor shows up on the next visit — or on this
       one, silently, a moment after load.

   If the chapter structure itself changed (a verse added or renumbered)
   patching is unsafe, so it offers a reload instead.

   Also provides the qirāʾāt fetchers the panel uses, so the heavy dataset is
   pulled only on demand. */
import type { AslPoemContext } from '../globals.d.ts';
import { getManifest, getPoemDoc, getQiraat, getQiraatIndex } from '../api.ts';
import type { Chapter, Manifest, Verse } from '../../poems/types.ts';
import { versesOf } from '../../shared/poem-data.ts';
import { lsGet, lsSet } from '../page.ts';
import { hemiHTML } from './render.ts';

/* An edit should reach a reader with the page open, or an app opened from
   cache, the same day. The manifest is a few hundred bytes and edge-cached,
   so asking often costs nothing. */
const CHECK_EVERY_MS = 10 * 60 * 1000; // at most one manifest check per 10 min per tab
const MEM: { manifest?: Promise<Manifest | null>; qx: Record<string, Promise<Record<string, unknown[]> | null>>; qi: Record<string, Promise<number[] | null>> } = { qx: {}, qi: {} };

function idle(fn: () => void): void {
  if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 4000 });
  else setTimeout(fn, 1200);
}

export function manifest(): Promise<Manifest | null> {
  MEM.manifest ??= getManifest().catch(() => null);
  return MEM.manifest;
}

function byNumber(chapters: Chapter[]): Record<string, Verse> {
  const m: Record<string, Verse> = {};
  for (const v of versesOf(chapters)) m[v.n] = v;
  return m;
}

function sameVerse(a: Verse, b: Verse): boolean {
  return a.sadr === b.sadr && a.ajuz === b.ajuz && (a.tr || '') === (b.tr || '') && (a.ur || '') === (b.ur || '')
    && JSON.stringify(a.sadrW || null) === JSON.stringify(b.sadrW || null)
    && JSON.stringify(a.ajuzW || null) === JSON.stringify(b.ajuzW || null);
}

/* Replace a hemistich and drop the font-size fitted to the text it held: that
   size belongs to a particular string. The 'asl-verse-patched' listeners then
   re-fit, which catches a patch LONGER than before. */
function refit(h: HTMLElement, html: string): void {
  h.innerHTML = html;
  h.style.fontSize = '';
}

/** Apply fresh data over what is on screen. */
export function applyUpdate(oldChapters: Chapter[], newChapters: Chapter[], opts: { onPatched?: (n: number[]) => void } = {}) {
  const oldBy = byNumber(oldChapters), newBy = byNumber(newChapters);
  const oldNums = Object.keys(oldBy), newNums = Object.keys(newBy);
  // Verses added/removed/renumbered → the rendered structure no longer lines up.
  if (oldNums.length !== newNums.length || newNums.some((n) => !oldBy[n])) return { patched: [] as number[], structural: true };

  const changed = newNums.filter((n) => !sameVerse(oldBy[n]!, newBy[n]!));
  const patched: number[] = [];
  for (const n of changed) {
    const v = newBy[n]!;
    let el: HTMLElement | null = null;
    for (const vn of document.querySelectorAll('.verse .medallion .vn')) {
      if ((vn.textContent || '').trim() === String(n)) { el = vn.closest('.verse'); break; }
    }
    if (!el) continue;
    const sadr = el.querySelector<HTMLElement>('.hemi.sadr'), ajuz = el.querySelector<HTMLElement>('.hemi.ajuz');
    // Memorize mode owns the hemistich while it is active — leave it be.
    if (sadr && !sadr._mzTok) refit(sadr, hemiHTML(v.sadrW, v.sadr, v.sr));
    if (ajuz && !ajuz._mzTok) refit(ajuz, hemiHTML(v.ajuzW, v.ajuz, v.jr));
    const tr = el.querySelector('.translation .tr-text');
    if (tr && v.tr != null) tr.textContent = v.tr;
    const ur = el.querySelector('.translation-ur .tr-text');
    if (ur && v.ur != null) ur.textContent = v.ur;
    // keep the in-memory copy in step so later features read fresh text
    Object.assign(oldBy[n]!, v);
    patched.push(Number(n));
    el.dispatchEvent(new CustomEvent('asl-verse-patched', { bubbles: true }));
  }
  if (patched.length) opts.onPatched?.(patched);
  return { patched, structural: false };
}

/* The verse data arrives as a blocking script. If that failed — first visit
   while offline, nothing imported yet, or the store is down — say so plainly
   rather than render an empty page. */
function showDataMissing(): void {
  const main = document.getElementById('main');
  if (!main || document.getElementById('asl-data-missing')) return;
  const d = document.createElement('div');
  d.id = 'asl-data-missing';
  d.className = 'matn-missing';
  const offline = !navigator.onLine;
  d.innerHTML = '<h2>The text could not be loaded</h2>'
    + (offline
      ? '<p>Connect to the internet once and it will be saved for offline reading.</p>'
      : '<p>If this matn has just been added, its text may not have been imported yet.</p>')
    + '<p><button type="button" class="mr-btn">Try again</button></p>';
  d.querySelector('button')!.addEventListener('click', () => location.reload());
  main.appendChild(d);
}

/** Default handling for a structural change: offer a reload, never force one. */
function reloadNudge(): void {
  if (document.getElementById('asl-data-nudge')) return;
  const b = document.createElement('button');
  b.id = 'asl-data-nudge';
  b.type = 'button';
  b.textContent = 'Updated text available — tap to refresh';
  b.setAttribute('style', 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom));'
    + 'z-index:9999;border:0;border-radius:999px;padding:10px 18px;cursor:pointer;font:600 .85rem/1.2 -apple-system,'
    + 'BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#8a4447;color:#fff;box-shadow:0 6px 20px rgba(94,44,48,.28)');
  b.onclick = () => location.reload();
  document.body.appendChild(b);
}

export function boot(cfg: AslPoemContext): void {
  if (!cfg || !cfg.poem || !Array.isArray(cfg.snapshot)) return;
  if (!cfg.snapshot.length) { showDataMissing(); return; }
  const have = Number(cfg.snapshotVersion || 1);
  const stamp = 'asl-datachk-' + cfg.poem;
  idle(() => {
    const last = Number(lsGet(stamp) || 0);
    if (Date.now() - last < CHECK_EVERY_MS) return;
    manifest().then((m) => {
      lsSet(stamp, String(Date.now()));
      const entry = m?.poems?.[cfg.poem];
      if (!entry || !(Number(entry.version) > have)) return; // snapshot is current
      /* weld=1: the page's copy came from data.js, which welds the cursive
         joins a ramz's <span> would break; read raw, every verse carrying a
         ramz would count as changed and be re-patched on every check. */
      return getPoemDoc(cfg.poem, true).then((doc) => {
        if (!doc || !Array.isArray(doc.chapters)) return;
        const r = applyUpdate(cfg.snapshot, doc.chapters, { onPatched: cfg.onPatched });
        if (r.structural) (cfg.onStructuralChange ?? reloadNudge)(doc);
      });
    }).catch(() => { /* offline / not imported / bad payload — keep the snapshot */ });
  });
}

/** The whole qirāʾāt dataset for a matn, or null when it cannot be had. */
export function fetchQiraat(poem: string): Promise<Record<string, unknown[]> | null> {
  MEM.qx[poem] ??= getQiraat(poem).then((d) => (d?.examples as Record<string, unknown[]>) || null).catch(() => null);
  return MEM.qx[poem]!;
}
/** The bayts that have a panel, so buttons can be drawn without the dataset. */
export function fetchQiraatIndex(poem: string): Promise<number[] | null> {
  MEM.qi[poem] ??= getQiraatIndex(poem).then((d) => d?.bayts || null).catch(() => null);
  return MEM.qi[poem]!;
}

export function init(): void {
  window.ASLData = { boot, manifest, fetchQiraat, fetchQiraatIndex };
  if (window.ASL_POEM) boot(window.ASL_POEM);
}
