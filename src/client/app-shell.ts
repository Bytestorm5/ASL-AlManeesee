/* App-mode shell.
   Runs ONLY when the site is launched as an installed app (display-mode:
   standalone / TWA). In a normal browser it does nothing, so the website is
   unchanged. It hides web chrome (site header, back link, footer) and adds an
   app-style top bar + bottom tab navigation. */
import { SITE } from '../config/site.ts';
import { getPoem } from '../poems/index.ts';
import type { AslOfflineStatus } from './globals.d.ts';
import { currentPoemId, esc, isAppMode, listedPoems, poemHref } from './page.ts';

/** Where "Send feedback" and "Email the developer" write to. */
const CONTACT_EMAIL = SITE.org.email;

interface MatnTab { id: string; ar: string; en: string; n: string }

/** The element an event came from, or its nearest ancestor matching `sel`. */
function closest(e: Event, sel: string): HTMLElement | null {
  const t = e.target;
  return t instanceof Element ? (t.closest(sel) as HTMLElement | null) : null;
}

export function init(): void {
  try {
    // isAppMode() makes app mode sticky for the whole session: the
    // android-app:// referrer only appears on the first screen, and some
    // devices (Custom Tab fallback) don't report display-mode:standalone — so
    // it is remembered and internal navigations stay in app mode.
    if (!isAppMode()) return;
    shell();
  } catch { /* never break the page */ }
}

