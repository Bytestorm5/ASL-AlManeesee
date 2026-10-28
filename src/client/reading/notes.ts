/* Personal notes for the reading page.
   A note (pencil) button on every verse lets the reader write their own note for
   that bayt. Saved notes show inline under the verse and can be edited or deleted.
   Notes are kept per matn on the device (localStorage 'asl-notes-<matn>') and are
   included in the Memorize-panel Back up / Restore, so they travel between devices. */
import { currentPoem, esc, lsGet, lsSet } from '../page.ts';

const PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const LIST_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h11M4 12h11M4 18h7"/><path d="M18.5 15.5 20 17l3-3.2"/></svg>';

const CSS = [
  '.note-verse-btn{flex:0 0 auto;display:inline-grid;place-items:center;width:26px;height:26px;padding:0;',
  'border-radius:50%;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447);',
  'cursor:pointer;transition:background .15s,border-color .15s,color .15s;-webkit-tap-highlight-color:transparent}',
  '.note-verse-btn:hover{border-color:var(--gilt,#c0973c);background:var(--paper,#f7f2e5)}',
  '.note-verse-btn svg{width:14px;height:14px;display:block}',
  '.note-verse-btn.on{background:var(--madder,#8a4447);color:#fff;border-color:var(--madder,#8a4447)}',
  '.verse-note{display:flex;gap:8px;align-items:flex-start;margin:10px 56px 2px;padding:10px 13px;border-radius:10px;',
  'background:#fbf7ee;border-left:3px solid var(--gilt,#c0973c);cursor:pointer;',
  'font-family:"Spectral",Georgia,serif;font-size:.92rem;line-height:1.62;color:var(--ink,#3a2a2b)}',
  '@media (max-width:640px){.verse-note{margin-left:10px;margin-right:10px}}',
  '.verse-note .vn-ic{flex:0 0 auto;color:var(--gilt-deep,#a97b21)}',
  '.verse-note .vn-ic svg{width:15px;height:15px;display:block;margin-top:2px}',
  '.verse-note .vn-txt{white-space:pre-wrap;overflow-wrap:anywhere}',
  '.noteov{position:fixed;inset:0;z-index:430;background:rgba(58,42,43,.5);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);',
  'display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .18s}',
  '.noteov.show{opacity:1}',
  '.notecard{width:100%;max-width:400px;background:var(--paper,#f9f4ea);border-radius:16px;',
  'box-shadow:0 24px 60px rgba(0,0,0,.4);padding:20px;font-family:"Montserrat",sans-serif}',
  '.notecard h3{font-family:"Cormorant Garamond",Georgia,serif;color:var(--madder,#8a4447);font-size:1.3rem;margin:0 0 2px}',
  '.notecard .notesub{color:var(--sage,#9c7f80);font-size:.72rem;font-weight:600;margin:0 0 12px}',
  '.notearea{width:100%;box-sizing:border-box;min-height:120px;border:1px solid var(--paper-edge,#e8dcc7);border-radius:10px;',
  'padding:11px;font-family:"Spectral",Georgia,serif;font-size:1.0rem;line-height:1.55;color:var(--ink,#3a2a2b);background:var(--surface,#fff);resize:vertical}',
  '.noteact{display:flex;gap:8px;margin-top:14px}',
  '.noteact button{cursor:pointer;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);border-radius:10px;padding:10px 14px;',
  'font-family:"Montserrat",sans-serif;font-size:.76rem;font-weight:700;color:var(--ink,#3a2a2b);-webkit-tap-highlight-color:transparent}',
  '.noteact .note-del{color:#a23b3b;border-color:#e3c3c3;margin-right:auto}',
  '.noteact .note-save{background:var(--madder,#8a4447);color:#fbeee8;border-color:var(--madder,#8a4447)}',
].join('');

