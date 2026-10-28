/* In-matn Arabic search for the reading page.
   Adds a search icon to the top bar; typing filters the verses to those whose
   Arabic text contains the query. Matching ignores diacritics (ḥarakāt) and
   normalises alef/hamza/yā/tā-marbūṭa variants, so users can type plain Arabic.

   It reads each hemistich's plain text (.hemi textContent), so it works
   whether or not a chapter's word-gloss spans have been built yet. */
import type { AslSearchApi } from '../globals.d.ts';

/** Arabic-aware normalisation, shared with the chapter list (chapter-nav.ts). */
export function norm(s: string | null | undefined): string {
  return (s || '').toLowerCase()
    // strip tashkil, dagger alef, Quranic marks, tatweel, and the zero-width
    // joiners that keep a word whole across a ramz's <span> (see
    // src/shared/poem-data.ts — nobody types those, so they must not block a match);
    // unify alef/hamza/ya/ta-marbuta.
    // \u escapes (not literal marks) so the combining characters can't get reordered
    // and swallow real letters if this line is ever re-edited.
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭـ‌‍]/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

/* A hemistich's words. The variant-reading asterisk a gloss span carries is
   not part of the text, so it must not split a phrase the reader typed. */
function hemiText(h: Element | null): string {
  if (!h) return '';
  if (!h.querySelector('.fn-mark')) return h.textContent || '';
  const c = h.cloneNode(true) as Element;
  c.querySelectorAll('.fn-mark').forEach((x) => x.remove());
  return c.textContent || '';
}

const CSS = [
  '.searchbtn{cursor:pointer;display:inline-grid;place-items:center;width:34px;height:34px;padding:0;',
  'border-radius:50%;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447);',
  'flex:0 0 auto;transition:background .15s,border-color .15s;-webkit-tap-highlight-color:transparent}',
  '.searchbtn:hover{border-color:var(--gilt,#c0973c);background:var(--paper,#f7f2e5)}',
  '.searchbtn svg{width:17px;height:17px}',
  // --maxw follows the page's own measure so the search field lines up with
  // the verses on a tablet instead of running wider than them.
  '.searchbar{display:none;align-items:center;gap:8px;max-width:var(--maxw,1140px);margin:0 auto;padding:0 16px 10px}',
  '.navbar.searchopen .searchbar{display:flex}',
  '.searchbar .field{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:8px;',
  'border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);border-radius:22px;padding:7px 14px}',
  '.searchbar .field svg{width:16px;height:16px;color:var(--sage,#9c7f80);flex:0 0 auto}',
  '.searchbar input{flex:1 1 auto;min-width:0;border:0;outline:0;background:transparent;',
  'font-size:1.05rem;color:var(--ink,#3a2a2b);direction:rtl;font-family:"Scheherazade New","Amiri",serif}',
  '.searchbar .cnt{font-family:"Montserrat",sans-serif;font-size:.66rem;font-weight:600;',
  'color:var(--sage,#9c7f80);white-space:nowrap;flex:0 0 auto;min-width:52px;text-align:center}',
  '.searchbar .cls{cursor:pointer;border:0;background:transparent;color:var(--madder,#8a4447);',
  'font-family:"Montserrat",sans-serif;font-size:.72rem;font-weight:700;flex:0 0 auto;padding:6px 4px}',
  '.search-hide{display:none!important}',
  'body.searching header.hero,body.searching .toc-wrap{display:none!important}',
].join('');

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';