function shell(): void {
  // The native iOS/Android wrappers each pass an explicit ?source= marker on their
  // very first load (source=ios, source=twa) — trust that over UA-sniffing, since the
  // iOS wrapper is a plain WKWebView whose user agent can't always be relied on to
  // contain "iPhone"/"iPad" (e.g. if Apple changes WKWebView's default UA behavior).
  // Sticky across internal navigation the same way app mode is, since the marker is only
  // present on the wrapper's start URL, not on links clicked within the site.
  const srcMatch = /[?&]source=(ios|twa)/.exec(location.search);
  let wrapperSource: string | null = srcMatch ? srcMatch[1]! : null;
  try {
    if (wrapperSource) sessionStorage.setItem('asl-src', wrapperSource);
    else wrapperSource = sessionStorage.getItem('asl-src');
  } catch { /* ignore */ }

  // Recitations now run past a hundred megabytes, so the menu says how much
  // is still to come rather than offering an unlabelled download.
  function offlineLabel(s: AslOfflineStatus): string {
    const mb = s.bytesLeft ? ' (' + (s.bytesLeft / 1048576).toFixed(s.bytesLeft < 10485760 ? 1 : 0) + ' MB)' : '';
    return (s.cached > 0 ? '⤓ Resume download' : '⤓ Download recitations') + mb;
  }
  document.documentElement.classList.add('appmode');
  document.body.classList.add('appmode');
  const isHome = !document.querySelector('.navbar'); // reading pages have their own top navbar
  if (isHome) document.body.classList.add('apphome');

  const css = [
    'html.appmode,body.appmode{overscroll-behavior-y:contain}',
    '.appmode .brandbar-wrap,.appmode .backbar,.appmode footer{display:none!important}',
    '.appmode.apphome header.hero,.appmode.apphome #texts,.appmode.apphome .ayah{display:none!important}',
    /* "Your bookmarks" is redundant with the bottom bar's Marginalia tab */
    '.appmode.apphome #bmWrap{display:none!important}',
    /* Home shows only the picked favorite(s), when any are picked */
    '.appmode.apphome .matn-row.fav-hide{display:none!important}',
    '.fav-head{margin:0 2px 10px;font-family:"Montserrat",sans-serif;font-size:.7rem;font-weight:700;',
    'letter-spacing:.12em;text-transform:uppercase;color:var(--madder,#8a4447)}',
    '.appmode.apphome .toc-wrap,.appmode.apphome .section{padding-top:10px}',
    'body.appmode{padding-bottom:calc(58px + env(safe-area-inset-bottom,0px))}',
    '.appmode .navbar{padding-top:calc(env(safe-area-inset-top,0px))}',
    '.appmode:not(.apphome) .totop{bottom:calc(74px + env(safe-area-inset-bottom,0px))!important}',
    /* the bottom bar owns Memorize in the app — drop the top-bar pill */
    '.appmode .navbar .mzbtn{display:none!important}',
    '.appnav .mzcount{position:absolute;top:-6px;right:-12px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;',
    'background:var(--gilt-deep,#c49a3f);color:#fff;font-family:"Montserrat",sans-serif;font-weight:700;font-size:.58rem;',
    'display:none;align-items:center;justify-content:center;line-height:1;box-shadow:0 0 0 2px var(--paper,#f7f2e5)}',
    '.appnav .mzcount.show{display:flex}',
    '.appnav .mzcount.due{background:#a23b3b}',
    /* top app bar (home only) — deep maroon brand plate, continuous with
       the status bar, so it stands apart from the paper content below */
    '.apptop{position:sticky;top:0;z-index:190;display:flex;align-items:center;gap:11px;',
    'padding:calc(env(safe-area-inset-top,0px) + 11px) 16px 11px;',
    'background:radial-gradient(560px 130px at 50% -40%,rgba(255,240,232,.14),transparent 62%),',
    'linear-gradient(160deg,#6e3438,#5e2c30 55%,#4c2427);',
    'box-shadow:0 4px 16px rgba(58,28,31,.24)}',
    '.apptop::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;',
    'background:linear-gradient(90deg,transparent,rgba(230,198,111,.65),transparent)}',
    '.apptop .em{width:30px;height:30px;border-radius:8px;flex:0 0 auto;box-shadow:0 1px 5px rgba(0,0,0,.3)}',
    '.apptop .t{font-family:"Cinzel","Cormorant Garamond",serif;font-weight:700;color:#f3e6da;font-size:1.12rem;letter-spacing:.06em;',
    'text-shadow:0 1px 6px rgba(0,0,0,.25)}',
    /* matn-name bar (reading pages only) — same brand plate as Home's, but
       NOT sticky: .navbar right below it is already sticky, and two sticky
       siblings both pinned to top:0 would stack on top of each other while
       scrolling. This one scrolls away instead, leaving just .navbar's
       compact icon row pinned once you start reading — you see which matn
       you're in whenever you're at the top of the page or jump back to it. */
    '.apptop.apptop-matn{position:static;justify-content:center}',
    '.apptop-matn .apptop-matn-t{font-family:"Cormorant Garamond","Cinzel",serif;font-weight:600;color:#f3e6da;',
    'font-size:1.04rem;text-align:center;text-shadow:0 1px 6px rgba(0,0,0,.25)}',
    '.apptop-matn .apptop-matn-t .ar{font-family:"Scheherazade New","Amiri",serif;font-size:1.3rem;color:#f6d9b8;margin-inline-end:6px}',
    /* bottom navigation */
    '.appnav{position:fixed;left:0;right:0;bottom:0;z-index:200;display:flex;',
    'background:rgba(248,243,233,.98);-webkit-backdrop-filter:saturate(1.2) blur(12px);backdrop-filter:saturate(1.2) blur(12px);',
    'border-top:1px solid #e8dcc7;box-shadow:0 -4px 18px rgba(94,44,48,.08);',
    'padding-bottom:env(safe-area-inset-bottom,0px)}',
    '.appnav a{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;',
    'gap:3px;padding:7px 3px 6px;text-decoration:none;color:#9c7f80;',
    'font-family:"Montserrat",sans-serif;font-size:.64rem;font-weight:600;letter-spacing:.02em;',
    '-webkit-tap-highlight-color:transparent}',
    '.appnav a .ic{height:23px;display:grid;place-items:center;position:relative}',
    '.appnav a .ic svg{width:21px;height:21px}',
    '.appnav a .num{font-family:"Cormorant Garamond",serif;font-weight:700;font-size:1.15rem;line-height:1}',
    '.appnav a .lbl{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.appnav a.active{color:var(--madder,#8a4447)}',
    '.appnav a.active .ic::after{content:"";position:absolute;top:-7px;width:22px;height:3px;border-radius:3px;background:var(--madder,#8a4447)}',
    /* On a tablet flex:1 stretches four tabs to ~340px each, leaving tiny icons
       marooned in huge cells. Keep the bar full width but group the tabs in the
       middle at phone size. Same for the More sheet, which is otherwise a
       1366px-wide slab. It is centered with auto margins, not a transform,
       because enableSheetDrag owns the panel's transform. */
    /* html.bigscreen, not the width alone. Chrome's "Desktop site" makes a
       phone lay the page out at ~980 CSS px and scales it down, so a width
       query on its own reads that phone as a tablet and the whole app comes
       out shrunk — which is what it looks like when a user reports the app
       "turning into the website". The class is set in each page's head (by
       bootLayoutGate in src/client/boot.ts) from the screen's real pixel
       count, which does not move when the layout is rescaled: screen.width
       and devicePixelRatio change inversely, so their product stays the
       physical width. Phones stop at 1440 of those pixels across and tablets
       start at about 1488, so 1460 separates them; a fine pointer takes the
       desktop case, where the screen may be no wider. */
    '@media (min-width:900px){',
    'html.bigscreen .appnav{justify-content:center}',
    'html.bigscreen .appnav a{flex:0 1 150px}',
    'html.bigscreen .appsheet .as-panel{width:min(560px,100%);margin:0 auto}',
    '}',
    /* "More" bottom sheet */
    '.appsheet .as-scrim{position:fixed;inset:0;z-index:220;background:rgba(23,17,15,.45);opacity:0;transition:opacity .22s}',
    '.appsheet.open .as-scrim{opacity:1}',
    '.appsheet .as-panel{position:fixed;left:0;right:0;bottom:0;z-index:221;background:var(--paper,#f7f2e5);',
    'border-radius:18px 18px 0 0;box-shadow:0 -12px 40px rgba(0,0,0,.28);padding:8px 16px calc(14px + env(safe-area-inset-bottom,0px));',
    'transform:translateY(102%);transition:transform .24s ease;max-height:82vh;overflow-y:auto}',
    '.appsheet.open .as-panel{transform:none}',
    /* grip + head double as the drag handle for swipe-down-to-close (see
       enableSheetDrag) — touch-action:none stops the browser's own scroll/
       refresh gestures from fighting the drag. */
    '.appsheet .as-grip{width:38px;height:4px;border-radius:2px;background:#cbb9a4;margin:6px auto 10px;touch-action:none}',
    '.appsheet .as-head{font-family:"Montserrat",sans-serif;font-size:.68rem;font-weight:700;letter-spacing:.14em;',
    'text-transform:uppercase;color:#9c7f80;margin:2px 2px 8px;touch-action:none}',
    '.appsheet .as-row{display:flex;align-items:center;gap:12px;padding:9px 2px;cursor:pointer;',
    'border-top:1px solid rgba(232,220,199,.7);-webkit-tap-highlight-color:transparent}',
    '.appsheet .as-row.on .as-ar{color:var(--madder,#8a4447)}',
    '.appsheet .as-num{flex:0 0 auto;width:26px;height:26px;display:grid;place-items:center;border-radius:50%;',
    'border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447);',
    'font-family:"Cormorant Garamond",serif;font-weight:700;font-size:.95rem}',
    '.appsheet .as-names{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px}',
    '.appsheet .as-ar{font-family:"Scheherazade New","Amiri",serif;font-size:1.06rem;line-height:1.35;color:var(--ink,#2f2320);',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.appsheet .as-en{font-family:"Montserrat",sans-serif;font-size:.62rem;font-weight:600;letter-spacing:.05em;color:#9c7f80}',
    '.appsheet .as-acts{flex:0 0 auto;display:flex;gap:6px}',
    '.appsheet .as-acts button{cursor:pointer;font-family:"Montserrat",sans-serif;font-size:.62rem;font-weight:700;',
    'letter-spacing:.03em;color:var(--madder,#8a4447);background:var(--surface,#fff);border:1px solid var(--paper-edge,#e8dcc7);',
    'border-radius:14px;padding:6px 10px;-webkit-tap-highlight-color:transparent}',
    '.appsheet .as-div{height:1px;background:rgba(232,220,199,.9);margin:6px 0}',
    '.appsheet .as-link{display:block;padding:10px 2px;text-decoration:none;color:var(--ink,#2f2320);',
    'font-family:"Montserrat",sans-serif;font-size:.8rem;font-weight:600}',
    '.appsheet button.as-link{width:100%;text-align:left;border:0;background:transparent;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.appsheet button.as-link:disabled{cursor:default;color:var(--sage,#9c7f80)}',
    '.appsheet .as-theme-wrap{display:flex;align-items:center;gap:10px;padding:6px 2px 2px}',
    '.appsheet .as-theme-lbl{font-family:"Montserrat",sans-serif;font-size:.68rem;font-weight:700;color:#9c7f80}',
    '.appsheet .as-theme{display:flex;gap:5px;margin-left:auto}',
    '.appsheet .as-theme button{cursor:pointer;font-family:"Montserrat",sans-serif;font-size:.62rem;font-weight:700;',
    'color:#9c7f80;background:var(--surface,#fff);border:1px solid var(--paper-edge,#e8dcc7);border-radius:14px;padding:6px 11px}',
    '.appsheet .as-theme button.on{color:#fbeee8;background:var(--madder,#8a4447);border-color:var(--madder,#8a4447)}',
    '.appsheet .as-goal{display:flex;align-items:center;gap:7px;margin-left:auto}',
    '.appsheet .as-goal button{cursor:pointer;width:26px;height:26px;border-radius:50%;',
    'border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447);',
    'font-family:"Montserrat",sans-serif;font-size:1rem;font-weight:700;display:grid;place-items:center;',
    'line-height:1;-webkit-tap-highlight-color:transparent}',
    '.appsheet .as-goal button:disabled{opacity:.35;cursor:default}',
    '.appsheet .as-goal-n{min-width:44px;text-align:center;font-family:"Cormorant Garamond",serif;font-weight:700;',
    'font-size:1rem;color:var(--ink,#2f2320)}',
    '.appsheet .as-goal-n small{font-family:"Montserrat",sans-serif;font-weight:600;font-size:.62rem;color:#9c7f80}',
    '.appsheet .as-goal-sec{padding:8px 2px 2px}',
    '.appsheet .as-goal-sec>.as-theme-lbl{display:block;margin-bottom:4px}',
    '.appsheet .as-goal-row{display:flex;align-items:center;gap:10px;padding:7px 0;',
    'border-top:1px solid rgba(232,220,199,.5)}',
    '.appsheet .as-goal-row:first-of-type{border-top:0}',
    '.appsheet .as-goal-name{flex:1 1 auto;min-width:0;font-family:"Cormorant Garamond",serif;font-weight:600;',
    'font-size:.92rem;color:var(--ink,#2f2320);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    /* ★ favorite toggle in the Collection sheet */
    '.appsheet .as-fav{flex:0 0 auto;cursor:pointer;background:transparent;border:0;padding:2px 4px;',
    'font-size:1.15rem;line-height:1;color:#c9b8a0;-webkit-tap-highlight-color:transparent}',
    '.appsheet .as-fav.on{color:var(--gilt-deep,#c49a3f)}',
    '.appsheet .as-hint{margin:0 2px 6px;font-family:"Montserrat",sans-serif;font-size:.68rem;',
    'color:#9c7f80;line-height:1.5}',
    /* Marginalia sheet — bookmarks & notes across every matn */
    '.appsheet .as-empty{padding:24px 4px 12px;text-align:center;font-family:"Montserrat",sans-serif;font-size:.8rem;',
    'color:#9c7f80;line-height:1.6}',
    '.appsheet .as-marg-row{display:flex;align-items:flex-start;gap:10px;padding:10px 2px;text-decoration:none;',
    'color:var(--ink,#2f2320);border-top:1px solid rgba(232,220,199,.7);-webkit-tap-highlight-color:transparent}',
    '.appsheet .as-marg-ic{flex:0 0 auto;display:flex;gap:4px;color:var(--madder,#8a4447);margin-top:2px}',
    '.appsheet .as-marg-ic svg{width:15px;height:15px}',
    '.appsheet .as-marg-body{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}',
    '.appsheet .as-marg-t{font-family:"Montserrat",sans-serif;font-size:.78rem;font-weight:600}',
    '.appsheet .as-marg-t b{color:var(--madder,#8a4447)}',
    '.appsheet .as-marg-note{font-family:"Montserrat",sans-serif;font-size:.7rem;color:#6c585a;overflow:hidden;',
    'text-overflow:ellipsis;white-space:nowrap}',
    /* Home's "Show me around" — real coach-marks over the actual screen
       (a highlight ring + callout), so the tour can never drift out of
       sync with whatever Home looks like today. */
    '.htour-scrim{position:fixed;inset:0;z-index:520;background:transparent;opacity:0;transition:opacity .25s}',
    '.htour-scrim.show{opacity:1}',
    '.htour-spot{position:fixed;z-index:521;border-radius:14px;box-shadow:0 0 0 9999px rgba(23,17,15,.62);',
    'transition:top .35s ease,left .35s ease,width .35s ease,height .35s ease;pointer-events:none}',
    '.htour-card{position:fixed;z-index:522;width:min(320px,calc(100vw - 32px));background:var(--paper,#f9f4ea);',
    'border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.4);padding:16px 18px;font-family:"Montserrat",sans-serif;',
    'transition:top .3s ease,left .3s ease}',
    '.htour-card h3{font-family:"Cormorant Garamond",Georgia,serif;color:var(--madder,#8a4447);font-size:1.15rem;margin:0 0 6px}',
    '.htour-card p{color:var(--ink-soft,#6c585a);font-size:.82rem;line-height:1.5;margin:0 0 12px}',
    '.htour-foot{display:flex;align-items:center;justify-content:space-between}',
    '.htour-dots{display:flex;gap:6px}',
    '.htour-dots i{width:6px;height:6px;border-radius:50%;background:var(--paper-edge,#e8dcc7)}',
    '.htour-dots i.on{background:var(--madder,#8a4447)}',
    '.htour-skip{background:none;border:0;color:var(--sage,#9c7f80);font-size:.76rem;font-weight:600;cursor:pointer;padding:6px;',
    '-webkit-tap-highlight-color:transparent}',
    '.htour-next{background:var(--madder,#8a4447);color:#fbeee8;border:0;border-radius:20px;padding:8px 16px;',
    'font-size:.78rem;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '@media (prefers-reduced-motion:reduce){.htour-spot,.htour-card{transition:none}}',
  ].join('');
  const st = document.createElement('style');
  st.appendChild(document.createTextNode(css));
  document.head.appendChild(st);

  if (isHome) {
    // Home top bar is a plain brand plate — its own bottom tab bar (built
    // below, once MUTUN/openCollectionSheet/etc. exist) replaces the old
    // top-right ⋯ menu.
    const top = document.createElement('div');
    top.className = 'apptop';
    top.innerHTML = '<img class="em" src="/icon-192.png" alt=""><span class="t">' + esc(SITE.appName) + '</span>';
    document.body.insertBefore(top, document.body.firstChild);
  } else {
    // Reading pages: a name bar so it's always clear which matn you're in —
    // the icon row below it has no room left for a text label. Reuses
    // .nav-brand's own markup (already correct per matn, just hidden on
    // narrow screens) so there's nothing new to keep in sync.
    const navBrand = document.querySelector('.nav-brand');
    if (navBrand) {
      const matnTop = document.createElement('div');
      matnTop.className = 'apptop apptop-matn';
      matnTop.innerHTML = '<span class="apptop-matn-t">' + navBrand.innerHTML + '</span>';
      document.body.insertBefore(matnTop, document.body.firstChild);
    }
  }

  // Store listing links (src/config/site.ts) — used by "Rate on the App
  // Store" and "Share this app". "Share this app" includes whichever are set,
  // and "Rate" routes to the store matching the visitor's platform (and is
  // left out while that store has no listing).
  const PLAY_STORE_URL = SITE.stores.googlePlay;
  const APP_STORE_URL = SITE.stores.appStore;
  // Trust the native wrapper's explicit ?source= marker first; only fall back to
  // UA-sniffing for browser-installed PWAs (Add to Home Screen), where there's no
  // wrapper to supply one.
  const IS_IOS = wrapperSource === 'ios' || (!wrapperSource &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)));
  const RATE_URL = IS_IOS ? APP_STORE_URL : PLAY_STORE_URL;

  // On iOS (the native WKWebView wrapper, and standalone home-screen PWAs),
  // there's no Safari chrome around the app — a plain `<a download>` to a
  // same-origin PDF (the reading page's /pdf/<id>/… downloads) just navigates
  // the whole app into WebKit's built-in PDF viewer, with no visible way back.
  // Hand it to the native share sheet instead (Save to Files, Mail, etc.),
  // which WKWebView supports without any native code changes. Falls through
  // to the normal download on platforms where it already works (Android,
  // desktop, older iOS).
  if (IS_IOS && typeof window.fetch === 'function' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
    let pdfShareBusy = false;
    document.addEventListener('click', (e) => {
      const a = closest(e, 'a[download]');
      if (!a || pdfShareBusy) return;
      const href = a.getAttribute('href') || '';
      if (!/\.pdf($|\?)/i.test(href)) return;
      const url = new URL(href, location.href);
      if (url.origin !== location.origin) return;
      e.preventDefault();
      pdfShareBusy = true;
      const name = url.pathname.split('/').pop() || 'download.pdf';
      const label = a.textContent;
      a.textContent = 'Preparing…';
      fetch(url.href)
        .then((r) => { if (!r.ok) throw new Error('fetch failed'); return r.blob(); })
        .then((blob) => {
          const file = new File([blob], name, { type: 'application/pdf' });
          if (!navigator.canShare({ files: [file] })) throw new Error('cannot share files');
          return navigator.share({ files: [file], title: name });
        })
        .catch((err: unknown) => {
          // User cancelling the share sheet also rejects — that's not a
          // failure, just don't fall back to the broken in-app navigation.
          if (err instanceof Error && err.name === 'AbortError') return;
        })
        .then(() => { a.textContent = label; pdfShareBusy = false; });
    }, true);
  }

  // Fixed four-slot bottom bar that scales to any number of mutūn:
  // Home · Read · Memorize (both open the matn you last used) · More
  // (a sheet listing every matn, the guide and the appearance setting).
  // The mutūn are the registry's listed ones, in its order.
  const MUTUN: MatnTab[] = listedPoems().map((p, i) => ({ id: p.id, ar: p.shortAr, en: p.shortEn, n: String(i + 1) }));
  const HOME_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.7 12 3.5l9 7.2"/><path d="M5.5 9.5V20h13V9.5"/></svg>';
  const BOOK_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.2C10.6 4.9 8.7 4.2 6.5 4.2c-1.3 0-2.5.2-3.5.7v13.6c1-.4 2.2-.7 3.5-.7 2.2 0 4.1.8 5.5 2 1.4-1.2 3.3-2 5.5-2 1.3 0 2.5.2 3.5.7V4.9c-1-.4-2.2-.7-3.5-.7-2.2 0-4.1.8-5.5 2z"/><path d="M12 6.2v13.6"/></svg>';
  const CAP_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 2 9l10 5 10-5-10-5z"/><path d="M5 11.2V16c0 1.6 3.1 3 7 3s7-1.4 7-3v-4.8"/></svg>';
  const MORE_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
  // "Collection" — a stack of layers, distinct from the single open-book Read icon
  const COLL_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 16l9 5 9-5"/></svg>';
  // "Marginalia" — the same bookmark-ribbon glyph used elsewhere in the app
  const MARG_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 3.5h10a1 1 0 0 1 1 1V21l-6-4-6 4V4.5a1 1 0 0 1 1-1z"/></svg>';
  // note pencil — same glyph as the reading page's own note icon
  const NOTE_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

  const curPoem = currentPoemId();

  /** The matn the reader last had open, else the first listed one (null when none is). */
  function lastPoem(): string | null {
    try {
      const rec = JSON.parse(localStorage.getItem('asl-last') || 'null') as { poem?: unknown } | null;
      if (rec && typeof rec.poem === 'string' && getPoem(rec.poem)) return rec.poem;
    } catch { /* ignore */ }
    return MUTUN[0]?.id ?? null;
  }
  function goPoem(poem: string | null, mode?: string): void {
    location.href = poem ? poemHref(poem, { mode }) : '/';
  }

  // Daily goal (verses/day) — set per matn (same keys memorize mode reads),
  // adjustable here so learners working on more than one matn can set each
  // one's own pace instead of a single fixed number.
  function readGoal(poem: string): number {
    try {
      const v = parseInt(localStorage.getItem('asl-mz-goal-target-' + poem) || '', 10);
      if (v >= 1 && v <= 50) return v;
    } catch { /* ignore */ }
    try {
      const legacy = parseInt(localStorage.getItem('asl-mz-goal-target') || '', 10);
      if (legacy >= 1 && legacy <= 50) return legacy;
    } catch { /* ignore */ }
    return 3;
  }
  function writeGoal(poem: string, n: number): void {
    try { localStorage.setItem('asl-mz-goal-target-' + poem, String(n)); } catch { /* ignore */ }
    // Home's own script renders "Goal today" from this same key — nudge it
    // to redraw immediately instead of waiting for the next full page load.
    if (window.AslRefreshHomeGoals) window.AslRefreshHomeGoals();
  }

  // Favorite mutūn (up to 2) — picked from the Collection sheet's ★ toggle,
  // shown on Home instead of the full list; the rest stay a tap away under
  // Collection. Empty means "no preference yet", so Home shows them all.
  const FAV_KEY = 'asl-fav-matn';
  function readFavs(): string[] {
    try {
      const v: unknown = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
      if (Array.isArray(v)) return v.filter((id): id is string => MUTUN.some((m) => m.id === id)).slice(0, 2);
    } catch { /* ignore */ }
    return [];
  }
  function writeFavs(arr: string[]): void { try { localStorage.setItem(FAV_KEY, JSON.stringify(arr.slice(0, 2))); } catch { /* ignore */ } }
  function toggleFavorite(poem: string): void {
    const favs = readFavs();
    const idx = favs.indexOf(poem);
    if (idx !== -1) favs.splice(idx, 1);
    else { favs.push(poem); if (favs.length > 2) favs.shift(); }
    writeFavs(favs);
    applyHomeFavorites();
  }
  // Applies the current favorites to Home's own matn list (a no-op on
  // reading pages, where .matn-list doesn't exist). Called on Home's own
  // load and again the moment a favorite is toggled in the Collection
  // sheet, so closing the sheet always shows the up-to-date list. The rest
  // stay reachable from the bottom bar's own Collection tab, so Home
  // doesn't need its own link back to it.
  function applyHomeFavorites(): void {
    const list = document.querySelector('.matn-list');
    if (!list) return;
    const favs = readFavs();
    list.querySelectorAll('.matn-row').forEach((r) => {
      r.classList.toggle('fav-hide', favs.length > 0 && favs.indexOf(r.getAttribute('data-poem') || '') === -1);
    });
    let head = document.getElementById('favHead');
    if (favs.length) {
      if (!head) {
        head = document.createElement('div');
        head.id = 'favHead';
        head.className = 'fav-head';
        head.textContent = 'My Favorite Mutūn';
        list.parentNode?.insertBefore(head, list);
      }
    } else if (head) {
      head.remove();
    }
  }

  // "Show me around" on Home — real coach-marks (a highlight ring + a
  // callout) over the actual screen, one important place at a time, rather
  // than a hand-built mockup that would drift out of sync every time
  // Home's UI changes. Any step whose element isn't on the page right now
  // (no "Continue" card yet, no progress yet, etc.) is skipped.
  const HOME_TOUR_KEY = 'asl-home-tour';
  let homeTourOpen = false; // guard against the auto-play timer and a manual tap both firing
  function startHomeTour(): void {
    if (homeTourOpen) return;
    const STEPS = [
      { sel: '.cont-card', title: 'Continue', text: 'Straight back to your last bayt.' },
      { sel: '#statsWrap .stats-card', title: 'Your progress', text: 'Overall progress, current streak and study time — kept on this device only.' },
      { sel: '.matn-list .matn-row:not(.fav-hide)', title: 'Each matn', text: 'Progress and today’s goal on the card. Read or Memorize from here.' },
      { sel: '[data-tab="collection"]', title: 'Collection', text: 'Every matn in the collection. Tap ★ on up to two to lead your Home screen.' },
      { sel: '[data-tab="marginalia"]', title: 'Marginalia', text: 'Your bookmarks and notes, from every matn, in one place.' },
      { sel: '[data-tab="more"]', title: 'More', text: 'Daily goal per matn, Appearance, offline recitations, the User Guide — and this tour again.' },
    ];
    const steps = STEPS.map((s) => ({ el: document.querySelector<HTMLElement>(s.sel), title: s.title, text: s.text }))
      .filter((s): s is { el: HTMLElement; title: string; text: string } => !!s.el);
    if (!steps.length) return;
    homeTourOpen = true;

    const scrim = document.createElement('div'); scrim.className = 'htour-scrim';
    const spot = document.createElement('div'); spot.className = 'htour-spot';
    const card = document.createElement('div'); card.className = 'htour-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Show me around');
    card.innerHTML = '<h3></h3><p></p><div class="htour-foot"><button type="button" class="htour-skip">Skip</button>' +
      '<div class="htour-dots"></div><button type="button" class="htour-next">Next</button></div>';
    document.body.appendChild(scrim);
    document.body.appendChild(spot);
    document.body.appendChild(card);
    const h3 = card.querySelector('h3')!, p = card.querySelector('p')!;
    const dotsEl = card.querySelector('.htour-dots')!;
    dotsEl.innerHTML = steps.map(() => '<i></i>').join('');
    const dots = Array.from(dotsEl.children);
    const nextBtn = card.querySelector<HTMLButtonElement>('.htour-next')!;
    const skipBtn = card.querySelector<HTMLButtonElement>('.htour-skip')!;

    let idx = 0;
    function close(): void {
      try { localStorage.setItem(HOME_TOUR_KEY, '1'); } catch { /* ignore */ }
      scrim.classList.remove('show');
      window.removeEventListener('resize', reposition);
      homeTourOpen = false;
      setTimeout(() => { [scrim, spot, card].forEach((el) => el.remove()); }, 250);
    }
    function reposition(): void {
      const s = steps[idx];
      if (!s || !s.el.isConnected) { advance(); return; }
      const prevSB = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';
      s.el.scrollIntoView({ block: 'center' });
      document.documentElement.style.scrollBehavior = prevSB;
      const r = s.el.getBoundingClientRect();
      const pad = 8;
      spot.style.left = (r.left - pad) + 'px'; spot.style.top = (r.top - pad) + 'px';
      spot.style.width = (r.width + pad * 2) + 'px'; spot.style.height = (r.height + pad * 2) + 'px';
      const cardH = card.offsetHeight || 150;
      const below = r.bottom + pad + 12 + cardH < window.innerHeight;
      card.style.top = (below ? (r.bottom + pad + 12) : Math.max(12, r.top - pad - 12 - cardH)) + 'px';
      const cw = card.offsetWidth || 300;
      card.style.left = Math.round(Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), window.innerWidth - 12 - cw)) + 'px';
    }
    function render(): void {
      const s = steps[idx];
      if (!s) return;
      h3.textContent = s.title; p.textContent = s.text;
      dots.forEach((d, i) => d.classList.toggle('on', i === idx));
      nextBtn.textContent = idx === steps.length - 1 ? 'Got it' : 'Next';
      reposition();
    }
    function advance(): void {
      if (idx < steps.length - 1) { idx++; render(); } else close();
    }
    nextBtn.addEventListener('click', advance);
    skipBtn.addEventListener('click', close);
    scrim.addEventListener('click', close);
    window.addEventListener('resize', reposition);
    requestAnimationFrame(() => { scrim.classList.add('show'); render(); });
  }

  // Swipe-down-to-close: drag from the grip or the heading (never from the
  // scrollable list below, so it never fights list scrolling) follows the
  // finger, and releasing past ~22% of the panel's height (or the head/grip
  // area, matching native bottom-sheet behavior) finishes the close. `closeFn`
  // is called with `true` once the panel has already animated off-screen, so
  // it can skip its own (now redundant) closing transition.
  function enableSheetDrag(overlay: HTMLElement, closeFn: (immediate?: boolean) => void): void {
    const panel = overlay.querySelector<HTMLElement>('.as-panel');
    const scrim = overlay.querySelector<HTMLElement>('.as-scrim');
    if (!panel) return;
    const pnl = panel;
    function wireHandle(el: HTMLElement | null): void {
      if (!el) return;
      let startY: number | null = null, dragging = false, dy = 0;
      el.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        startY = e.clientY; dy = 0; dragging = false;
        try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      });
      el.addEventListener('pointermove', (e) => {
        if (startY === null) return;
        const d = e.clientY - startY;
        if (d <= 0) {
          dy = 0;
          if (dragging) { pnl.style.transform = ''; if (scrim) scrim.style.opacity = ''; }
          return;
        }
        dragging = true; dy = d;
        pnl.style.transition = 'none';
        pnl.style.transform = 'translateY(' + dy + 'px)';
        if (scrim) scrim.style.opacity = String(Math.max(0, 1 - dy / (pnl.offsetHeight * 0.6 || 240)));
        e.preventDefault();
      });
      function onUp(): void {
        if (startY === null) return;
        startY = null;
        pnl.style.transition = '';
        if (!dragging) return;
        dragging = false;
        const threshold = Math.min(120, pnl.offsetHeight * 0.22);
        if (dy > threshold) {
          pnl.style.transition = 'transform .18s ease-in';
          pnl.style.transform = 'translateY(100%)';
          if (scrim) scrim.style.opacity = '0';
          let finished = false;
          const finish = (): void => { if (finished) return; finished = true; closeFn(true); };
          pnl.addEventListener('transitionend', finish, { once: true });
          setTimeout(finish, 220);
        } else {
          pnl.style.transform = '';
          if (scrim) scrim.style.opacity = '';
        }
      }
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    }
    wireHandle(overlay.querySelector<HTMLElement>('.as-grip'));
    wireHandle(overlay.querySelector<HTMLElement>('.as-head'));
  }

  /** Builds a bottom sheet's overlay and returns it, already in the page. */
  function makeSheet(label: string, inner: string): HTMLElement {
    const s = document.createElement('div');
    s.className = 'appsheet';
    s.innerHTML = '<div class="as-scrim"></div><div class="as-panel" role="dialog" aria-label="' + esc(label) + '">' + inner + '</div>';
    document.body.appendChild(s);
    return s;
  }
  /** Closes a sheet: the slide-out, then removal (at once after a swipe). */
  function dismiss(s: HTMLElement, immediate?: boolean): void {
    s.classList.remove('open');
    if (immediate) s.remove(); else setTimeout(() => s.remove(), 240);
  }
  const THEME_HTML = '<div class="as-theme-wrap"><span class="as-theme-lbl">Appearance</span>' +
    '<div class="as-theme" role="group" aria-label="Appearance">' +
    '<button type="button" data-th="auto">Auto</button>' +
    '<button type="button" data-th="light">Light</button>' +
    '<button type="button" data-th="dark">Dark</button></div></div>';
  function wireTheme(s: HTMLElement): void {
    const cur = window.AppTheme?.mode() ?? 'auto';
    const btns = Array.from(s.querySelectorAll<HTMLButtonElement>('.as-theme button'));
    btns.forEach((b) => {
      if (b.getAttribute('data-th') === cur) b.classList.add('on');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const m = b.getAttribute('data-th');
        if (window.AppTheme && (m === 'auto' || m === 'light' || m === 'dark')) window.AppTheme.set(m);
        btns.forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
      });
    });
  }
  function matnRowsHtml(withFav: boolean): string {
    const favs = withFav ? readFavs() : [];
    return MUTUN.map((m) => {
      const on = m.id === curPoem;
      const isFav = favs.indexOf(m.id) !== -1;
      const fav = withFav
        ? '<button type="button" class="as-fav' + (isFav ? ' on' : '') + '" data-fav="' + esc(m.id) + '" ' +
          'aria-label="' + esc(isFav ? 'Remove ' + m.en + ' from favorites' : 'Add ' + m.en + ' to favorites') + '" ' +
          'aria-pressed="' + isFav + '">' + (isFav ? '★' : '☆') + '</button>'
        : '';
      return '<div class="as-row' + (on ? ' on' : '') + '" data-poem="' + esc(m.id) + '">' + fav +
        '<span class="as-num">' + m.n + '</span>' +
        '<span class="as-names"><span class="as-ar">' + esc(m.ar) + '</span><span class="as-en">' + esc(m.en) + '</span></span>' +
        '<span class="as-acts"><button type="button" data-go="read">Read</button>' +
        '<button type="button" data-go="memorize">Memorize</button></span></div>';
    }).join('');
  }
  /** A row tap opens that matn; its Read / Memorize buttons pick the mode. */
  function onMatnRowClick(e: Event): void {
    const btn = closest(e, '[data-go]');
    const row = closest(e, '.as-row');
    if (!row) return;
    goPoem(row.getAttribute('data-poem'), btn ? btn.getAttribute('data-go') || undefined : undefined);
  }
  const EMPTY_COLLECTION = '<div class="as-empty">The collection is being prepared.<br>Each matn will appear here as soon as it is published.</div>';

  // ---- "More" bottom sheet (reading pages) ----
  let sheet: HTMLElement | null = null;
  function closeSheet(immediate?: boolean): void {
    if (!sheet) return;
    const s = sheet; sheet = null;
    dismiss(s, immediate);
  }
  function openSheet(): void {
    if (sheet) { closeSheet(); return; }
    const s = makeSheet('All mutūn',
      '<div class="as-grip"></div><div class="as-head">The Mutūn</div>' + (MUTUN.length ? matnRowsHtml(false) : EMPTY_COLLECTION) +
      '<div class="as-div"></div>' +
      '<a class="as-link" href="/guide">📖 User guide</a>' +
      '<button type="button" class="as-link as-offline" hidden>⤓ Download recitations</button>' +
      THEME_HTML);
    sheet = s;
    wireTheme(s);
    // "Download recitations" — shown only when there are recordings still to
    // save; hidden once everything is downloaded. Lets users grab the audio
    // any time after the first-run card has gone.
    const dl = s.querySelector<HTMLButtonElement>('.as-offline');
    const off = window.AslOffline;
    if (dl && off && typeof off.status === 'function') {
      off.status().then((st) => {
        if (sheet !== s || !st || !st.total || st.complete) return;
        dl.hidden = false;
        dl.textContent = offlineLabel(st);
        // Opens the picker (per matn, with sizes) rather than firing off a
        // 150 MB download from a menu tap.
        dl.addEventListener('click', (e) => {
          e.stopPropagation();
          closeSheet();
          off.open?.();
        });
      }).catch(() => { /* leave it hidden */ });
    }
    s.querySelector('.as-scrim')?.addEventListener('click', () => closeSheet());
    enableSheetDrag(s, closeSheet);
    s.addEventListener('click', onMatnRowClick);
    requestAnimationFrame(() => s.classList.add('open'));
  }

  // ---- Home-only sheets: the top-right ⋯ menu is gone on Home — its old
  // job (matn list + guide + download + appearance) is now split across
  // Home's own bottom bar: Collection, Marginalia and More. ----
  let collectionSheet: HTMLElement | null = null;
  function closeCollectionSheet(immediate?: boolean): void {
    if (!collectionSheet) return;
    const s = collectionSheet; collectionSheet = null;
    dismiss(s, immediate);
  }
  function openCollectionSheet(): void {
    if (collectionSheet) { closeCollectionSheet(); return; }
    const s = makeSheet('The Mutūn collection',
      '<div class="as-grip"></div><div class="as-head">The Mutūn</div>' +
      (MUTUN.length
        ? '<p class="as-hint">Tap ★ to pick up to 2 favorites for your Home screen.</p>' + matnRowsHtml(true)
        : EMPTY_COLLECTION));
    collectionSheet = s;
    s.querySelector('.as-scrim')?.addEventListener('click', () => closeCollectionSheet());
    enableSheetDrag(s, closeCollectionSheet);
    s.addEventListener('click', (e) => {
      const favBtn = closest(e, '[data-fav]');
      if (favBtn) {
        e.stopPropagation();
        toggleFavorite(favBtn.getAttribute('data-fav') || '');
        s.querySelectorAll('.as-row').forEach((r) => r.remove());
        s.querySelector('.as-panel')?.insertAdjacentHTML('beforeend', matnRowsHtml(true));
        return;
      }
      onMatnRowClick(e);
    });
    requestAnimationFrame(() => s.classList.add('open'));
  }

  let moreSheet: HTMLElement | null = null;
  function closeMoreSheet(immediate?: boolean): void {
    if (!moreSheet) return;
    const s = moreSheet; moreSheet = null;
    dismiss(s, immediate);
  }
  function openMoreSheet(): void {
    if (moreSheet) { closeMoreSheet(); return; }
    const fbSubject = encodeURIComponent(SITE.appName + ' App Feedback');
    const devSubject = encodeURIComponent(SITE.appName + ' App — Question');
    const goals = MUTUN.length
      ? '<div class="as-goal-sec"><span class="as-theme-lbl">Daily goal</span>' +
        MUTUN.map((m) => {
          const id = esc(m.id), en = esc(m.en);
          return '<div class="as-goal-row"><span class="as-goal-name">' + en + '</span>' +
            '<div class="as-goal" role="group" aria-label="Daily goal for ' + en + '">' +
            '<button type="button" class="as-goal-dec" data-poem="' + id + '" aria-label="Decrease daily goal for ' + en + '">−</button>' +
            '<span class="as-goal-n" data-poem="' + id + '"></span>' +
            '<button type="button" class="as-goal-inc" data-poem="' + id + '" aria-label="Increase daily goal for ' + en + '">+</button>' +
            '</div></div>';
        }).join('') +
        '</div>'
      : '';
    const s = makeSheet('More',
      '<div class="as-grip"></div><div class="as-head">More</div>' +
      '<a class="as-link" href="/guide">📖 User guide</a>' +
      '<button type="button" class="as-link as-tour">▶ Show me around</button>' +
      THEME_HTML + goals +
      '<div class="as-div"></div>' +
      '<button type="button" class="as-link as-offline" disabled>⤓ Download recitations</button>' +
      '<button type="button" class="as-link as-share">📤 Share this app</button>' +
      '<a class="as-link" href="mailto:' + CONTACT_EMAIL + '?subject=' + fbSubject + '">💬 Send feedback</a>' +
      (RATE_URL
        ? '<a class="as-link" href="' + esc(RATE_URL) + '" target="_blank" rel="noopener">★ ' +
          (IS_IOS ? 'Rate on the App Store' : 'Rate on Google Play') + '</a>'
        : '') +
      '<a class="as-link" href="mailto:' + CONTACT_EMAIL + '?subject=' + devSubject + '">✉ Email the developer</a>');
    moreSheet = s;
    wireTheme(s);
    MUTUN.forEach((m) => {
      const sel = '[data-poem="' + CSS.escape(m.id) + '"]';
      const n = s.querySelector<HTMLElement>('.as-goal-n' + sel);
      const dec = s.querySelector<HTMLButtonElement>('.as-goal-dec' + sel);
      const inc = s.querySelector<HTMLButtonElement>('.as-goal-inc' + sel);
      if (!n || !dec || !inc) return;
      function renderGoal(): void {
        const v = readGoal(m.id);
        n!.innerHTML = v + '<small> /day</small>';
        dec!.disabled = v <= 1;
        inc!.disabled = v >= 50;
      }
      renderGoal();
      dec.addEventListener('click', (e) => {
        e.stopPropagation();
        const v = readGoal(m.id);
        if (v <= 1) return;
        writeGoal(m.id, v - 1); renderGoal();
      });
      inc.addEventListener('click', (e) => {
        e.stopPropagation();
        const v = readGoal(m.id);
        if (v >= 50) return;
        writeGoal(m.id, v + 1); renderGoal();
      });
    });
    s.querySelector('.as-tour')?.addEventListener('click', () => {
      closeMoreSheet();
      startHomeTour();
    });
    // "Share this app" — links to the store listings (not the web URL), so
    // whoever receives it installs the real app. The OS share sheet where
    // available; otherwise copy the text (with a brief confirmation), or a
    // last-resort mailto. The site's own short links (/android, /ios) are
    // used when they are set up, else the listing itself.
    const shareBtn = s.querySelector<HTMLButtonElement>('.as-share');
    shareBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const storeLines: string[] = [];
      if (PLAY_STORE_URL) storeLines.push('*Android:* ' + (SITE.shortLinks.android ? SITE.url + '/android' : PLAY_STORE_URL));
      if (APP_STORE_URL) storeLines.push('*iPhone/iPad:* ' + (SITE.shortLinks.ios ? SITE.url + '/ios' : APP_STORE_URL));
      if (!storeLines.length) storeLines.push(SITE.url + '/');
      const names = MUTUN.map((m) => m.en);
      const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : (names[0] ?? '');
      const shareData = {
        title: SITE.appName + ' — ' + SITE.org.name,
        text: 'Learn the classical mutūn' + (list ? ' — ' + list + ' —' : '') +
          ' with translations, memorization drills and spaced review.\n\n' + storeLines.join('\n'),
      };
      if (typeof navigator.share === 'function') { navigator.share(shareData).catch(() => { /* cancelled */ }); return; }
      function mailFallback(): void {
        location.href = 'mailto:?subject=' + encodeURIComponent(shareData.title) +
          '&body=' + encodeURIComponent(shareData.text);
      }
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(shareData.title + '\n' + shareData.text).then(() => {
          const orig = shareBtn.textContent;
          shareBtn.textContent = '✓ Link copied';
          setTimeout(() => { if (shareBtn.isConnected) shareBtn.textContent = orig; }, 1800);
        }).catch(mailFallback);
        return;
      }
      mailFallback();
    });
    // "Download recitations" always shows here (unlike the reading pages'
    // sheet, which hides it once complete) — reflecting its saved/available
    // state instead, so it stays a reachable, explicit menu item.
    const dl = s.querySelector<HTMLButtonElement>('.as-offline');
    const off = window.AslOffline;
    if (dl && off && typeof off.status === 'function') {
      off.status().then((st) => {
        if (!st || !st.total) { dl.textContent = 'No recitations to download yet'; return; }
        dl.disabled = false;
        if (st.complete) { dl.textContent = '✓ Recitations saved offline'; dl.disabled = true; return; }
        dl.textContent = offlineLabel(st);
        // Opens the picker (per matn, with sizes) rather than firing off a
        // 150 MB download from a menu tap.
        dl.addEventListener('click', (e) => {
          e.stopPropagation();
          closeMoreSheet();
          off.open?.();
        });
      }).catch(() => { dl.textContent = 'No recitations to download yet'; });
    }
    s.querySelector('.as-scrim')?.addEventListener('click', () => closeMoreSheet());
    enableSheetDrag(s, closeMoreSheet);
    requestAnimationFrame(() => s.classList.add('open'));
  }

  // "Marginalia" — every bookmark and note across all the mutūn, one tap
  // from Home. Sorted by matn, then bayt (bookmarks carry no timestamp, so
  // this matches the ordering already used by the web home page's own
  // "Your bookmarks" card).
  let margSheet: HTMLElement | null = null;
  function closeMargSheet(immediate?: boolean): void {
    if (!margSheet) return;
    const s = margSheet; margSheet = null;
    dismiss(s, immediate);
  }
  interface MargEntry { m: MatnTab; n: number; bm: boolean; note: string }
  function marginaliaEntries(): MargEntry[] {
    const out: MargEntry[] = [];
    MUTUN.forEach((m) => {
      const ns: Record<string, { bm?: boolean; note?: string }> = {};
      try {
        const arr: unknown = JSON.parse(localStorage.getItem('asl-bm-' + m.id) || 'null');
        if (Array.isArray(arr)) arr.forEach((n) => { const k = String(n); (ns[k] ??= {}).bm = true; });
      } catch { /* ignore */ }
      try {
        const o: unknown = JSON.parse(localStorage.getItem('asl-notes-' + m.id) || 'null');
        if (o && typeof o === 'object') {
          for (const [k, v] of Object.entries(o as Record<string, unknown>)) (ns[k] ??= {}).note = String(v ?? '');
        }
      } catch { /* ignore */ }
      Object.keys(ns).map(Number).filter((n) => n > 0).sort((a, b) => a - b).forEach((n) => {
        const e = ns[String(n)]!;
        out.push({ m, n, bm: !!e.bm, note: e.note || '' });
      });
    });
    return out;
  }
  function openMarginaliaSheet(): void {
    if (margSheet) { closeMargSheet(); return; }
    const entries = marginaliaEntries();
    let body: string;
    if (!entries.length) {
      body = '<div class="as-empty">No bookmarks or notes yet.<br>Tap a verse’s ribbon to bookmark it, or its pencil to add a note — they’ll show up here.</div>';
    } else {
      body = entries.map((e) => {
        const snippet = e.note ? '<span class="as-marg-note">' + esc(e.note.slice(0, 90)) + '</span>' : '';
        const marks = (e.bm ? MARG_IC : '') + (e.note ? NOTE_IC : '');
        return '<a class="as-marg-row" href="' + esc(poemHref(e.m.id, { mode: 'read', goto: e.n })) + '">' +
          '<span class="as-marg-ic">' + marks + '</span>' +
          '<span class="as-marg-body"><span class="as-marg-t"><b>' + esc(e.m.en) + '</b> · Bayt ' + e.n + '</span>' + snippet + '</span>' +
          '</a>';
      }).join('');
    }
    const s = makeSheet('Marginalia — your bookmarks and notes',
      '<div class="as-grip"></div><div class="as-head">Marginalia</div>' + body);
    margSheet = s;
    s.querySelector('.as-scrim')?.addEventListener('click', () => closeMargSheet());
    enableSheetDrag(s, closeMargSheet);
    requestAnimationFrame(() => s.classList.add('open'));
  }

  // Bottom tabs on reading pages: Home · Read · Memorize · More. (Home has
  // its own set, below: its matn rows already carry Read/Memorize buttons.)
  if (!isHome) {
    const nav = document.createElement('nav');
    nav.className = 'appnav';
    nav.setAttribute('aria-label', 'App sections');
    nav.innerHTML =
      '<a href="/" data-tab="home"><span class="ic">' + HOME_IC + '</span><span class="lbl">Home</span></a>' +
      '<a href="#" data-tab="read"><span class="ic">' + BOOK_IC + '</span><span class="lbl">Read</span></a>' +
      '<a href="#" data-tab="memorize"><span class="ic">' + CAP_IC + '</span><span class="lbl">Memorize</span></a>' +
      '<a href="#" data-tab="more"><span class="ic">' + MORE_IC + '</span><span class="lbl">More</span></a>';
    document.body.appendChild(nav);

    const tab = (name: string): HTMLElement => nav.querySelector<HTMLElement>('[data-tab="' + name + '"]')!;
    const tabs = { home: tab('home'), read: tab('read'), memorize: tab('memorize'), more: tab('more') };
    function setActive(): void {
      const mz = document.body.classList.contains('mz-on');
      tabs.home.classList.toggle('active', isHome);
      tabs.read.classList.toggle('active', !isHome && !!curPoem && !mz);
      tabs.memorize.classList.toggle('active', !isHome && !!curPoem && mz);
    }
    // Cap-tab badge: gold = memorized-abyat count; turns red with the due
    // count when spaced-repetition reviews are waiting (as the old top-bar
    // badge did). Hidden while a review session is running.
    const mzCount = document.createElement('span');
    mzCount.className = 'mzcount';
    tabs.memorize.querySelector('.ic')?.appendChild(mzCount);
    function updateMzCount(): void {
      if (!curPoem) return;
      let mastered = 0, due = 0;
      const d = new Date();
      const today = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      try {
        const prog = JSON.parse(localStorage.getItem('asl-mz-prog-' + curPoem) || 'null') as { v?: Record<string, { s?: number; due?: string } | null> } | null;
        if (prog && prog.v) Object.keys(prog.v).forEach((k) => {
          const r = prog.v![k];
          if (r && r.s === 2) { mastered++; if (r.due && r.due <= today) due++; }
        });
      } catch { /* ignore */ }
      const showDue = due > 0 && !document.body.classList.contains('mz-review');
      const n = showDue ? due : mastered;
      mzCount.textContent = n > 999 ? '999+' : String(n);
      mzCount.classList.toggle('due', showDue);
      mzCount.classList.toggle('show', n > 0);
      tabs.memorize.title = showDue ? due + ' abyāt due for review' : (mastered ? mastered + ' abyāt memorized' : '');
    }
    function syncBar(): void { setActive(); updateMzCount(); }
    syncBar();
    // Memorize mode toggles body classes after load — keep the bar in sync.
    new MutationObserver(syncBar).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('asl-mz-save', updateMzCount);

    const mzBtn = (): HTMLElement | null => document.querySelector<HTMLElement>('.mzbtn');
    tabs.read.addEventListener('click', (e) => {
      e.preventDefault();
      if (curPoem) {
        // already reading this matn: just leave Memorize mode if it is on
        if (document.body.classList.contains('mz-on')) mzBtn()?.click();
        return;
      }
      goPoem(lastPoem(), 'read');
    });
    tabs.memorize.addEventListener('click', (e) => {
      e.preventDefault();
      if (curPoem) {
        if (!document.body.classList.contains('mz-on')) mzBtn()?.click();
        return;
      }
      goPoem(lastPoem(), 'memorize');
    });

    tabs.more.addEventListener('click', (e) => { e.preventDefault(); openSheet(); });
  } else {
    // Home's own bottom bar: Home (current) · Collection (every matn,
    // Read/Memorize at a tap) · Marginalia (every bookmark & note) · More.
    const hnav = document.createElement('nav');
    hnav.className = 'appnav';
    hnav.setAttribute('aria-label', 'App sections');
    hnav.innerHTML =
      '<a href="/" class="active" data-tab="home"><span class="ic">' + HOME_IC + '</span><span class="lbl">Home</span></a>' +
      '<a href="#" data-tab="collection"><span class="ic">' + COLL_IC + '</span><span class="lbl">Collection</span></a>' +
      '<a href="#" data-tab="marginalia"><span class="ic">' + MARG_IC + '</span><span class="lbl">Marginalia</span></a>' +
      '<a href="#" data-tab="more"><span class="ic">' + MORE_IC + '</span><span class="lbl">More</span></a>';
    document.body.appendChild(hnav);
    hnav.querySelector('[data-tab="collection"]')?.addEventListener('click', (e) => { e.preventDefault(); openCollectionSheet(); });
    hnav.querySelector('[data-tab="marginalia"]')?.addEventListener('click', (e) => { e.preventDefault(); openMarginaliaSheet(); });
    hnav.querySelector('[data-tab="more"]')?.addEventListener('click', (e) => { e.preventDefault(); openMoreSheet(); });
    applyHomeFavorites();
    // Auto-play once per device, the first time this app-mode Home screen
    // is seen — same convention as the reading pages' own walkthrough. Not
    // while the collection is still empty: most of the tour's stops would be
    // missing, and having seen it then would hide it once there is a matn.
    let homeTourSeen = false;
    try { homeTourSeen = !!localStorage.getItem(HOME_TOUR_KEY); } catch { /* ignore */ }
    if (!homeTourSeen && MUTUN.length) setTimeout(startHomeTour, 800);
  }
}