const MENU_CSS = [
  '.ntmenu{position:relative;flex:0 0 auto}',
  // sit just after Bookmarks (order:4) and before the headphones (order:5),
  // and match the 30×30 size the nav gives its other icon buttons
  '.navbar-inner .ntmenu{order:4}',
  '.navbar-inner .ntbtn{width:30px;height:30px}',
  '.ntbtn{position:relative;cursor:pointer;display:inline-grid;place-items:center;width:34px;height:34px;padding:0;',
  'border-radius:50%;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447);',
  'transition:background .15s,border-color .15s;-webkit-tap-highlight-color:transparent}',
  '.ntbtn:hover{border-color:var(--gilt,#c0973c);background:var(--paper,#f7f2e5)}',
  '.ntbtn svg{width:17px;height:17px}',
  '.ntbadge{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:9px;',
  'background:var(--madder,#8a4447);color:#fff;font-family:"Montserrat",sans-serif;font-size:.58rem;font-weight:700;',
  'display:none;place-items:center;line-height:1}',
  '.ntpop{position:fixed;min-width:230px;max-width:min(330px,calc(100vw - 16px));max-height:70vh;overflow-y:auto;',
  'background:var(--surface,#fff);border:1px solid var(--paper-edge,#e8dcc7);border-radius:12px;box-shadow:0 12px 30px rgba(14,38,56,.16);',
  'padding:5px;display:none;z-index:70}',
  '.ntpop.open{display:block}',
  '.nthead{font-family:"Montserrat",sans-serif;font-size:.6rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;',
  'color:var(--sage,#9c7f80);padding:8px 10px 2px;display:flex;justify-content:space-between;align-items:baseline;gap:8px}',
  '.ntsub{font-family:"Cormorant Garamond",Georgia,serif;font-style:italic;font-size:.95rem;',
  'color:var(--madder,#8a4447);padding:0 10px 7px;margin-bottom:4px;border-bottom:1px solid var(--paper-edge,#e8dcc7)}',
  '.ntgrp{font-family:"Montserrat",sans-serif;font-size:.62rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;',
  'color:var(--gilt-deep,#a97b21);padding:10px 10px 3px}',
  '.ntitem{display:flex;align-items:flex-start;gap:9px;width:100%;text-align:left;border:0;background:transparent;',
  'padding:8px 10px;border-radius:8px;cursor:pointer;text-decoration:none}',
  '.ntitem:hover{background:var(--paper,#f7f2e5)}',
  '.ntitem .ntn{flex:0 0 auto;min-width:22px;height:22px;border-radius:50%;display:grid;place-items:center;margin-top:1px;',
  'background:var(--paper-2,#f3eada);color:var(--madder,#8a4447);font-family:"Cormorant Garamond",serif;font-weight:700;font-size:.8rem}',
  '.ntitem .nttxt{flex:1 1 auto;min-width:0;font-family:"Spectral",Georgia,serif;font-size:.86rem;line-height:1.4;color:var(--ink,#3a2a2b);',
  'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
  '.ntempty{padding:16px 12px;font-family:"Montserrat",sans-serif;font-size:.72rem;color:var(--ink-soft,#6c585a);line-height:1.55;text-align:center}',
  '.verse.nt-flash{animation:ntflash 1.7s ease}',
  '@keyframes ntflash{0%,100%{background:transparent}16%{background:#fbf3e2}}',
].join('');

/** A stored object map, or an empty one when it is missing or corrupt. */
function readMap<T>(key: string): Record<string, T> {
  try {
    const o: unknown = JSON.parse(lsGet(key) || 'null');
    if (o && typeof o === 'object' && !Array.isArray(o)) return o as Record<string, T>;
  } catch { /* corrupt — start empty */ }
  return {};
}

