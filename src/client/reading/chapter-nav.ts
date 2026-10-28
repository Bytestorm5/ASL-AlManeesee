/* Jump-to-chapter for the multi-chapter mutūn.
   The navbar pills strip is fine for glancing at nearby chapters, but with
   dozens of chapters, reaching a far one means scrolling the strip. This adds
   a pinned button (showing the current chapter) that opens a searchable,
   scrollable list so any chapter is one tap away. Self-contained; on a matn in
   a single chapter it only sets up the one-row top bar. */
import type { AslChapterJumpApi } from '../globals.d.ts';
import { esc } from '../page.ts';
import { norm } from './search.ts';

type ChapterEntry = AslChapterJumpApi['chapters'][number];

/* ---- landing where the jump was aimed ----------------------------------
   A jump lands on an estimate. Every chapter is content-visibility:auto, so
   one the reader has never reached has only its reserved height until the
   browser lays it out — which it does the instant we arrive there, and the
   real height is rarely the reserved one, so the heading we aimed at slides
   out from under us in the same frame. Re-aim until the document stops
   changing height. A reader who starts scrolling is left alone: only drift
   that happens while they are still is corrected. */
function settleOn(el: Element | null, offset: number): void {
  if (!el) return;
  const giveUp = Date.now() + 3000;
  let settledAt = Date.now(), lastH = -1, last = window.pageYOffset;
  const step = () => {
    const h = document.documentElement.scrollHeight;
    if (h !== lastH) { lastH = h; settledAt = Date.now(); }
    const y = Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - offset);
    const here = window.pageYOffset;
    // the page sets scroll-behavior:smooth on <html>; a correction has to land
    // at once rather than animate over the top of the jump that just happened
    if (Math.abs(y - here) > 4 && Math.abs(here - last) < 4) instantScroll(y);
    last = window.pageYOffset;
    if (Date.now() < giveUp && Date.now() - settledAt < 600) setTimeout(step, 80);
  };
  step();
}

/** scrollTo that lands at once, whatever the CSS scroll-behavior says. */
function instantScroll(y: number): void {
  const root = document.documentElement, prev = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo(0, y);
  root.style.scrollBehavior = prev;
}

/* ---- reserved chapter heights -----------------------------------------
   The renderer gives each chapter a contain-intrinsic-size so a matn whose
   chapters are being skipped still has roughly the right scroll height. That
   figure is a per-bayt guess, and on a wide screen it was some 16px a bayt
   short — enough that picking a chapter from the list landed most of a screen
   above it. A chapter that IS rendered is right there to be measured, so
   stop guessing and re-reserve every other chapter from the real number. */
function calibrateReserved(): void {
  const secs = [...document.querySelectorAll<HTMLElement>('section.chapter')];
  if (secs.length < 2 || !secs[0]!.style.containIntrinsicSize) return;
  let ref: HTMLElement | null = null;
  for (const s of secs) {
    if (typeof s.checkVisibility !== 'function' || s.checkVisibility({ contentVisibilityAuto: true })) { ref = s; break; }
  }
  const box = ref?.querySelector('.verses');
  if (!ref || !box) return;
  const n = box.querySelectorAll('.verse').length;
  const inner = box.getBoundingClientRect().height;
  if (!n || inner <= 0) return;
  const row = inner / n, base = ref.getBoundingClientRect().height - inner;
  if (!(row > 20)) return;                       // nothing laid out yet — leave the guess alone
  for (const s of secs) {
    if (s === ref) continue;
    const c = s.querySelectorAll('.verse').length;
    if (c) s.style.containIntrinsicSize = 'auto ' + Math.round(c * row + base) + 'px';
  }
}

const LIST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>';

