/* Home: memorization progress and today's goal on each matn row, the study
   stats strip, "Your bookmarks" across every matn, "Continue where you left
   off", and the gentle reveal of the cards further down.

   The matn rows themselves are built at build time from the registry
   (src/pages/index.astro); everything here reads what the reading pages left
   in localStorage, so it is all per device. With no matn listed yet the page
   shows its "being prepared" card instead, and none of this has anything to
   draw. */
import { esc, listedPoems, lsJSON, poemHref } from './page.ts';

interface MatnMeta { en: string; cls: string }
/** asl-mz-prog-<id>, written by memorize mode. s: 1 = learning, 2 = memorized. */
interface MzProgress {
  v?: Record<string, { s?: number; due?: string } | null>;
  goal?: { date?: string; done?: number };
}
/** asl-last, written by the reading page as you read. */
interface LastVisit { poem?: string; mode?: string; n?: number }

function fmt(d: Date): string {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function goalTarget(poem: string): number {
  try { const v = parseInt(localStorage.getItem('asl-mz-goal-target-' + poem) || '', 10); if (v >= 1 && v <= 50) return v; } catch { /* ignore */ }
  try { const legacy = parseInt(localStorage.getItem('asl-mz-goal-target') || '', 10); if (legacy >= 1 && legacy <= 50) return legacy; } catch { /* ignore */ }
  return 3;
}

/* Chapter names for the bookmarks card. They are content (stored in R2, not
   in the code), so the home page cannot know them by itself; the reading page
   leaves a small index of each matn's chapters in localStorage when it renders
   — asl-chidx-<id>: [[first bayt, Arabic title], …] in bayt order — and a
   bookmark always comes from a page that has been opened. Without that index
   the row simply reads "Bayt N". */
function chapterOf(poem: string, n: number): string {
  const idx = lsJSON<unknown>('asl-chidx-' + poem);
  if (!Array.isArray(idx)) return '';
  let t = '';
  for (const e of idx) {
    if (!Array.isArray(e) || typeof e[0] !== 'number' || typeof e[1] !== 'string') continue;
    if (e[0] <= n) t = e[1]; else break;
  }
  return t;
}

export function init(): void {
  const META: Record<string, MatnMeta> = {};
  for (const p of listedPoems()) META[p.id] = { en: p.shortEn, cls: 'm-' + p.accent };
  const todayY = fmt(new Date());

  function renderMatnRow(row: HTMLElement): void {
    const poem = row.getAttribute('data-poem') || '';
    const total = +(row.getAttribute('data-total') || 0) || 0;
    const prog = lsJSON<MzProgress>('asl-mz-prog-' + poem);
    if (prog && prog.v && total) {
      let mastered = 0, learning = 0;
      Object.keys(prog.v).forEach((k) => { const s = prog.v![k]?.s; if (s === 2) mastered++; else if (s === 1) learning++; });
      const wrap = row.querySelector<HTMLElement>('.mr-prog');
      if ((mastered || learning) && wrap) {
        wrap.hidden = false;
        const bar = wrap.querySelector<HTMLElement>('.bar i');
        if (bar) bar.style.width = Math.max(1.5, 100 * mastered / total) + '%';
        const pct = wrap.querySelector('.pct');
        if (pct) pct.textContent = mastered + '/' + total + ' memorized';
        wrap.title = mastered + ' of ' + total + ' abyāt memorized';
      }
    }
    // Always shown (even at 0/target) so the daily goal stays a visible
    // nudge on every matn card, not just on days you've already started.
    const gtarget = goalTarget(poem);
    const gdone = prog && prog.goal && prog.goal.date === todayY ? Math.min(+(prog.goal.done || 0) || 0, gtarget) : 0;
    const gwrap = row.querySelector<HTMLElement>('.mr-goal');
    if (gwrap) { gwrap.hidden = false; gwrap.innerHTML = 'Goal today: <b>' + gdone + '/' + gtarget + '</b> abyāt'; }
  }
  const rows = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('.matn-row'));
  rows().forEach(renderMatnRow);
  // Lets the app shell's More sheet push a live update the instant a daily
  // goal stepper changes, instead of the new target only showing up after
  // the next full Home load.
  window.AslRefreshHomeGoals = () => { rows().forEach(renderMatnRow); };

  if (rows().length) {
    statsStrip();
    bookmarksCard(META);
  }
  continueCard(META);
  reveal();

  // ---- study stats strip ----
  function statsStrip(): void {
    const wrapEl = document.getElementById('statsWrap');
    if (!wrapEl) return;
    let mastered = 0, denom = 0, anyV = false;
    rows().forEach((row) => {
      const poem = row.getAttribute('data-poem') || '';
      const total = +(row.getAttribute('data-total') || 0) || 0;
      const prog = lsJSON<MzProgress>('asl-mz-prog-' + poem);
      if (!prog || !prog.v) return;
      let m = 0, any = false;
      Object.keys(prog.v).forEach((k) => { const s = prog.v![k]?.s; if (s === 1 || s === 2) { any = true; if (s === 2) m++; } });
      if (any) { anyV = true; mastered += m; denom += total; }
    });
    const days = lsJSON<Record<string, unknown>>('asl-days') || {};
    const tsec = +(lsJSON<{ total?: number }>('asl-time')?.total || 0) || 0;
    if (!anyV && !tsec && !Object.keys(days).length) return;
    // streak: consecutive study days ending today (or yesterday, if today hasn't started)
    let streak = 0;
    const d = new Date();
    if (!days[fmt(d)]) d.setDate(d.getDate() - 1);
    while (days[fmt(d)]) { streak++; d.setDate(d.getDate() - 1); }
    const pct = denom ? Math.round(100 * mastered / denom) : 0;
    const h = Math.floor(tsec / 3600), mn = Math.round((tsec % 3600) / 60);
    const timeStr = h ? h + '<small>h</small> ' + mn + '<small>m</small>' : mn + '<small>m</small>';
    const IC = {
      book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4.5A2.5 2.5 0 0 1 4.5 2H11v17H4.5A2.5 2.5 0 0 0 2 21.5v-17z"/><path d="M22 4.5A2.5 2.5 0 0 0 19.5 2H13v17h6.5a2.5 2.5 0 0 1 2.5 2.5v-17z"/></svg>',
      flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c1 4-4 5.5-4 10a4 4 0 0 0 8 0c0-1.5-.5-2.5-1-3.5-1.6 1-2 2-2 3"/><path d="M12 22a6 6 0 0 1-6-6c0-2 .8-3.6 2-5"/><path d="M12 22a6 6 0 0 0 6-6c0-2-.8-3.6-2-5"/></svg>',
      cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
    };
    const card = document.createElement('div');
    card.className = 'stats-card';
    card.innerHTML =
      '<div class="st"><div class="hd"><span class="ic">' + IC.book + '</span><span class="lbl">Overall progress</span></div><div class="num">' + pct + '<small>%</small></div><div class="sub">' + mastered + ' of ' + denom + ' abyāt memorized</div></div>' +
      '<div class="st"><div class="hd"><span class="ic">' + IC.flame + '</span><span class="lbl">Current streak</span></div><div class="num">' + streak + '</div><div class="sub">' + (streak > 1 ? 'days · keep it consistent!' : (streak === 1 ? 'day · nice start!' : 'days · begin today!')) + '</div></div>' +
      '<div class="st"><div class="hd"><span class="ic">' + IC.cal + '</span><span class="lbl">Total study time</span></div><div class="num">' + timeStr + '</div><div class="sub">across all mutūn</div></div>';
    wrapEl.appendChild(card);
    const rule = document.createElement('div');
    rule.className = 'st-rule';
    rule.innerHTML = '<i></i><b>۞</b><i></i>';
    wrapEl.appendChild(rule);
  }
}