export function init(): void {
  const poem = currentPoem();
  if (!poem) return;
  const main = document.getElementById('main');
  const navbar = document.querySelector<HTMLElement>('.navbar');
  const navInner = document.querySelector<HTMLElement>('.navbar-inner');
  if (!main || !navbar) return;

  const KEY = 'asl-notes-' + poem.id;
  const TS_KEY = 'asl-notes-ts-' + poem.id;
  const POEM_NAME = esc(poem.titleEn);
  let notes = readMap<string>(KEY);
  // When each note was last edited — used to show the most recent ones across
  // mutūn. Kept in a separate key so the Back up / Restore of notes is
  // unaffected; notes without a timestamp (older, or restored) sort last.
  let noteTs = readMap<number>(TS_KEY);
  const persist = () => lsSet(KEY, JSON.stringify(notes));
  const persistTs = () => lsSet(TS_KEY, JSON.stringify(noteTs));
  const now = () => { try { return Date.now(); } catch { return 0; } };

  const st = document.createElement('style'); st.appendChild(document.createTextNode(CSS)); document.head.appendChild(st);

  const byN = new Map<number, HTMLElement>();
  const noteBtn = new Map<number, HTMLButtonElement>();
  for (const v of main.querySelectorAll<HTMLElement>('.verse')) {
    const vn = v.querySelector('.vn'); if (!vn) continue;
    const n = parseInt(vn.textContent || '', 10); if (isNaN(n)) continue;
    if (!v.id) v.id = 'v' + n;
    byN.set(n, v);
    let row = v.querySelector(':scope > .verse-actions');
    if (!row) { row = document.createElement('div'); row.className = 'verse-actions'; v.appendChild(row); }
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'note-verse-btn';
    btn.title = 'Write a note for this bayt'; btn.setAttribute('aria-label', 'Write a note for this bayt');
    btn.innerHTML = PENCIL;
    btn.addEventListener('click', (e) => { e.stopPropagation(); openEditor(n); });
    const bm = row.querySelector('.bm-verse-btn');
    if (bm && bm.nextSibling) row.insertBefore(btn, bm.nextSibling);
    else if (bm) row.appendChild(btn);
    else row.insertBefore(btn, row.firstChild);
    noteBtn.set(n, btn);
    renderVerse(n);
  }

  function renderVerse(n: number) {
    const v = byN.get(n); if (!v) return;
    const txt = notes[n];
    const btn = noteBtn.get(n);
    let block = v.querySelector<HTMLElement>(':scope > .verse-note');
    if (txt) {
      btn?.classList.add('on');
      if (!block) {
        block = document.createElement('div');
        block.className = 'verse-note';
        block.innerHTML = '<span class="vn-ic">' + PENCIL + '</span><span class="vn-txt" dir="auto"></span>';
        block.addEventListener('click', () => openEditor(n));
        const actions = v.querySelector(':scope > .verse-actions');
        if (actions) v.insertBefore(block, actions); else v.appendChild(block);
      }
      block.querySelector('.vn-txt')!.textContent = txt;
    } else {
      btn?.classList.remove('on');
      block?.remove();
    }
  }

  function openEditor(n: number) {
    const cur = notes[n] || '';
    const ov = document.createElement('div'); ov.className = 'noteov';
    ov.innerHTML = '<div class="notecard" role="dialog" aria-label="Note">'
      + '<h3>Your note</h3><p class="notesub">Verse ' + n + ' · ' + POEM_NAME + '</p>'
      + '<textarea class="notearea" dir="auto" placeholder="Write your note for this verse…"></textarea>'
      + '<div class="noteact">'
      + (cur ? '<button type="button" class="note-del">Delete</button>' : '')
      + '<button type="button" class="note-cancel">Cancel</button>'
      + '<button type="button" class="note-save">Save</button></div></div>';
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));
    const ta = ov.querySelector('textarea')!; ta.value = cur;
    setTimeout(() => ta.focus(), 60);
    const close = () => { ov.classList.remove('show'); setTimeout(() => ov.remove(), 180); };
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.note-cancel')!.addEventListener('click', close);
    ov.querySelector('.note-save')!.addEventListener('click', () => {
      const t = ta.value.trim();
      if (t) { notes[n] = t; noteTs[n] = now(); } else { delete notes[n]; delete noteTs[n]; }
      persist(); persistTs(); renderVerse(n); renderMenu(); close();
    });
    ov.querySelector('.note-del')?.addEventListener('click', () => {
      delete notes[n]; delete noteTs[n]; persist(); persistTs(); renderVerse(n); renderMenu(); close();
    });
  }

  // ---- top-bar Notes menu (this matn's notes) ----
  const mst = document.createElement('style'); mst.appendChild(document.createTextNode(MENU_CSS)); document.head.appendChild(mst);

  let ntBtn: HTMLElement | null = null, ntPop: HTMLElement | null = null, ntBadge: HTMLElement | null = null;
  function buildMenu() {
    if (!navInner) return;
    const menuWrap = document.createElement('div');
    menuWrap.className = 'ntmenu';
    menuWrap.innerHTML = '<button type="button" class="ntbtn" aria-haspopup="true" aria-expanded="false" title="Notes" aria-label="Your notes">' + LIST_IC + '<span class="ntbadge"></span></button><div class="ntpop" role="menu" aria-label="Your notes"></div>';
    // place right after the Bookmarks menu in source order; with order:4 above
    // this lands the Notes button between Bookmarks and the headphones button.
    const bm = navInner.querySelector(':scope > .bmmenu');
    if (bm) navInner.insertBefore(menuWrap, bm.nextSibling);
    else navInner.insertBefore(menuWrap, navInner.querySelector(':scope > .aud-launch') || navInner.querySelector(':scope > .nav-menus') || null);
    const btn = menuWrap.querySelector<HTMLElement>('.ntbtn')!;
    const pop = menuWrap.querySelector<HTMLElement>('.ntpop')!;
    ntBtn = btn; ntPop = pop; ntBadge = menuWrap.querySelector<HTMLElement>('.ntbadge');
    document.body.appendChild(pop);   // position:fixed relative to viewport, not the blurred navbar

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.menu-pop.open, .bmpop.open').forEach((el) => {
        el.classList.remove('open');
        el.parentElement?.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false');
      });
      openPop(!pop.classList.contains('open'));
    });
    pop.addEventListener('click', (e) => {
      const it = (e.target as Element).closest<HTMLElement>('.ntitem');
      if (!it) return;
      if (it.dataset.poem) return;                 // cross-matn link: let the browser navigate
      e.preventDefault(); openPop(false); jumpTo(parseInt(it.dataset.n || '', 10));
    });
    window.addEventListener('resize', () => { if (pop.classList.contains('open')) placePop(); });
    document.addEventListener('click', (e) => {
      const t = e.target as Element | null;
      if (!t?.closest?.('.ntmenu') && !t?.closest?.('.ntpop')) openPop(false);
    }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') openPop(false); });
  }
  function placePop() {
    if (!ntBtn || !ntPop) return;
    const r = ntBtn.getBoundingClientRect();
    ntPop.style.top = (r.bottom + 8) + 'px';
    const w = ntPop.offsetWidth, max = window.innerWidth - 8 - w;
    let left = r.right - w;
    if (left > max) left = max; if (left < 8) left = 8;
    ntPop.style.left = left + 'px';
  }
  function openPop(o: boolean) {
    if (!ntBtn || !ntPop) return;
    ntPop.classList.toggle('open', o); ntBtn.setAttribute('aria-expanded', o ? 'true' : 'false'); if (o) placePop();
  }

  function renderMenu() {
    if (!ntPop) return;
    const mine = Object.keys(notes).map(Number).filter((x) => !isNaN(x)).sort((a, b) => a - b);
    if (ntBadge) {
      ntBadge.textContent = mine.length ? String(mine.length) : '';
      ntBadge.style.display = mine.length ? 'grid' : 'none';
    }

    if (!mine.length) {
      ntPop.innerHTML = '<div class="ntempty">No notes yet.<br>Tap the ✎ pencil on any verse to write one.</div>';
      return;
    }
    let html = '<div class="nthead"><span>Your notes</span><span>' + mine.length + '</span></div>';
    html += '<div class="ntsub">' + POEM_NAME + '</div>';
    for (const n of mine) {
      html += '<button type="button" class="ntitem" data-n="' + n + '"><span class="ntn">' + n + '</span><span class="nttxt">' + esc(notes[n]) + '</span></button>';
    }
    ntPop.innerHTML = html;
  }

  function flash(el: HTMLElement) {
    el.classList.remove('nt-flash'); void el.offsetWidth; el.classList.add('nt-flash');
    el.addEventListener('animationend', () => el.classList.remove('nt-flash'), { once: true });
  }
  function scrollToEl(el: HTMLElement) {
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
    flash(el);
  }
  function jumpTo(n: number) {
    const el = byN.get(n); if (!el) return;
    // In memorize mode the chapters are hidden; open the note's chapter first,
    // then scroll to its verse once it's on screen.
    if (document.body.classList.contains('mz-on')) {
      const sec = el.closest('section.chapter');
      if (sec) document.dispatchEvent(new CustomEvent('asl-mz-goto', { detail: { id: sec.id } }));
      setTimeout(() => { if (el.getBoundingClientRect().width) scrollToEl(el); }, 360);
      return;
    }
    /* A search filtering the page may be hiding this bayt, which would leave
       nothing to measure and land the reader at the top; show the matn whole
       first (as the chapter list does). */
    if (window.AslSearch?.isActive()) window.AslSearch.close();
    scrollToEl(el);
  }

  buildMenu(); renderMenu();

  // re-render after a Restore (memorize.ts dispatches this once notes are imported)
  document.addEventListener('asl-notes-updated', () => {
    notes = readMap<string>(KEY);
    noteTs = readMap<number>(TS_KEY);
    for (const n of byN.keys()) renderVerse(n);
    renderMenu();
  });
}
