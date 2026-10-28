/* Bookmarks for the reading page.
   - A ribbon button on every verse toggles a bookmark (saved per matn on the
     device, so it survives closing the app).
   - A bookmark menu in the top bar lists saved verses; tapping one jumps to it.
   Lets readers easily return to where they left off. */
import { currentPoem, esc, lsGet, lsSet } from '../page.ts';

const RIBBON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4z"/></svg>';

const CSS = [
  '.bm-verse-btn{flex:0 0 auto;display:inline-grid;place-items:center;width:26px;height:26px;padding:0;',
  'border-radius:50%;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447);',
  'cursor:pointer;transition:background .15s,border-color .15s,color .15s;-webkit-tap-highlight-color:transparent}',
  '.bm-verse-btn:hover{border-color:var(--gilt,#c0973c);background:var(--paper,#f7f2e5)}',
  '.bm-verse-btn svg{width:14px;height:14px;display:block}',
  '.bm-verse-btn.on{background:var(--madder,#8a4447);color:#fff;border-color:var(--madder,#8a4447)}',
  '.bm-verse-btn.on svg{fill:currentColor}',
  '.bmmenu{position:relative;flex:0 0 auto}',
  '.bmbtn{position:relative;cursor:pointer;display:inline-grid;place-items:center;width:34px;height:34px;padding:0;',
  'border-radius:50%;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447);',
  'transition:background .15s,border-color .15s;-webkit-tap-highlight-color:transparent}',
  '.bmbtn:hover{border-color:var(--gilt,#c0973c);background:var(--paper,#f7f2e5)}',
  '.bmbtn svg{width:17px;height:17px}',
  '.bmbadge{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:9px;',
  'background:var(--madder);color:#fff;font-family:"Montserrat",sans-serif;font-size:.58rem;font-weight:700;',
  'display:none;place-items:center;line-height:1}',
  '.bmpop{position:fixed;min-width:190px;max-width:min(300px,calc(100vw - 16px));max-height:62vh;overflow-y:auto;',
  'background:var(--surface,#fff);border:1px solid var(--paper-edge,#e8dcc7);border-radius:12px;box-shadow:0 12px 30px rgba(14,38,56,.16);',
  'padding:5px;display:none;z-index:70}',
  '.bmpop.open{display:block}',
  '.bmhead{font-family:"Montserrat",sans-serif;font-size:.6rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;',
  'color:var(--sage,#9c7f80);padding:8px 10px 2px}',
  '.bmsub{font-family:"Cormorant Garamond",Georgia,serif;font-style:italic;font-size:.95rem;',
  'color:var(--madder,#8a4447);padding:0 10px 7px;margin-bottom:4px;border-bottom:1px solid var(--paper-edge,#e8dcc7)}',
  '.bmitem{display:flex;align-items:center;gap:9px;width:100%;text-align:left;border:0;background:transparent;',
  'padding:8px 10px;border-radius:8px;cursor:pointer}',
  '.bmitem:hover{background:var(--paper,#f7f2e5)}',
  '.bmitem .bmn{flex:0 0 auto;min-width:22px;height:22px;border-radius:50%;display:grid;place-items:center;',
  'background:var(--paper-2,#f3eada);color:var(--madder,#8a4447);font-family:"Cormorant Garamond",serif;font-weight:700;font-size:.82rem}',
  '.bmitem .bmtxt{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
  'font-family:"Scheherazade New","Amiri",serif;font-size:.82rem;color:var(--ink,#3a2a2b);direction:rtl;text-align:right}',
  '.bmempty{padding:14px 12px;font-family:"Montserrat",sans-serif;font-size:.72rem;color:var(--ink-soft,#6c585a);line-height:1.55;text-align:center}',
  '.bmclear{width:100%;margin-top:4px;border:0;border-top:1px solid var(--paper-edge,#e8dcc7);background:transparent;',
  'color:var(--madder,#8a4447);font-family:"Montserrat",sans-serif;font-size:.7rem;font-weight:600;padding:9px;cursor:pointer}',
  '.bmclear:hover{background:var(--paper,#f7f2e5)}',
  '.verse.bm-flash{animation:bmflash 1.7s ease}',
  '@keyframes bmflash{0%,100%{background:transparent}16%{background:var(--paper-2,#f3eada)}}',
].join('');