export function init(): void {
  const navbar = document.querySelector<HTMLElement>('.navbar');
  const navInner = document.querySelector<HTMLElement>('.navbar-inner');
  const main = document.getElementById('main');
  const viewMenu = document.getElementById('viewMenu');
  if (!navbar || !navInner || !main) return;

  const st = document.createElement('style');
  st.appendChild(document.createTextNode(CSS));
  document.head.appendChild(st);

  // search toggle button
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'searchbtn';
  btn.title = 'Search the abyāt'; btn.setAttribute('aria-label', 'Search the abyāt');
  btn.innerHTML = ICON;
  const navMenus = navInner.querySelector('.nav-menus');
  if (navMenus) navInner.insertBefore(btn, navMenus);
  else if (viewMenu) navInner.insertBefore(btn, viewMenu); else navInner.appendChild(btn);

  // search bar (second row of the sticky nav)
  const bar = document.createElement('div');
  bar.className = 'searchbar';
  bar.innerHTML =
    '<span class="field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
    + '<input type="search" enterkeyhint="search" dir="rtl" lang="ar" placeholder="ابحث في الأبيات…" aria-label="Search the abyāt in Arabic"></span>'
    + '<span class="cnt" aria-live="polite"></span>'
    + '<button type="button" class="cls">Close</button>';
  navbar.appendChild(bar);

  const input = bar.querySelector('input')!;
  const cnt = bar.querySelector<HTMLElement>('.cnt')!;
  const cls = bar.querySelector<HTMLButtonElement>('.cls')!;

  // precompute normalised text per verse (Arabic couplet only)
  const verses = [...main.querySelectorAll<HTMLElement>('.verse')];
  const verseText = new Map<HTMLElement, string>();
  const index = (v: HTMLElement) => {
    verseText.set(v, norm(hemiText(v.querySelector('.hemi.sadr')) + ' ' + hemiText(v.querySelector('.hemi.ajuz'))));
  };
  verses.forEach(index);

  // precompute normalised chapter-title text per section (Arabic + English + transliteration)
  const chapters: HTMLElement[] = [];
  const sectionOf = new Map<HTMLElement, HTMLElement | null>();
  for (const v of verses) {
    const s = v.closest('section');
    sectionOf.set(v, s);
    if (s && !chapters.includes(s)) chapters.push(s);
  }
  const chapterText = new Map<HTMLElement, string>();
  for (const s of chapters) {
    chapterText.set(s, norm(['.ch-ar', '.ch-en', '.ch-tr'].map((sel) => s.querySelector(sel)?.textContent || '').join(' ')));
  }

  /* The data loader can patch a bayt's wording in place after load (an edit
     made in the Bayt Editor). Re-read that bayt, so search finds what is now
     on screen — unless memorize mode has taken its hemistichs over (the loader
     leaves those alone too, so the old text is still the right one). */
  document.addEventListener('asl-verse-patched', (e) => {
    const v = e.target as HTMLElement | null;
    if (!v || !verseText.has(v)) return;
    const hs = v.querySelectorAll<HTMLElement>('.hemi');
    if ([...hs].some((h) => h._mzTok)) return;
    index(v);
  });

  let searching = false;
  function apply(q: string) {
    const nq = norm(q);
    if (!nq) { reset(); return; }
    const wasSearching = searching; searching = true;
    document.body.classList.add('searching');
    // a chapter whose title matches shows in full (header + all its verses)
    const titleHit = new Set(chapters.filter((s) => (chapterText.get(s) || '').includes(nq)));
    let count = 0;
    for (const v of verses) {
      const s = sectionOf.get(v);
      const hit = (!!s && titleHit.has(s)) || (verseText.get(v) || '').includes(nq);
      v.classList.toggle('search-hide', !hit);
      if (hit) count++;
    }
    // hide sections that neither match by title nor have any visible verse
    for (const s of chapters) {
      s.classList.toggle('search-hide', !titleHit.has(s) && !s.querySelector('.verse:not(.search-hide)'));
    }
    cnt.textContent = count ? (count + (count === 1 ? ' result' : ' results')) : 'No matches';
    if (!wasSearching) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }
  function reset() {
    searching = false;
    document.body.classList.remove('searching');
    verses.forEach((v) => v.classList.remove('search-hide'));
    main!.querySelectorAll('section.search-hide').forEach((s) => s.classList.remove('search-hide'));
    cnt.textContent = '';
  }
  function close() {
    navbar!.classList.remove('searchopen');
    input.value = ''; reset();
    // focusing the RTL search input can make mobile browsers auto-scroll the
    // page horizontally to keep it in view; that offset never resets on its
    // own, so the reading view stays shifted and clipped after closing search.
    window.scrollTo({ top: window.scrollY, left: 0, behavior: 'instant' });
  }

  let t: number | undefined;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = window.setTimeout(() => apply(input.value), 120);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  cls.addEventListener('click', close);
  btn.addEventListener('click', () => {
    const open = navbar.classList.toggle('searchopen');
    if (open) setTimeout(() => input.focus(), 50);
    else close();
  });

  // Let other nav (e.g. the jump-to-chapter dropdown) exit search cleanly, so
  // jumping to a chapter shows it in full instead of the filtered results.
  const api: AslSearchApi = { close, reset, isActive: () => searching };
  window.AslSearch = api;
}