const CSS = [
  '.chnav-btn{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;cursor:pointer;',
  'border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447);',
  'border-radius:22px;padding:5px 11px 5px 9px;font-family:"Montserrat",sans-serif;font-size:.74rem;font-weight:700;',
  'white-space:nowrap;-webkit-tap-highlight-color:transparent;transition:background .15s,border-color .15s}',
  '.chnav-btn:hover{border-color:var(--gilt,#c0973c)}',
  '.chnav-btn svg{width:16px;height:16px;flex:0 0 auto}',
  '.chnav-btn .chnav-cur{font-family:"Cormorant Garamond",Georgia,serif;font-weight:700;font-size:.9rem;line-height:1}',
  '.chnav-pop{position:fixed;z-index:80;width:min(340px,94vw);max-height:min(66vh,560px);display:none;flex-direction:column;',
  'background:var(--surface,#fff);border:1px solid var(--paper-edge,#e8dcc7);border-radius:14px;',
  'box-shadow:0 16px 40px rgba(14,38,56,.22);overflow:hidden}',
  '.chnav-pop.open{display:flex}',
  '.chnav-top{padding:10px 12px 8px;border-bottom:1px solid var(--paper-edge,#e8dcc7)}',
  '.chnav-top .h{font-family:"Montserrat",sans-serif;font-size:.6rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--sage,#9c7f80);margin:0 2px 7px}',
  '.chnav-search{width:100%;box-sizing:border-box;border:1px solid var(--paper-edge,#e8dcc7);border-radius:10px;',
  'background:var(--paper,#f9f4ea);color:var(--ink,#3a2a2b);font-family:"Montserrat",sans-serif;font-size:.82rem;',
  'padding:9px 11px;-webkit-appearance:none;outline:none}',
  '.chnav-search:focus{border-color:var(--madder,#8a4447)}',
  '.chnav-list{overflow-y:auto;-webkit-overflow-scrolling:touch;padding:6px}',
  '.chnav-item{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;text-align:left;',
  'border:0;background:transparent;cursor:pointer;padding:8px 9px;border-radius:9px;text-decoration:none;',
  '-webkit-tap-highlight-color:transparent}',
  '.chnav-item:hover{background:var(--paper,#f7f2e5)}',
  '.chnav-item .n{flex:0 0 auto;min-width:26px;height:26px;border-radius:50%;display:grid;place-items:center;',
  'background:var(--paper-2,#f3eada);color:var(--madder,#8a4447);font-family:"Cormorant Garamond",serif;font-weight:700;font-size:.82rem}',
  '.chnav-item .ar{flex:1 1 auto;min-width:0;font-family:"Scheherazade New","Amiri",serif;direction:rtl;text-align:right;',
  'font-size:1.12rem;line-height:1.5;color:var(--ink,#3a2a2b);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.chnav-item.on{background:var(--madder,#8a4447)}',
  '.chnav-item.on .ar{color:#fff}',
  '.chnav-item.on .n{background:rgba(255,255,255,.9);color:var(--madder,#8a4447)}',
  '.chnav-empty{padding:16px;text-align:center;color:var(--sage,#9c7f80);font-family:"Montserrat",sans-serif;font-size:.8rem}',
  /* one-row top bar: the chapter dropdown replaces the tall pills strip.
     Everything is kept on a single line — icon buttons are trimmed to the
     pill height and gaps tightened so the row never wraps on a phone.
     Order: dropdown · Translation · memorize · bookmark · headphone · search · ⋯ */
  '.navbar-inner{gap:6px;padding-left:10px;padding-right:10px;flex-wrap:nowrap}',
  '.navbar-inner .nav-spacer{display:none}',
  /* the Translation/PDF menus now sit on the left of the bar, so open them
     left-aligned (extending right) instead of right-aligned off-screen */
  '.navbar-inner .menu-pop{left:0;right:auto}',
  '.navbar-inner .nav-menus{gap:6px;flex:0 1 auto;min-width:0}',
  '.navbar-inner .nav-menus .navprint{padding:6px 9px}',
  '.navbar-inner .chnav-btn{padding:5px 9px 5px 8px}',
  '.navbar-inner .pills{display:none}',
  /* match icon buttons to the pill height so the whole row lines up at ~30px */
  '.navbar-inner .mzbtn,.navbar-inner .bmbtn,.navbar-inner .aud-launch,.navbar-inner .searchbtn,.navbar-inner .helpbtn{width:30px;height:30px}',
  '.navbar-inner>.nav-brand{order:0;margin-right:auto;flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.navbar-inner .chnav-btn{order:1}',
  '.navbar-inner .nav-menus{order:2}',
  '.navbar-inner .mzbtn{order:3}',
  '.navbar-inner .bmmenu{order:4}',
  '.navbar-inner .aud-launch{order:5}',
  '.navbar-inner .searchbtn{order:6}',
  '.navbar-inner .helpbtn{order:7}',
  /* ---- collapsible table of contents for the long mutūn ---- */
  '.toc-gotowrap{text-align:center}',
  '.toc-goto{display:inline-flex;align-items:center;gap:8px;cursor:pointer;margin:2px auto 20px;',
  'border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447);',
  'border-radius:26px;padding:10px 18px;font-family:"Montserrat",sans-serif;font-size:.82rem;font-weight:700;',
  '-webkit-tap-highlight-color:transparent;transition:background .15s,border-color .15s,box-shadow .15s;box-shadow:0 2px 8px rgba(58,28,31,.06)}',
  '.toc-goto:hover{border-color:var(--gilt,#c0973c);box-shadow:0 5px 16px rgba(58,28,31,.13)}',
  '.toc-goto svg{width:16px;height:16px}',
  '.toc-grid.toc-clip{max-height:clamp(220px,38vh,360px);overflow:hidden;',
  '-webkit-mask-image:linear-gradient(180deg,#000 72%,transparent);mask-image:linear-gradient(180deg,#000 72%,transparent)}',
  '.toc-actions{display:flex;justify-content:center;margin:16px auto 0}',
  '.toc-toggle{cursor:pointer;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447);',
  'border-radius:22px;padding:8px 18px;font-family:"Montserrat",sans-serif;font-size:.76rem;font-weight:700;',
  '-webkit-tap-highlight-color:transparent;transition:background .15s,border-color .15s}',
  '.toc-toggle:hover{border-color:var(--gilt,#c0973c);background:var(--paper,#f7f2e5)}',
  /* ---- "go to bayt N" row inside the palette ---- */
  '.chnav-bayt{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;text-align:left;border:0;',
  'background:var(--paper-2,#f3eada);cursor:pointer;padding:10px 9px;border-radius:9px;margin-bottom:6px;',
  '-webkit-tap-highlight-color:transparent;font-family:"Montserrat",sans-serif}',
  '.chnav-bayt:hover{background:var(--paper,#f7f2e5)}',
  '.chnav-bayt .bi{flex:0 0 auto;min-width:26px;height:26px;border-radius:50%;display:grid;place-items:center;',
  'background:var(--madder,#8a4447);color:#fff;font-family:"Cormorant Garamond",serif;font-weight:700;font-size:.8rem}',
  '.chnav-bayt .bt{flex:1 1 auto;font-size:.85rem;font-weight:700;color:var(--ink,#3a2a2b)}',
  '.chnav-bayt .bt small{display:block;font-size:.66rem;font-weight:600;color:var(--sage,#9c7f80)}',
  /* brief highlight when a bayt-number search lands on a verse */
  '.verse.bayt-flash{animation:baytflash 1.7s ease}',
  '@keyframes baytflash{0%,100%{background:transparent}16%{background:var(--paper-2,#f3eada);border-radius:10px}}',
].join('');