export function init(): void {
  const poem = currentPoem();
  if (!poem) return;
  const main = document.getElementById('main');
  const navbar = document.querySelector<HTMLElement>('.navbar');
  const navInner = document.querySelector<HTMLElement>('.navbar-inner');
  if (!main || !navbar || !navInner) return;

  const KEY = 'asl-bm-' + poem.id;
  const POEM_NAME = esc(poem.titleEn);
  let saved = new Set<number>();
  const load = () => {
    const s = new Set<number>();
    try {
      const arr: unknown = JSON.parse(lsGet(KEY) || 'null');
      if (Array.isArray(arr)) for (const n of arr) { const k = Number(n); if (k) s.add(k); }
    } catch { /* corrupt — start empty */ }
    return s;
  };
  saved = load();
  const sorted = () => [...saved].sort((a, b) => a - b);
  const persist = () => lsSet(KEY, JSON.stringify(sorted()));

  const st = document.createElement('style');
  st.appendChild(document.createTextNode(CSS));
  document.head.appendChild(st);

  // index verses; give each a stable id and a ribbon toggle
  const verses = [...main.querySelectorAll<HTMLElement>('.verse')];
  const byN = new Map<number, HTMLElement>();
  for (const v of verses) {
    const vn = v.querySelector('.vn');
    if (!vn) continue;
    const n = parseInt(vn.textContent || '', 10);
    if (isNaN(n)) continue;
    v.id = 'v' + n; v.dataset.n = String(n); byN.set(n, v);
    const on = saved.has(n);
    if (on) v.classList.add('bookmarked');
    let row = v.querySelector(':scope > .verse-actions');
    if (!row) { row = document.createElement('div'); row.className = 'verse-actions'; v.appendChild(row); }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bm-verse-btn' + (on ? ' on' : '');
    btn.title = 'Bookmark this bayt';
    btn.setAttribute('aria-label', 'Bookmark this bayt');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.innerHTML = RIBBON;
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(n, v, btn); });
    row.insertBefore(btn, row.firstChild);
  }

  function toggle(n: number, v: HTMLElement, btn: HTMLElement) {
    if (saved.has(n)) { saved.delete(n); v.classList.remove('bookmarked'); btn.classList.remove('on'); btn.setAttribute('aria-pressed', 'false'); }
    else { saved.add(n); v.classList.add('bookmarked'); btn.classList.add('on'); btn.setAttribute('aria-pressed', 'true'); }
    persist(); renderList(); updateBadge();
  }

  // top-bar bookmark menu
  const wrap = document.createElement('div');
  wrap.className = 'bmmenu';
  wrap.innerHTML = '<button type="button" class="bmbtn" aria-haspopup="true" aria-expanded="false" title="Bookmarks" aria-label="Bookmarks">' + RIBBON + '<span class="bmbadge"></span></button><div class="bmpop" role="menu" aria-label="Bookmarks"></div>';
  const anchorEl = navInner.querySelector('.nav-menus') || document.getElementById('viewMenu');
  navInner.insertBefore(wrap, anchorEl && anchorEl.parentNode === navInner ? anchorEl : null);
  const bmBtn = wrap.querySelector<HTMLElement>('.bmbtn')!;
  const bmPop = wrap.querySelector<HTMLElement>('.bmpop')!;
  const bmBadge = wrap.querySelector<HTMLElement>('.bmbadge')!;
  // Move the popup to <body> so position:fixed is relative to the viewport.
  // (The nav bar's backdrop-filter would otherwise become its containing block.)
  document.body.appendChild(bmPop);

  function updateBadge() {
    const c = saved.size;
    bmBadge.textContent = c ? String(c) : '';
    bmBadge.style.display = c ? 'grid' : 'none';
  }
  function snippet(v: HTMLElement) {
    const s = v.querySelector('.hemi.sadr');
    const t = s ? (s.textContent || '').replace(/\s+/g, ' ').trim() : '';
    return esc(t.split(' ').slice(0, 4).join(' '));
  }
  function renderList() {
    const ns = sorted();
    if (!ns.length) {
      bmPop.innerHTML = '<div class="bmempty">No bookmarks yet.<br>Tap the ribbon on a verse to save your place.</div>';
      return;
    }
    let html = '<div class="bmhead">Bookmarks</div><div class="bmsub">' + POEM_NAME + '</div>';
    for (const n of ns) {
      const v = byN.get(n);
      html += '<button type="button" class="bmitem" data-n="' + n + '"><span class="bmn">' + n + '</span><span class="bmtxt">' + (v ? snippet(v) : ('Bayt ' + n)) + '</span></button>';
    }
    html += '<button type="button" class="bmclear">Clear all bookmarks</button>';
    bmPop.innerHTML = html;
  }
  renderList(); updateBadge();

  function placePop() {
    const r = bmBtn.getBoundingClientRect();
    bmPop.style.top = (r.bottom + 8) + 'px';
    const w = bmPop.offsetWidth;
    let left = r.right - w;                    // align to button's right edge...
    const max = window.innerWidth - 8 - w;     // ...but keep it on screen
    if (left > max) left = max;
    if (left < 8) left = 8;
    bmPop.style.left = left + 'px';
  }
  function openPop(o: boolean) {
    bmPop.classList.toggle('open', o);
    bmBtn.setAttribute('aria-expanded', o ? 'true' : 'false');
    if (o) placePop();
  }
  window.addEventListener('resize', () => { if (bmPop.classList.contains('open')) placePop(); });
  bmBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // close the view/PDF menus if open
    document.querySelectorAll('.menu-pop.open').forEach((d) => {
      d.classList.remove('open');
      d.parentElement?.querySelector('.navprint')?.setAttribute('aria-expanded', 'false');
    });
    openPop(!bmPop.classList.contains('open'));
  });
  bmPop.addEventListener('click', (e) => {
    const target = e.target as Element;
    const it = target.closest<HTMLElement>('.bmitem');
    if (it) { openPop(false); jumpTo(parseInt(it.dataset.n || '', 10)); return; }
    if (target.closest('.bmclear')) {
      saved = new Set(); persist();
      verses.forEach((v) => v.classList.remove('bookmarked'));
      main.querySelectorAll('.bm-verse-btn.on').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); });
      renderList(); updateBadge(); openPop(false);
    }
  });
  // capture-phase so it also closes when a stopPropagation menu button is clicked
  document.addEventListener('click', (e) => {
    const t = e.target as Element | null;
    if (!t?.closest?.('.bmmenu') && !t?.closest?.('.bmpop')) openPop(false);
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') openPop(false); });

  // re-render after a Restore (memorize.ts dispatches this once bookmarks are imported)
  document.addEventListener('asl-bm-updated', () => {
    saved = load();
    for (const v of verses) {
      const on = saved.has(parseInt(v.dataset.n || '', 10));
      v.classList.toggle('bookmarked', on);
      const b = v.querySelector(':scope > .verse-actions .bm-verse-btn');
      if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    }
    renderList(); updateBadge();
  });

  function jumpTo(n: number) {
    const el = byN.get(n);
    if (!el) return;
    /* A search filtering the page may be hiding this bayt, which would leave
       nothing to measure and land the reader at the top; show the matn whole
       first (as the chapter list does). */
    if (window.AslSearch?.isActive()) window.AslSearch.close();
    const off = (navbar!.offsetHeight || 0) + 10;
    const y = Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - off);
    const far = Math.abs(y - window.pageYOffset) > 1800;
    window.scrollTo({ top: y, behavior: far ? 'instant' : 'smooth' });
    /* A jump across the matn lands on an estimate — the chapters it arrives
       among have never been laid out (content-visibility), so their reserved
       height is a guess until the browser renders them, which it does on
       arrival and which moves the bayt we aimed at. Hold it until the page
       settles (chapter-nav.ts). */
    if (far) window.AslScrollSettle?.(el, off);
    el.classList.remove('bm-flash'); void el.offsetWidth; el.classList.add('bm-flash');
    el.addEventListener('animationend', () => el.classList.remove('bm-flash'), { once: true });
  }
}
