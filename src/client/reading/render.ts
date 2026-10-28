/* The reading page renderer — one for every matn.

   The seven pages this replaces each carried their own copy of this script,
   which had drifted apart; this is their union, switched per matn by its
   registration (src/poems/registry.ts):

     · word-by-word glosses (English `g`, Urdu `gu`), variant-reading
       footnotes, red ink by word position, rumūz drawn above a word;
     · English and Urdu translations, the Arabic inside the Urdu set in the
       Arabic face (arabicInUrdu), word-list abyāt (kindLabels);
     · explanation cards (explanations), editions with a compare card on
       every bayt that differs (nuskhas), per-chapter PDFs (pdf.chapters).

   It renders from window.ASL_CH, set by /api/poems/<id>/data.js — a blocking
   script, so the verses are in the DOM before any feature module runs.

   Long mutūn stay fast the way the 1,173-bayt Shāṭibiyyah page did: every
   chapter is content-visibility:auto with a reserved height, verses render as
   plain text first, and the gloss spans (thousands of them) are built one
   chapter at a time as it nears the viewport. */
import { siteHost } from '../../config/site.ts';
import type { Chapter, PoemConfig, Verse, VerseVariant, WordCell } from '../../poems/types.ts';
import { audioSetId } from '../../poems/index.ts';
import { esc, lsGet, lsSet } from '../page.ts';
import { BTN as EXP_BTN, card as expCardFor, langsOf as expLangs } from './explanation.ts';
import { arInUrdu } from './urdu-face.ts';

/* ── hemistichs ───────────────────────────────────────────────────────── */