export function init(): void {
  // the renderer's own #fragment handler jumps the same way and needs this too
  window.AslScrollSettle = settleOn;

  /* Twice. Once as soon as the verses exist, because re-reserving changes the
     height of the document and that is free while last-visit.ts is still
     holding the reader's place, and expensive afterwards; then again once the
     Arabic webfont has landed, since a bayt measured in the fallback face is
     not quite the right size. */
  calibrateReserved();
  if (document.fonts?.ready) void document.fonts.ready.then(() => calibrateReserved());
  else window.addEventListener('load', calibrateReserved);
  let calT: number | undefined;
  window.addEventListener('resize', () => { clearTimeout(calT); calT = window.setTimeout(calibrateReserved, 300); });

  const navInner = document.querySelector<HTMLElement>('.navbar-inner');
  const navbar = document.querySelector<HTMLElement>('.navbar');
  const pills = document.getElementById('pills');
  const secs = [...document.querySelectorAll<HTMLElement>('section.chapter')];
  if (!navInner || !navbar) return;

  const st = document.createElement('style'); st.appendChild(document.createTextNode(CSS)); document.head.appendChild(st);

  // The one-row bar order applies to every reading page; only the multi-chapter
  // mutūn get the jump dropdown.
  if (secs.length < 2) return;

  // Arabic-aware normalisation (the same rules as the verse search, search.ts):
  // ignore tashkīl and unify alef/hamza/yāʾ/tāʾ-marbūṭa so names match without diacritics.
  const chapters: ChapterEntry[] = secs.map((sec) => {
    const t = (sel: string) => (sec.querySelector(sel)?.textContent || '').trim();
    const ar = t('.ch-ar');
    return { sec, id: sec.id, num: (sec.id || '').replace('ch', ''), ar, hay: norm(t('.ch-en') + ' ' + ar + ' ' + t('.ch-tr')) };
  });
  const first = chapters[0]!;

  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'chnav-btn';
  btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'Jump to a chapter');
  btn.title = 'Jump to a chapter';
  btn.innerHTML = LIST + '<span class="chnav-cur">' + first.num + '</span>';
  navInner.insertBefore(btn, pills && pills.parentNode === navInner ? pills : navInner.firstChild);

  const pop = document.createElement('div');
  pop.className = 'chnav-pop';
  pop.innerHTML =
    '<div class="chnav-top"><div class="h">Go to chapter or bayt</div>'
    + '<input type="text" class="chnav-search" inputmode="search" enterkeyhint="go" autocomplete="off" '
    + 'placeholder="Chapter name, or a bayt number…" aria-label="Search chapters or a bayt number"></div>'
    + '<div class="chnav-list" role="listbox"></div>';
  document.body.appendChild(pop);
  const search = pop.querySelector<HTMLInputElement>('.chnav-search')!;
  const listEl = pop.querySelector<HTMLElement>('.chnav-list')!;

  // ---- bayt lookup, for "go to bayt N" from the palette ----
  const verseByNum = new Map<number, HTMLElement>();
  for (const v of document.querySelectorAll<HTMLElement>('#main .verse')) {
    const vn = v.querySelector('.vn'); if (!vn) continue;
    const n = parseInt((vn.textContent || '').trim(), 10);
    if (n && !verseByNum.has(n)) verseByNum.set(n, v);
  }

  // Track the current chapter (reading scroll) → update the button label + list highlight.
  let curId = first.id;

  // state.anchor = element the popover hangs under; state.onPick(chapter) = what a tap does.
  const state: { anchor: HTMLElement; current: string; onPick: (c: ChapterEntry) => void } = { anchor: btn, current: first.id, onPick: jumpTo };

  function buildList(filter: string) {
    const raw = filter || '';
    // accept Arabic-Indic digits (٥٥) as well as Latin
    const digits = raw.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^0-9]/g, '');
    const f = norm(filter);
    listEl.innerHTML = '';
    // a numeric query offers a direct jump to that bayt (reading mode only)
    const bn = digits ? parseInt(digits, 10) : 0;
    const hasBayt = !!bn && verseByNum.has(bn) && !document.body.classList.contains('mz-on');
    if (hasBayt) {
      const bItem = document.createElement('button');
      bItem.type = 'button'; bItem.className = 'chnav-bayt';
      bItem.innerHTML = '<span class="bi">' + bn + '</span>'
        + '<span class="bt">Go to bayt ' + bn + '<small>Jump straight to this bayt</small></span>';
      bItem.addEventListener('click', () => { closePop(); jumpToBayt(bn); });
      listEl.appendChild(bItem);
    }
    const shown = chapters.filter((c) => {
      if (!f) return true;
      return c.hay.includes(f) || c.num === f || c.num.indexOf(f) === 0;
    });
    for (const c of shown) {
      const a = document.createElement('button');
      a.type = 'button'; a.className = 'chnav-item' + (c.id === state.current ? ' on' : '');
      a.setAttribute('data-id', c.id);
      a.innerHTML = '<span class="n">' + c.num + '</span>'
        + '<span class="ar">' + (c.ar ? esc(c.ar) : ('Chapter ' + c.num)) + '</span>';
      a.addEventListener('click', () => { closePop(); state.onPick(c); });
      listEl.appendChild(a);
    }
    if (!shown.length && !hasBayt) {
      const empty = document.createElement('div');
      empty.className = 'chnav-empty';
      empty.textContent = 'No chapter or bayt matches “' + filter + '”.';
      listEl.appendChild(empty);
    }
  }

  // Reading mode → smooth-scroll to the chapter. Memorize mode → let
  // memorize.ts switch the focused chapter (chapters are hidden there).
  function jumpTo(c: ChapterEntry) {
    if (document.body.classList.contains('mz-on')) {
      document.dispatchEvent(new CustomEvent('asl-mz-goto', { detail: { id: c.id } }));
      return;
    }
    // If a verse search is filtering the page, exit it first so the chosen
    // chapter shows in full — otherwise we'd scroll to it but keep only the
    // search-matching verses visible. Done before measuring so the offset is right.
    if (window.AslSearch?.isActive()) window.AslSearch.close();
    const off = navbar!.offsetHeight + 12;
    jumpScroll(c.sec.getBoundingClientRect().top + window.pageYOffset - off, c.sec, off);
    try { history.replaceState(null, '', '#' + c.id); } catch { /* ignore */ }
  }

  function place() {
    const a = state.anchor || btn;
    const r = a.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    // hang under the anchor, but clamp so the panel always stays on-screen
    // (the TOC "Go to…" launcher can sit low on the page).
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - 8 - h);
    pop.style.top = Math.round(top) + 'px';
    pop.style.left = Math.round(Math.min(Math.max(8, r.left), window.innerWidth - 8 - w)) + 'px';
  }
  let onDoc: ((e: Event) => void) | null = null, onKey: ((e: KeyboardEvent) => void) | null = null;
  function openAt(anchor?: HTMLElement | null, opts?: Record<string, unknown>) {
    if (pop.classList.contains('open')) closePop();
    const o = opts || {};
    state.anchor = anchor || btn;
    state.current = typeof o.current === 'string' && o.current ? o.current : curId;
    state.onPick = typeof o.onPick === 'function' ? (o.onPick as (c: ChapterEntry) => void) : jumpTo;
    search.value = '';
    buildList('');
    pop.classList.add('open');
    state.anchor.setAttribute('aria-expanded', 'true');
    place();
    listEl.querySelector('.chnav-item.on')?.scrollIntoView({ block: 'center' });
    const handleDoc = (e: Event) => {
      const t = e.target as Node;
      if (!pop.contains(t) && t !== state.anchor && !state.anchor.contains(t)) closePop();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePop(); };
    onDoc = handleDoc; onKey = handleKey;
    setTimeout(() => {
      // closed again before this ran — don't leave the listeners behind
      if (onDoc !== handleDoc) return;
      document.addEventListener('click', handleDoc, true); document.addEventListener('keydown', handleKey);
    }, 0);
  }
  function closePop() {
    if (!pop.classList.contains('open')) return;
    pop.classList.remove('open');
    state.anchor.setAttribute('aria-expanded', 'false');
    if (onDoc) document.removeEventListener('click', onDoc, true);
    if (onKey) document.removeEventListener('keydown', onKey);
    onDoc = null; onKey = null;
  }
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (pop.classList.contains('open') && state.anchor === btn) closePop();
    else openAt(btn, { current: curId, onPick: jumpTo });
  });
  search.addEventListener('input', () => buildList(search.value));
  // Enter activates the top result — the "Go to bayt N" row when a number is
  // typed, otherwise the first matching chapter.
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    listEl.querySelector<HTMLElement>('.chnav-bayt, .chnav-item')?.click();
  });
  window.addEventListener('resize', () => { if (pop.classList.contains('open')) place(); });

  function setCurrent(id: string) {
    if (id === curId) return;
    curId = id;
    const c = chapters.find((x) => x.id === id);
    if (c) btn.querySelector('.chnav-cur')!.textContent = c.num;
    if (pop.classList.contains('open') && state.anchor === btn) {
      state.current = id;
      listEl.querySelectorAll('.chnav-item').forEach((el) => el.classList.toggle('on', el.getAttribute('data-id') === id));
    }
  }
  const spy = new IntersectionObserver((ents) => {
    for (const en of ents) if (en.isIntersecting) setCurrent(en.target.id);
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
  chapters.forEach((c) => spy.observe(c.sec));
  // In memorize mode the scroll-spy can't fire (chapters are hidden), so
  // memorize.ts tells us which chapter is focused.
  document.addEventListener('asl-mz-chapter', (e) => {
    const id = (e as CustomEvent<{ id?: string } | null>).detail?.id;
    if (id) setCurrent(id);
  });

  function jumpToBayt(n: number) {
    const v = verseByNum.get(n); if (!v || document.body.classList.contains('mz-on')) return;
    if (window.AslSearch?.isActive()) window.AslSearch.close();
    const off = navbar!.offsetHeight + 12;
    jumpScroll(v.getBoundingClientRect().top + window.pageYOffset - off, v, off);
    v.classList.remove('bayt-flash'); void v.offsetWidth; v.classList.add('bayt-flash');
    setTimeout(() => v.classList.remove('bayt-flash'), 1800);
  }

  // Smooth-scroll only short hops. The page sets CSS scroll-behavior:smooth
  // on <html>, so even scrollTo(behavior:'auto') animates — and animating to
  // a far bayt (a long matn runs past a thousand) makes mobile WebKit paint
  // thousands of verses along the way: the page freezes and can come back
  // only half-rendered. Long jumps therefore suspend the CSS smoothness and
  // land instantly. left:0 pins any horizontal drift a pan gesture left.
  //
  // A short hop stays where it was aimed — everything between here and there
  // is already laid out. A long one arrives among chapters that were never
  // rendered, so it needs settleOn to hold the target while they take their
  // real heights.
  function jumpScroll(top: number, el: Element, offset: number) {
    const short = Math.abs(top - window.pageYOffset) <= window.innerHeight * 3
      && !matchMedia('(prefers-reduced-motion:reduce)').matches;
    if (short) { window.scrollTo({ left: 0, top, behavior: 'smooth' }); return; }
    instantScroll(top);
    settleOn(el, offset);
  }

  // ---- shorten the long inline TOC + a prominent, searchable "Go to…" launcher ----
  const tocGrid = document.getElementById('tocGrid');
  const tocParent = tocGrid?.parentNode;
  if (tocGrid && tocParent && tocGrid.closest('.toc-wrap')) {
    const gotoWrap = document.createElement('div'); gotoWrap.className = 'toc-gotowrap';
    const gotoBtn = document.createElement('button');
    gotoBtn.type = 'button'; gotoBtn.className = 'toc-goto';
    gotoBtn.innerHTML = LIST + '<span>Go to chapter or bayt…</span>';
    gotoWrap.appendChild(gotoBtn);
    tocParent.insertBefore(gotoWrap, tocGrid);
    gotoBtn.addEventListener('click', (e) => { e.stopPropagation(); openAt(gotoBtn, { current: curId, onPick: jumpTo }); });

    if (chapters.length > 8) {
      tocGrid.classList.add('toc-clip');
      const act = document.createElement('div'); act.className = 'toc-actions';
      const tog = document.createElement('button'); tog.type = 'button'; tog.className = 'toc-toggle';
      const setTogLabel = () => { tog.textContent = tocGrid.classList.contains('toc-clip') ? ('Show all ' + chapters.length + ' chapters  ⌄') : 'Show fewer  ⌃'; };
      setTogLabel();
      tog.addEventListener('click', () => {
        const wasClipped = tocGrid.classList.contains('toc-clip');
        tocGrid.classList.toggle('toc-clip'); setTogLabel();
        if (!wasClipped) tocGrid.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
      act.appendChild(tog);
      tocParent.appendChild(act);
    }
  }

  /* Arriving with a #fragment — a reload, or a link someone kept. Every jump
     above writes one into the URL, so this is simply what refreshing the page
     does. The browser makes that jump itself, but it makes it early, while
     the chapters are still reserved-height guesses and before the webfont and
     the fitting have settled; by the time the page is done the heading can be
     thousands of pixels away, and it lands under the sticky bar besides. So
     keep re-aiming until the target stops moving.

     This one cannot wait for the page to settle before acting, the way the
     jumps above do — the reader is looking at the wrong place the whole time
     — so instead it yields the moment they take over: one scroll gesture, one
     key, and it is done. The home screen's Continue drives its own scroll
     (?goto=) and memorize mode shows one chapter at a time; leave both. */
  function openHash() {
    if (/[?&]goto=/.test(location.search) || document.body.classList.contains('mz-on')) return;
    let el: HTMLElement | null = null;
    try { el = document.getElementById(decodeURIComponent((location.hash || '').slice(1))); } catch { return; }
    if (!el) return;
    const target = el;
    const off = navbar!.offsetHeight + 12;
    let taken = false;
    for (const t of ['wheel', 'touchstart', 'keydown']) {
      addEventListener(t, () => { taken = true; }, { passive: true, once: true });
    }
    /* Not before the webfont has landed, however still the page looks: the
       reserved heights are re-measured then (calibrateReserved), which on a
       wide screen moves a chapter near the end of a long matn by some ten
       thousand pixels. Stopping at the first quiet moment stopped before
       that and left the reader nowhere near the chapter they asked for. */
    let fontsIn = !document.fonts?.ready;
    if (!fontsIn) void document.fonts.ready.then(() => { fontsIn = true; });
    const giveUp = Date.now() + 8000;
    let stillSince = 0, lastY = -1;
    const step = () => {
      if (taken) return;
      const y = Math.max(0, target.getBoundingClientRect().top + window.pageYOffset - off);
      if (Math.abs(y - lastY) < 2) { if (!stillSince) stillSince = Date.now(); }
      else { stillSince = 0; lastY = y; }
      instantScroll(y);
      const settled = fontsIn && stillSince && Date.now() - stillSince > 700;
      if (Date.now() < giveUp && !settled) setTimeout(step, 120);
    };
    step();
  }
  if (location.hash.length > 1) openHash();
  // changing only the fragment does not reload the page, so nothing above runs
  addEventListener('hashchange', openHash);

  // Reusable by memorize mode.
  const api: AslChapterJumpApi = { open: openAt, close: closePop, chapters, gotoBayt: jumpToBayt };
  window.AslChapterJump = api;
}
