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
