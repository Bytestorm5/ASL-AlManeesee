/* Small helpers every page script uses: which matn this page is, links
   between pages, DOM readiness, and storage that never throws. */
import { getPoem, POEMS } from '../poems/index.ts';
import type { PoemConfig } from '../poems/types.ts';

/** The matn this page reads (from <body data-poem>), or null off the reading pages. */
export function currentPoemId(): string | null {
  return document.body?.dataset.poem || null;
}
export function currentPoem(): PoemConfig | null {
  return getPoem(currentPoemId()) ?? null;
}

/** The reading page of a matn, with optional query parameters (mode, goto, …). */
export function poemHref(id: string, params?: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return '/' + id + (s ? '?' + s : '');
}

/** The mutūn readers are offered, in registry order. */
export function listedPoems(): readonly PoemConfig[] {
  return POEMS;
}

export function ready(fn: () => void): void {
  if (document.readyState !== 'loading') fn();
  else document.addEventListener('DOMContentLoaded', fn);
}

export function lsGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
export function lsSet(k: string, v: string): void {
  try { localStorage.setItem(k, v); } catch { /* storage blocked — the storage guard explains */ }
}
export function lsRemove(k: string): void {
  try { localStorage.removeItem(k); } catch { /* ignore */ }
}
export function lsJSON<T>(k: string): T | null {
  try { return JSON.parse(localStorage.getItem(k) || 'null') as T | null; } catch { return null; }
}

/** Escape text for inclusion in HTML (text or a double-quoted attribute). */
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** True when the site runs as the installed app (TWA, PWA, the iOS shell). */
export function isAppMode(): boolean {
  let app = matchMedia('(display-mode: standalone)').matches
    || matchMedia('(display-mode: fullscreen)').matches
    || matchMedia('(display-mode: minimal-ui)').matches
    || navigator.standalone === true
    || (document.referrer || '').indexOf('android-app://') === 0
    || /[?&](appmode=1|source=(twa|pwa|ios))/.test(location.search);
  // Sticky for the session: the android-app:// referrer only appears on the
  // first screen, and some devices never report display-mode:standalone.
  try {
    if (app) sessionStorage.setItem('asl-app', '1');
    else if (sessionStorage.getItem('asl-app') === '1') app = true;
  } catch { /* ignore */ }
  return app;
}

/* ── bayt numbers ────────────────────────────────────────────────────────
   A bayt's stored number `n` is its identity: bookmarks, notes, memorization,
   recordings and the content switches all key on it. The medallion carries it
   in data-n; what it SHOWS is the label below, which for a matn numbered
   per chapter (PoemConfig.numbering) restarts at 1 in every chapter. Read the
   number with verseNum(), never from the medallion's text. */

/** The bayt a medallion (.vn) stands for, NaN when there is none. */
export function verseNum(vn: Element | null | undefined): number {
  if (!vn) return NaN;
  return parseInt((vn.getAttribute('data-n') ?? vn.textContent ?? '').trim(), 10);
}

/** First bayt and Arabic title of each chapter, in order: from the verse data
    on the matn's own page, otherwise from the index render.ts leaves in
    storage (asl-chidx-<id>) for pages that have no verse data. */
function chapterStarts(id: string): [number, string][] {
  const ch = currentPoemId() === id && Array.isArray(window.ASL_CH) ? window.ASL_CH : null;
  if (ch) return ch.filter((c) => c.verses[0]).map((c) => [c.verses[0]!.n, c.ar]);
  const idx = lsJSON<[number, string][]>('asl-chidx-' + id);
  return Array.isArray(idx) ? idx : [];
}

function locate(id: string | null, n: number): { k: number; ar: string } | null {
  const p = getPoem(id);
  if (!id || !p || p.numbering !== 'per-chapter' || !Number.isFinite(n)) return null;
  let hit: [number, string] | undefined;
  for (const s of chapterStarts(id)) { if (s[0] <= n) hit = s; else break; }
  return hit ? { k: n - hit[0] + 1, ar: hit[1] } : null;
}

/** The number a reader sees for bayt n: n itself, or its place in its chapter. */
export function baytLabel(id: string | null, n: number): string {
  const at = locate(id, n);
  return String(at ? at.k : n);
}

/** "Bayt 12", or "Bayt 3 · <chapter>" when numbering restarts per chapter (plain text). */
export function baytRef(id: string | null, n: number): string {
  const at = locate(id, n);
  return at ? 'Bayt ' + at.k + ' · ' + at.ar.replace(/<[^>]*>/g, '') : 'Bayt ' + n;
}