// ---- bookmarks across all mutūn ----
function bookmarksCard(META: Record<string, MatnMeta>): void {
  const wrapEl = document.getElementById('bmWrap');
  if (!wrapEl) return;
  const marks: { poem: string; n: number }[] = [];
  for (const p of listedPoems()) {
    const arr = lsJSON<unknown>('asl-bm-' + p.id);
    if (Array.isArray(arr)) {
      arr.map(Number).filter((n) => n > 0).sort((a, b) => a - b).forEach((n) => marks.push({ poem: p.id, n }));
    }
  }
  if (!marks.length) return;
  // Collapsed by default, and only the first few rows once opened: a list
  // this long sits right above the matn list.
  const LIMIT = 8;
  const card = document.createElement('div');
  card.className = 'bm-card';
  card.innerHTML = '<button type="button" class="bm-head" aria-expanded="false">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 3.5h10a1 1 0 0 1 1 1V21l-6-4-6 4V4.5a1 1 0 0 1 1-1z"/></svg>' +
    'Your bookmarks<span class="bm-count">' + marks.length + '</span><span class="bm-chev" aria-hidden="true">▾</span></button>';
  function rowFor(m: { poem: string; n: number }): HTMLAnchorElement {
    const meta = META[m.poem]!;
    const ch = chapterOf(m.poem, m.n);
    const a = document.createElement('a');
    a.className = 'bm-row ' + meta.cls;
    a.href = poemHref(m.poem, { mode: 'read', goto: m.n });
    a.innerHTML = '<span class="bm-dot"></span><span class="bm-body">' +
      '<span class="bm-t"><b>' + esc(meta.en) + '</b> · Bayt ' + m.n + '</span>' +
      (ch ? '<span class="bm-ch">' + esc(ch) + '</span>' : '') +
      '</span><span class="bm-n">' + m.n + '</span>';
    return a;
  }
  const head = card.querySelector<HTMLButtonElement>('.bm-head')!;
  let built = false;
  head.addEventListener('click', () => {
    const open = !card.classList.contains('open');
    if (open && !built) {
      built = true;
      marks.slice(0, LIMIT).forEach((m) => card.appendChild(rowFor(m)));
      if (marks.length > LIMIT) {
        const more = document.createElement('button');
        more.type = 'button'; more.className = 'bm-more';
        more.textContent = 'Show all ' + marks.length + ' bookmarks';
        more.addEventListener('click', () => {
          more.remove();
          marks.slice(LIMIT).forEach((m) => card.appendChild(rowFor(m)));
        });
        card.appendChild(more);
      }
    }
    card.classList.toggle('open', open);
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  wrapEl.appendChild(card);
}

// ---- "Continue where you left off" ----
function continueCard(META: Record<string, MatnMeta>): void {
  const rec = lsJSON<LastVisit>('asl-last');
  if (!(rec && rec.poem && META[rec.poem] && rec.n)) return;
  const m = META[rec.poem]!, mz = rec.mode === 'memorize';
  const n = Math.floor(+rec.n);
  if (!(n > 0)) return;
  const a = document.createElement('a');
  a.className = 'cont-card ' + m.cls;
  a.href = poemHref(rec.poem, { mode: mz ? 'memorize' : 'read', goto: n });
  a.innerHTML = '<span class="cc-emblem" role="img" aria-hidden="true"></span>' +
    '<span class="cc-body"><span class="cc-lbl">Continue ' + (mz ? 'memorizing' : 'reading') + '</span>' +
    '<span class="cc-main">' + esc(m.en.replace(/^The /, '')) + ' · Bayt ' + n + '</span></span>' +
    '<span class="cc-go">Resume</span>';
  document.getElementById('contWrap')?.appendChild(a);
}

// ---- the cards further down rise into place as they scroll in ----
function reveal(): void {
  if (matchMedia('(prefers-reduced-motion:reduce)').matches || typeof IntersectionObserver !== 'function') return;
  const r = new IntersectionObserver((entries, o) => {
    entries.forEach((x) => {
      if (x.isIntersecting) {
        const el = x.target as HTMLElement;
        el.style.opacity = '1'; el.style.transform = 'none';
        o.unobserve(el);
      }
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
  document.querySelectorAll<HTMLElement>('.prep-card,.outline li,.ayah-card').forEach((el) => {
    el.style.opacity = '0'; el.style.transform = 'translateY(10px)'; el.style.transition = 'opacity .5s ease, transform .5s ease';
    r.observe(el);
  });
}