const attr = (t: string | undefined) => (t || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The full markup of a hemistich: its word cells (with glosses) when it has
    them, otherwise the plain string with any red-ink words marked. Shared
    with the data loader, so a live patch renders exactly as the page did. */
export function hemiHTML(cells: WordCell[] | null | undefined, plain: string, reds?: number[] | null): string {
  const RS = new Set(reds || []);
  if (Array.isArray(cells) && cells.length) {
    return cells.map((s, ix) => {
      const g = attr(s.g), gu = attr(s.gu), fn = attr(s.fn);
      const fnMark = fn ? `<sup class="seg fn-mark" data-g="Variant reading: ${fn}" tabindex="0">*</sup>` : '';
      return `<span class="seg${RS.has(ix) ? ' rd' : ''}${g || gu ? '' : ' nog'}"`
        + `${g ? ` data-g="${g}"` : ''}${gu ? ` data-gu="${gu}"` : ''} tabindex="0">${s.w}</span>${fnMark}`;
    }).join(' ');
  }
  if (RS.size) return plain.split(/\s+/).map((w, ix) => (RS.has(ix) ? `<span class="rd">${w}</span>` : w)).join(' ');
  return plain;
}

/** What a hemistich shows before its chapter's gloss spans are built. */
function plainHemi(cells: WordCell[] | null | undefined, plain: string, reds?: number[] | null): string {
  return Array.isArray(cells) && cells.length ? plain : hemiHTML(null, plain, reds);
}

/* ── editions ─────────────────────────────────────────────────────────── */

interface Editions {
  names: string[];
  active: number;
  audioNuskha: number;
  /** Edition-1 wording of every bayt some edition changes. */
  orig: Record<string, { sadr: string; ajuz: string }>;
  variants: Record<string, Record<string, VerseVariant>>;
  store: string;
}

/* The matn circulates in more than one nuskha; they differ in a handful of
   abyāt. Edition 1 is the stored text; later editions list their wording
   under the document's `variants`. When a variant omits word cells/red-word
   indexes the base ones are dropped for that bayt, so glosses can never
   disagree with the wording shown. The choice persists per device; switching
   reloads the page so every feature initialises against one consistent text. */
function applyEditions(p: PoemConfig, CH: Chapter[]): Editions | null {
  const names = p.nuskhas && p.nuskhas.length > 1 ? p.nuskhas : null;
  if (!names) return null;
  const store = 'asl-nuskha-' + p.id;
  let active = 1;
  try { active = Math.max(1, Math.min(names.length, parseInt(lsGet(store) || '', 10) || 1)); } catch { /* 1 */ }
  const variants = window.ASL_VARIANTS ?? {};
  const ed: Editions = { names, active, audioNuskha: p.audioNuskha ?? 1, orig: {}, variants, store };

  const all = new Set<string>();
  for (const byBayt of Object.values(variants)) for (const n of Object.keys(byBayt ?? {})) all.add(n);
  const act = variants[String(active)] ?? {};
  for (const n of all) {
    for (const ch of CH) {
      const v = ch.verses.find((x) => String(x.n) === n);
      if (!v) continue;
      ed.orig[n] = { sadr: v.sadr, ajuz: v.ajuz };
      const o = act[n];
      if (o) {
        if (o.sadr != null) v.sadr = o.sadr;
        if (o.ajuz != null) v.ajuz = o.ajuz;
        v.sadrW = o.sadrW || null; v.ajuzW = o.ajuzW || null;
        v.sr = o.sr || null; v.jr = o.jr || null;
        if (o.tr != null) v.tr = o.tr;
        if (o.exp != null) v.exp = o.exp;
      }
      break;
    }
  }
  return ed;
}

/* ── the page ─────────────────────────────────────────────────────────── */

const COPY_ICONS = '<svg class="ic ic-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V5a2 2 0 0 1 2-2h8"></path></svg><svg class="ic ic-done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"></path></svg><span class="lbl">Copied</span>';
const COMPARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>';

/** Arabic agreement: 1 بيت · 2 بيتان · 3–10 أبيات · 11+ بيتًا, isolated in the Arabic face. */
const abyat = (n: number) => '<span class="tc-abyat" dir="rtl">'
  + (n === 1 ? 'بيت' : n === 2 ? 'بيتان' : n <= 10 ? n + ' أبيات' : n + ' بيتًا') + '</span>';

/** Render the matn on this page. Returns false when there is no text to render. */
export function renderPoem(p: PoemConfig): boolean {
  const CH: Chapter[] = Array.isArray(window.ASL_CH) ? window.ASL_CH : [];
  const CH_V = window.ASL_CH_V || 0;
  window.ASL_POEM = { poem: p.id, config: p, snapshot: CH, snapshotVersion: CH_V };

  const editions = applyEditions(p, CH);
  /* Each edition has its own recording set: edition 1 plays the matn's own,
     later ones read from <id>-n<k> and stay silent until recordings exist. */
  window.ASL_AUDIO_POEM = audioSetId(p.id, editions?.active ?? 1);

  const main = document.getElementById('main')!;
  const chapterCount = document.getElementById('chapterCount');
  if (chapterCount) chapterCount.textContent = String(CH.length);
  if (!CH.length) return false;

  const urdu = (s: string) => (p.arabicInUrdu ? arInUrdu(s) : s);
  const expBy = p.explanations?.by;
  const expCard = (v: Verse) => expCardFor(
    p.arabicInUrdu && v.exp && typeof v.exp === 'object' && v.exp.ur
      ? { ...v, exp: { ...v.exp, ur: arInUrdu(v.exp.ur) } }
      : v,
    expBy,
  );

  /* ── contents and pills ── */
  const tocGrid = document.getElementById('tocGrid');
  const pills = document.getElementById('pills');
  for (const ch of CH) {
    if (tocGrid) {
      const a = document.createElement('a');
      a.className = 'toc-card'; a.href = '#ch' + ch.i;
      a.innerHTML = `<span class="toc-num"><span>${ch.i}</span></span>
        <span class="tc-body">
          <span class="tc-ar">${ch.ar}</span>
          ${ch.en ? `<span class="tc-en">${ch.en}</span>` : ''}
          <span class="tc-meta">${ch.tr ? ch.tr + ' · ' : ''}${abyat(ch.verses.length)}</span>
        </span>`;
      tocGrid.appendChild(a);
    }
    if (pills) {
      const pl = document.createElement('a');
      pl.className = 'pill'; pl.href = '#ch' + ch.i; pl.dataset.i = String(ch.i);
      pl.innerHTML = `<span class="pn">${ch.i}</span>${ch.en ? ch.en : `<span class="ar">${ch.ar}</span>`}`;
      pills.appendChild(pl);
    }
  }
  /* A matn in a single chapter has nothing to navigate between. */
  if (CH.length < 2) document.body.classList.add('single-chapter');

  /* ── chapters ── */
  /* Rough height of one rendered bayt, used only to reserve space for
     chapters not laid out yet: stacked on a phone a bayt is much taller than
     side by side on a wide screen. */
  const CH_ROW = matchMedia('(max-width:640px)').matches ? 210 : 130;
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const lazy: { sec: HTMLElement; verses: Verse[]; done?: boolean }[] = [];

  for (const ch of CH) {
    const sec = document.createElement('section');
    sec.className = 'chapter'; sec.id = 'ch' + ch.i;
    /* Let the browser skip layout and paint for chapters nowhere near the
       viewport; `auto` remembers the real height once rendered. */
    sec.style.contentVisibility = 'auto';
    sec.style.containIntrinsicSize = `auto ${ch.verses.length * CH_ROW + 300}px`;
    const pdfs = p.pdf?.chapters
      ? `<span class="ch-pdf-grp"><a class="ch-pdf" href="/pdf/${p.id}/ch-${pad2(ch.i)}.pdf" download title="Download this chapter — Arabic only (PDF)">⤓ PDF</a><a class="ch-pdf" href="/pdf/${p.id}/ch-${pad2(ch.i)}-en.pdf" download title="Download this chapter — Arabic + English (PDF)">⤓ PDF + EN</a></span>`
      : '';
    let inner = `<div class="ch-head">
        <span class="ch-medallion" role="img" aria-label="al-Asl emblem"></span>
        <div class="ch-eyebrow">Chapter ${ch.i} of ${CH.length} (Abyāt ${ch.verses.length})</div>
        <div class="ch-ar">${ch.ar}</div>
        ${ch.en ? `<div class="ch-en">${ch.en}</div>` : ''}
        ${ch.tr ? `<div class="ch-tr">${ch.tr}</div>` : ''}
        ${ch.desc ? `<div class="ch-desc">${ch.desc}</div>` : ''}
        ${pdfs}
      </div>`;
    // chapter-level explanatory note (memory-aid chapters, orthography lists, …)
    if (ch.note) inner += `<div class="note"><span class="ic">❧</span><span>${ch.note}</span></div>`;
    inner += '<div class="verses">';
    for (const v of ch.verses) {
      const med = `<span class="medallion"><span class="vn">${v.n}</span></span>`;
      const expBtn = expLangs(v).length ? EXP_BTN : '';
      let trBlock: string;
      const kindLabel = v.kind ? p.kindLabels?.[v.kind] ?? '' : '';
      if (v.kind) {
        trBlock = `${kindLabel ? `<div class="wl-tag">${esc(kindLabel)}</div>` : ''}${expBtn}`;
      } else {
        /* A bayt with no translation of its own (the author translated a pair
           together) gets no row at all rather than an empty one. The book
           button rides on the English row; with no English, on the Urdu one. */
        const urRow = v.ur
          ? `<div class="translation-ur" dir="rtl" lang="ur"><span class="leaf">❧</span><span class="tr-text">${urdu(v.ur)}</span>${v.tr ? '' : expBtn}</div>`
          : '';
        const enRow = v.tr || (expBtn && !v.ur)
          ? `<div class="translation"><span class="leaf">❧</span><span class="tr-text">${v.tr || ''}</span>${expBtn}</div>`
          : '';
        trBlock = enRow + urRow;
      }
      inner += `<div class="verse${v.kind ? ' wl' : ''}${v.sadrW || v.ajuzW ? ' has-wbw' : ''}${v.tr ? ' has-tr' : ''}">
          <div class="couplet">
            <div class="hemi sadr">${plainHemi(v.sadrW, v.sadr, v.sr)}</div>
            ${med}
            <div class="hemi ajuz">${plainHemi(v.ajuzW, v.ajuz, v.jr)}</div>
          </div>
          ${trBlock}
          ${expCard(v)}
        </div>`;
    }
    inner += '</div>';
    sec.innerHTML = inner;
    main.appendChild(sec);
    if (ch.verses.some((v) => v.sadrW?.length || v.ajuzW?.length)) lazy.push({ sec, verses: ch.verses });
  }

  wireLazyGlosses(lazy);
  wireCopyButtons(p);
  if (editions) wireEditions(editions);
  wireMenus(CH);
  wireGlossTaps();
  wireAnchors();
  wireScrollSpy(main);
  return true;
}

/* Build a chapter's word-by-word spans as it nears the viewport. Skips
   hemistichs memorize mode has taken over (its own word units). Tells the
   fitter afterwards: the spans' padding is part of the line. */
function wireLazyGlosses(work: { sec: HTMLElement; verses: Verse[]; done?: boolean }[]): void {
  const upgrade = (rec: (typeof work)[number]) => {
    if (rec.done) return;
    rec.done = true;
    const els = rec.sec.querySelectorAll<HTMLElement>('.verse');
    rec.verses.forEach((v, i) => {
      const el = els[i];
      if (!el) return;
      const sadr = el.querySelector<HTMLElement>('.hemi.sadr'), ajuz = el.querySelector<HTMLElement>('.hemi.ajuz');
      if (sadr && !sadr._mzTok && v.sadrW?.length) sadr.innerHTML = hemiHTML(v.sadrW, v.sadr, v.sr);
      if (ajuz && !ajuz._mzTok && v.ajuzW?.length) ajuz.innerHTML = hemiHTML(v.ajuzW, v.ajuz, v.jr);
    });
    rec.sec.dispatchEvent(new CustomEvent('asl-verse-patched', { bubbles: true }));
  };
  if (!work.length) return;
  if (!('IntersectionObserver' in window)) { work.forEach(upgrade); return; }
  const bySec = new Map(work.map((r) => [r.sec, r]));
  const obs = new IntersectionObserver((ents) => {
    for (const e of ents) {
      if (!e.isIntersecting) continue;
      const rec = bySec.get(e.target as HTMLElement);
      if (rec) upgrade(rec);
      obs.unobserve(e.target);
    }
  }, { rootMargin: '600px 0px' });
  for (const r of work) obs.observe(r.sec);
  /* Search, bookmarks, a jump: anything that needs a chapter's spans now. */
  document.addEventListener('asl-need-glosses', (e) => {
    const sec = (e.target as Element | null)?.closest?.('section.chapter') as HTMLElement | null;
    const rec = sec && bySec.get(sec);
    if (rec) upgrade(rec);
  });
}

/* Copy a single bayt: the Arabic, whichever translations are shown, and a
   short reference. A small button under every verse. */
function wireCopyButtons(p: PoemConfig): void {
  // The zero-width joiners that keep a word whole across a ramz's <span> are
  // invisible on screen but would ride along into a paste, so they come off.
  const norm = (s: string | null | undefined) => (s || '').replace(/[‌‍]/g, '').replace(/\s+/g, ' ').trim();
  const shown = (el: Element | null) => !!el && getComputedStyle(el).display !== 'none';
  const trans = (el: Element | null) => {
    if (!el || !shown(el)) return '';
    const c = el.cloneNode(true) as Element;
    c.querySelectorAll('.leaf,.exp-toggle').forEach((x) => x.remove());
    return norm(c.textContent);
  };
  const baytText = (v: Element) => {
    const sadr = norm(v.querySelector('.hemi.sadr')?.textContent);
    const ajuz = norm(v.querySelector('.hemi.ajuz')?.textContent);
    const parts = [[sadr, ajuz].filter(Boolean).join('\n')];
    const tr = [trans(v.querySelector('.translation')), trans(v.querySelector('.translation-ur'))].filter(Boolean).join('\n');
    if (tr) parts.push(tr);
    const n = norm(v.querySelector('.vn')?.textContent);
    parts.push('— ' + p.titleEn + (n ? ' · bayt ' + n : '') + ' · ' + siteHost());
    return parts.join('\n\n');
  };
  const copy = async (t: string) => {
    try { await navigator.clipboard.writeText(t); return true; } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '-1000px';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy'); ta.remove(); return ok;
      } catch { return false; }
    }
  };
  for (const v of document.querySelectorAll('#main .verse')) {
    if (v.querySelector(':scope > .verse-actions')) continue;
    const row = document.createElement('div'); row.className = 'verse-actions';
    const btn = document.createElement('button') as HTMLButtonElement & { _t?: number };
    btn.type = 'button'; btn.className = 'copy-btn';
    btn.title = 'Copy this bayt'; btn.setAttribute('aria-label', 'Copy this bayt');
    btn.innerHTML = COPY_ICONS;
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (await copy(baytText(v))) {
        btn.classList.add('copied'); clearTimeout(btn._t);
        btn._t = window.setTimeout(() => btn.classList.remove('copied'), 1600);
      }
    });
    const exp = v.querySelector('.exp-toggle'); if (exp) row.appendChild(exp);
    row.appendChild(btn);
    const expBlock = v.querySelector('.explanation');
    if (expBlock) v.insertBefore(row, expBlock); else v.appendChild(row);
  }
}

