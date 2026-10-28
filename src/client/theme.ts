/* Appearance (light / dark) controller.
   mode is one of: 'auto' (follow the device), 'light', 'dark'.

   The current mode is held in memory as the source of truth, so toggling
   always works even when localStorage is unavailable (blocked storage,
   some WebView / Custom-Tab / privacy configs). localStorage is used only
   for best-effort persistence across launches. The <html data-theme>
   attribute is what theme.css keys off; bootTheme (src/client/boot.ts),
   inlined in every page's <head>, sets it before first paint to avoid a
   flash, and this module keeps it in sync and exposes window.AppTheme for
   the in-app toggle. */
import { SITE } from '../config/site.ts';

type Mode = 'auto' | 'light' | 'dark';
const KEY = 'asl-theme';

export function init(): void {
  const mq = typeof window.matchMedia === 'function' ? matchMedia('(prefers-color-scheme:dark)') : null;

  // In-memory source of truth — seeded from storage once, then never re-read
  // for decisions (so a blocked/throwing localStorage can't override intent).
  let current: Mode = 'auto';
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'light' || s === 'dark' || s === 'auto') current = s;
  } catch { /* storage blocked — stay on auto */ }

  function mode(): Mode { return current; }
  function resolved(m?: string): 'light' | 'dark' {
    const v = m || current;
    return v === 'dark' || (v !== 'light' && mq && mq.matches) ? 'dark' : 'light';
  }
  function paintMeta(dark: boolean): void {
    const el = document.querySelector('meta[name="theme-color"]');
    if (el) el.setAttribute('content', dark ? SITE.theme.colorDark : SITE.theme.color);
  }
  function apply(): void {
    const d = resolved();
    document.documentElement.setAttribute('data-theme', d);
    paintMeta(d === 'dark');
  }
  function set(m: Mode): void {
    current = m; // update memory first — theming must work even if storage fails
    try {
      if (m === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, m);
    } catch { /* not persisted, still applied */ }
    apply();
    try {
      document.dispatchEvent(new CustomEvent('asl-theme-changed', { detail: { mode: current, resolved: resolved() } }));
    } catch { /* ignore */ }
  }

  // React to the device switching light/dark while we're set to Auto.
  if (mq) {
    const onSys = (): void => { if (current === 'auto') apply(); };
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onSys);
    else if (typeof mq.addListener === 'function') mq.addListener(onSys);
  }

  apply();
  window.AppTheme = { mode, resolved, set, apply };
}
