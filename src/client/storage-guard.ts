/* Guards for browser settings the app cannot change itself.
   Two of them, each detected and explained rather than silently endured: the
   storage guard below, and the viewport guard at the foot of the file.

   Storage. Bookmarks, notes and memorization live in localStorage. This module:
     1. When storage works — asks the browser to keep it durable
        (navigator.storage.persist) so progress isn't evicted later.
     2. When storage is blocked (Private/Incognito, "block site data",
        or an in-app browser like Instagram/Facebook/WhatsApp) — shows a
        gentle, dismissible notice telling the user how to enable saving.
        The web platform has no API to *grant* storage from a prompt, so the
        best we can do is detect it and guide them to the right setting. */
import { siteHost } from '../config/site.ts';
import { esc } from './page.ts';

export function init(): void {
  storageGuard();
  viewportGuard();
}

function storageWorks(): boolean {
  try {
    const k = '__asl_ls_probe__';
    localStorage.setItem(k, '1');
    const ok = localStorage.getItem(k) === '1';
    localStorage.removeItem(k);
    return ok;
  } catch { return false; }
}

function storageGuard(): void {
  if (storageWorks()) {
    // Storage is fine — request durable storage so bookmarks/notes survive
    // eviction under storage pressure. No prompt in Chrome; silent if refused.
    try {
      const st = navigator.storage;
      if (st && typeof st.persist === 'function' && typeof st.persisted === 'function') {
        st.persisted().then((p) => {
          if (!p) st.persist().catch(() => { /* refused */ });
        }).catch(() => { /* ignore */ });
      }
    } catch { /* ignore */ }
    return;
  }

  // ---- storage is blocked: guide the user ----
  // Only relevant where there's something to save (the reading pages).
  if (!document.querySelector('.verses, .chapter, .verse')) return;
  if (window.__aslStorageNotice) return;
  window.__aslStorageNotice = true;
  try { if (sessionStorage.getItem('asl-sg-dismissed') === '1') return; } catch { /* ignore */ }

  const ua = navigator.userAgent || '';
  const inApp = /(FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|WhatsApp|Telegram|TikTok|Snapchat|Pinterest|MicroMessenger|GSA\/|; wv\))/i.test(ua);

  const body = inApp
    ? 'Saving is turned off in this in-app browser, so your <b>bookmarks, notes and memorization won’t be saved</b>. Open this page in your normal browser (Chrome or Safari) — use this app’s ⋯ menu and choose “Open in browser” — or install the app to keep your progress.'
    : 'Your browser is blocking storage, so your <b>bookmarks, notes and memorization won’t be saved</b>. If you’re in Private/Incognito mode, switch to a normal window; otherwise allow site data for ' + esc(siteHost()) + '. Installing the app also keeps your progress.';

  const css = [
    '.aslsg{position:relative;margin:12px 14px 4px;padding:12px 40px 12px 14px;border-radius:12px;',
    'background:var(--surface,#fff);border:1px solid var(--paper-edge,#e8dcc7);border-left:3px solid var(--madder,#8a4447);',
    'box-shadow:var(--shadow,0 4px 16px rgba(58,28,31,.08));font-family:"Montserrat",sans-serif;',
    'color:var(--ink-soft,#6c585a);font-size:.8rem;line-height:1.55;display:flex;gap:10px;align-items:flex-start}',
    '.aslsg .ic{flex:0 0 auto;color:var(--madder,#8a4447);margin-top:1px}',
    '.aslsg .ic svg{width:18px;height:18px;display:block}',
    '.aslsg b{color:var(--madder,#8a4447);font-weight:700}',
    '.aslsg .x{position:absolute;top:7px;right:7px;width:26px;height:26px;border:0;background:transparent;',
    'color:var(--sage,#9c7f80);cursor:pointer;border-radius:50%;font-size:1rem;line-height:1;-webkit-tap-highlight-color:transparent}',
    '.aslsg .x:hover{background:var(--paper,#f7f2e5);color:var(--madder,#8a4447)}',
  ].join('');
  const st = document.createElement('style');
  st.appendChild(document.createTextNode(css));
  document.head.appendChild(st);

  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>';
  const bar = document.createElement('div');
  bar.className = 'aslsg';
  bar.setAttribute('role', 'note');
  bar.innerHTML = '<span class="ic">' + ICON + '</span><div>' + body + '</div>' +
    '<button type="button" class="x" aria-label="Dismiss">✕</button>';

  function mount(): void {
    const main = document.querySelector('main') || document.body;
    main.insertBefore(bar, main.firstChild);
    bar.querySelector('.x')?.addEventListener('click', () => {
      bar.remove();
      try { sessionStorage.setItem('asl-sg-dismissed', '1'); } catch { /* ignore */ }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
}

/* ---------------------------------------------------------------- viewport
   "The app suddenly looks like the website." What has happened is that Chrome
   is set to request desktop sites for this origin, so it ignores the page's
   width=device-width and lays it out at about 980 CSS px, then scales the
   result down to fit. On the phone this was written for, a 364px-wide screen
   was being handed a 980px layout: every measurement rendered at rather more
   than a third of its intended size, and 16px body text arrived as six pixels
   of screen.

   Nothing in our CSS can undo that — the breakpoints can be taught to ignore
   the false width, and have been, but the shrinking happens above them. The
   setting lives in Chrome against the origin, which is also why uninstalling
   the app never helps: our app is not where it is stored. So the honest thing
   is to say what has happened and where the switch is, rather than let a
   reader assume the app has broken.

   The test is deliberately loose. Desktop mode overshoots by about 2.7x here;
   a genuine browser window is never wider than the screen it sits in, and
   pinch-zoom moves the visual viewport rather than this one. */
function viewportGuard(): void {
  const ready = (fn: () => void): void => {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  };

  const screenW = window.screen?.width || 0;
  if (!screenW || !window.innerWidth) return;
  if (window.innerWidth <= screenW * 1.4) return; // laid out at a sane width
  if (window.__aslViewportNotice) return;
  window.__aslViewportNotice = true;
  try { if (sessionStorage.getItem('asl-vp-dismissed') === '1') return; } catch { /* ignore */ }

  const times = (window.innerWidth / screenW).toFixed(1);
  const body = 'Everything on this screen is about <b>' + times + '× smaller than it should be</b>. ' +
    'Your browser is set to request the desktop version of this site, so it is laying the page out ' +
    'for a screen far wider than this one. That setting is stored by Chrome against this site, not by ' +
    'the app — which is why reinstalling does not clear it. ' +
    '<a href="/layout-check">How to turn it off →</a>';

  const css = [
    '.aslvp{position:relative;margin:12px 14px 4px;padding:12px 40px 12px 14px;border-radius:12px;',
    'background:var(--surface,#fff);border:1px solid var(--paper-edge,#e8dcc7);border-left:3px solid var(--gilt,#c0973c);',
    'box-shadow:var(--shadow,0 4px 16px rgba(58,28,31,.08));font-family:"Montserrat",sans-serif;',
    'color:var(--ink-soft,#6c585a);font-size:.8rem;line-height:1.55;display:flex;gap:10px;align-items:flex-start}',
    '.aslvp .ic{flex:0 0 auto;color:var(--gilt,#c0973c);margin-top:1px}',
    '.aslvp .ic svg{width:18px;height:18px;display:block}',
    '.aslvp b{color:var(--madder,#8a4447);font-weight:700}',
    '.aslvp a{color:var(--madder,#8a4447);font-weight:700;white-space:nowrap}',
    '.aslvp .x{position:absolute;top:7px;right:7px;width:26px;height:26px;border:0;background:transparent;',
    'color:var(--sage,#9c7f80);cursor:pointer;border-radius:50%;font-size:1rem;line-height:1;-webkit-tap-highlight-color:transparent}',
    '@media print{.aslvp{display:none!important}}',
  ].join('');
  const st = document.createElement('style');
  st.appendChild(document.createTextNode(css));
  document.head.appendChild(st);

  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>';
  const bar = document.createElement('div');
  bar.className = 'aslvp';
  bar.setAttribute('role', 'note');
  bar.innerHTML = '<span class="ic">' + ICON + '</span><div>' + body + '</div>' +
    '<button type="button" class="x" aria-label="Dismiss">✕</button>';

  ready(() => {
    // Not on the check page itself, which explains all of this at length.
    if (/layout-check/.test(location.pathname)) return;
    const main = document.querySelector('main') || document.body;
    main.insertBefore(bar, main.firstChild);
    bar.querySelector('.x')?.addEventListener('click', () => {
      bar.remove();
      try { sessionStorage.setItem('asl-vp-dismissed', '1'); } catch { /* ignore */ }
    });
  });
}