/* ⇄ compare markers on abyāt that differ between editions. The picker itself
   lives in the ⋯ More menu, through the window.AslNuskha hook set here. */
function wireEditions(ed: Editions): void {
  const { names } = ed;
  const setNuskha = (i: number | string) => {
    const k = Math.max(1, Math.min(names.length, parseInt(String(i), 10) || 1));
    if (k === ed.active) return;
    lsSet(ed.store, String(k));
    location.reload();
  };
  window.AslNuskha = { names, active: ed.active, set: setNuskha };
  const ns = Object.keys(ed.orig);
  if (!ns.length) return;
  const byN: Record<string, Element> = {};
  for (const v of document.querySelectorAll('#main .verse')) {
    const vn = v.querySelector('.vn'); if (vn) byN[(vn.textContent || '').trim()] = v;
  }
  const strip = (s: string | undefined) => esc(String(s ?? '').replace(/<[^>]*>/g, ''));
  const textFor = (k: number, n: string) => {
    const base = ed.orig[n] ?? { sadr: '', ajuz: '' };
    const o = ed.variants[String(k)]?.[n];
    return { sadr: o?.sadr ?? base.sadr, ajuz: o?.ajuz ?? base.ajuz };
  };
  let ov: HTMLElement | null = null;
  const closeCmp = () => {
    if (!ov) return;
    ov.classList.remove('show');
    const o = ov; ov = null;
    setTimeout(() => o.remove(), 180);
  };
  const openCompare = (n: string) => {
    closeCmp();
    const el = document.createElement('div'); el.className = 'nkov'; ov = el;
    const panels = names.map((nm, ix) => {
      const t = textFor(ix + 1, n), cur = ed.active === ix + 1;
      const lines = [t.sadr, t.ajuz].filter(Boolean).map(strip).join('<br>');
      return `<div class="nk-cmp${cur ? ' cur' : ''}"><div class="nk-tag">${esc(nm)}${cur ? ' · showing' : ''}</div><div class="nk-ar" dir="rtl" lang="ar">${lines}</div></div>`;
    }).join('');
    const switches = names.map((nm, ix) => (ed.active === ix + 1 ? ''
      : `<button type="button" class="nk-switch" data-nk="${ix + 1}">Read in ${esc(nm)}</button>`)).join('');
    el.innerHTML = `<div class="nkcard" role="dialog" aria-modal="true" aria-label="Compare nuskhas">
      <h3>Bayt ${esc(n)} — the nuskhas</h3>${panels}
      <p class="nk-note">The recitation follows ${esc(names[ed.audioNuskha - 1] ?? names[0])} in this bayt.</p>
      ${switches}
      <button type="button" class="nk-cancel">Close</button></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el) closeCmp(); });
    el.querySelectorAll<HTMLElement>('.nk-switch').forEach((b) => b.addEventListener('click', () => setNuskha(b.dataset.nk || '1')));
    el.querySelector('.nk-cancel')?.addEventListener('click', closeCmp);
    requestAnimationFrame(() => ov?.classList.add('show'));
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCmp(); });
  for (const n of ns) {
    const actions = byN[n]?.querySelector(':scope > .verse-actions');
    if (!actions) continue;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'nk-mark';
    b.title = 'This bayt differs between nuskhas'; b.setAttribute('aria-label', 'This bayt differs between nuskhas — compare');
    b.innerHTML = COMPARE_ICON;
    b.addEventListener('click', (e) => { e.stopPropagation(); openCompare(n); });
    actions.insertBefore(b, actions.firstChild);
  }
}

/* Dropdown menus (translation view + PDF), one open at a time, and the
   translation choice — remembered per device. */
function wireMenus(CH: Chapter[]): void {
  const closeAll = (except?: Element) => {
    document.querySelectorAll('.menu-pop.open').forEach((d) => {
      if (d === except) return;
      d.classList.remove('open');
      d.parentElement?.querySelector('.navprint')?.setAttribute('aria-expanded', 'false');
    });
  };
  const wire = (btn: HTMLElement | null, pop: HTMLElement | null) => {
    if (!btn || !pop) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !pop.classList.contains('open'); closeAll(pop);
      pop.classList.toggle('open', open); btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  };
  document.addEventListener('click', (e) => { if (!(e.target as Element | null)?.closest?.('.menu')) closeAll(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });

  // Arabic is always shown, so only the translations that exist are listed.
  const hasEn = CH.some((c) => c.verses.some((v) => v.tr));
  const hasUr = CH.some((c) => c.verses.some((v) => v.ur));
  const langs = [...(hasEn ? [{ k: 'en', label: 'English' }] : []), ...(hasUr ? [{ k: 'ur', label: 'Urdu' }] : [])];
  const viewBtn = document.getElementById('viewBtn'), viewDrop = document.getElementById('viewDrop');
  let active = new Set<string>();
  const s = lsGet('asl-tr');
  active = new Set((s || '').split(',').filter(Boolean));
  const applyView = () => {
    const en = active.has('en'), ur = active.has('ur');
    const m = en && ur ? 'both' : en ? 'en' : ur ? 'ur' : 'ar';
    document.body.classList.remove('view-ar', 'view-en', 'view-ur', 'view-both');
    document.body.classList.add('view-' + m);
    if (viewDrop) for (const b of viewDrop.children) {
      const on = active.has((b as HTMLElement).dataset.k || '');
      b.classList.toggle('active', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    lsSet('asl-tr', [...active].join(','));
  };
  if (viewDrop) {
    for (const t of langs) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.k = t.k; b.setAttribute('role', 'menuitemcheckbox');
      b.innerHTML = `<span class="tick">✓</span>${t.label}`; b.setAttribute('aria-checked', 'false');
      b.addEventListener('click', () => {
        if (active.has(t.k)) active.delete(t.k); else active.add(t.k);
        applyView(); setTimeout(() => closeAll(), 160);
      });
      viewDrop.appendChild(b);
    }
    // No translation at all: nothing to choose, so no menu.
    if (!langs.length) document.getElementById('viewMenu')?.setAttribute('hidden', '');
  }
  applyView();
  wire(viewBtn, viewDrop);

  const pdfBtn = document.getElementById('pdfBtn'), pdfDrop = document.getElementById('pdfDrop');
  wire(pdfBtn, pdfDrop);
  pdfDrop?.addEventListener('click', (e) => { if ((e.target as Element).closest('a')) closeAll(); });
}

/* Word-by-word gloss: tap a word for its meaning (mobile) / hover (desktop),
   one at a time. Delegated, because the spans are built lazily per chapter. */
function wireGlossTaps(): void {
  let openSeg: Element | null = null;
  const closeSeg = () => { if (openSeg) { openSeg.classList.remove('seg-show'); openSeg = null; } };
  const toggleSeg = (seg: Element) => { const was = seg === openSeg; closeSeg(); if (!was) { seg.classList.add('seg-show'); openSeg = seg; } };
  document.addEventListener('click', (e) => {
    const seg = (e.target as Element | null)?.closest?.('.hemi .seg');
    if (seg) toggleSeg(seg); else closeSeg();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const seg = (e.target as Element | null)?.closest?.('.hemi .seg'); if (!seg) return;
    e.preventDefault(); toggleSeg(seg);
  });
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'mouse' && (e.target as Element | null)?.closest?.('.hemi .seg')) closeSeg();
  });
}

/* In-page links (contents cards, the pill bar): scroll manually with a
   sticky-nav offset. iOS Safari is unreliable at jumping to a #fragment on a
   very tall page, and a native jump would hide the heading under the bar. */
function wireAnchors(): void {
  const stickyNav = document.querySelector<HTMLElement>('.navbar');
  document.addEventListener('click', (e) => {
    const link = (e.target as Element | null)?.closest?.('a[href^="#"]'); if (!link) return;
    const id = decodeURIComponent((link.getAttribute('href') || '').slice(1)); if (!id) return;
    const target = document.getElementById(id); if (!target) return;
    e.preventDefault();
    const offset = (stickyNav ? stickyNav.offsetHeight : 0) + 10;
    const y = Math.max(0, target.getBoundingClientRect().top + window.pageYOffset - offset);
    // smooth for nearby targets; instant for long hops (smooth-scrolling
    // thousands of pixels is slow and unreliable, especially on iOS)
    const behavior: ScrollBehavior = Math.abs(y - window.pageYOffset) > 1800 ? 'instant' : 'smooth';
    window.scrollTo({ top: y, behavior });
    history.replaceState(null, '', '#' + id);
    /* A long hop lands on an estimate: the chapters it arrives among have only
       their reserved height until laid out. chapter-nav holds the aim. */
    if (behavior === 'instant') window.AslScrollSettle?.(target, offset);
  });
}

/* Scroll-spy for the pills, fade-in on arrival, back to top. */
function wireScrollSpy(main: HTMLElement): void {
  const pillEls = [...document.querySelectorAll<HTMLElement>('.pill')];
  const spy = new IntersectionObserver((ents) => {
    for (const en of ents) {
      if (!en.isIntersecting) continue;
      const id = en.target.id.replace('ch', '');
      pillEls.forEach((pl) => pl.classList.toggle('active', pl.dataset.i === id));
      pillEls.find((pl) => pl.dataset.i === id)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
  document.querySelectorAll('.chapter').forEach((s) => spy.observe(s));

  /* The hidden state is a class on #main rather than inline styles written on
     every verse: that pass was slow in itself on a long matn. */
  if (!matchMedia('(prefers-reduced-motion:reduce)').matches) {
    const reveal = new IntersectionObserver((ents, obs) => {
      for (const en of ents) if (en.isIntersecting) { en.target.classList.add('shown'); obs.unobserve(en.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.04 });
    main.classList.add('reveal-on');
    document.querySelectorAll('.verse, .ch-head').forEach((el) => reveal.observe(el));
  }

  const totop = document.getElementById('totop');
  if (totop) {
    addEventListener('scroll', () => totop.classList.toggle('show', scrollY > 700), { passive: true });
    totop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
  }
}
