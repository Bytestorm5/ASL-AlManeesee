/* Remembers where the reader is, so the home screen can offer
   "Continue where you left off".
   - While a reading page is open, the first visible bayt (and whether the
     reader is in Reading or Memorize mode) is saved to localStorage
     ('asl-last') a few times a minute and when the page is left.
   - Arriving with ?goto=<bayt> (the home screen's Continue button) scrolls
     to that bayt — or, in Memorize mode, opens its chapter.
   Also keeps the home screen's study stats: the days a matn was opened
   ('asl-days') and the time spent reading ('asl-time'). */
import { currentPoemId, lsGet, lsSet } from '../page.ts';

const FLASH_CSS = '.lv-flash{animation:lvflash 2.2s ease-out}'
  + '@keyframes lvflash{0%,45%{background:rgba(212,171,79,.22);border-radius:12px}100%{background:transparent}}';

export function init(): void {
  const poem = currentPoemId();
  if (!poem) return;
  const main = document.getElementById('main');
  if (!main) return;
  const navbar = document.querySelector<HTMLElement>('.navbar');
  const medallions = [...main.querySelectorAll<HTMLElement>('.verse .vn')];
  if (!medallions.length) return;

  const offsetTop = () => (navbar ? navbar.offsetHeight : 0) + 10;

  // ---- record the reading position ----
  function firstVisibleN(): number | null {
    const top = offsetTop();
    let best: HTMLElement | null = null;
    for (const m of medallions) {
      const r = m.getBoundingClientRect();
      if (r.bottom >= top && r.top < window.innerHeight) { best = m; break; }
      if (r.top >= window.innerHeight) break;
    }
    return best ? parseInt(best.textContent || '', 10) : null;
  }
  function save() {
    const n = firstVisibleN();
    if (!n) return;
    const rec = {
      poem,
      mode: document.body.classList.contains('mz-on') ? 'memorize' : 'read',
      n,
      t: Date.now(),
    };
    lsSet('asl-last', JSON.stringify(rec));
  }
  let timer: number | undefined;
  const queue = () => { clearTimeout(timer); timer = window.setTimeout(save, 900); };
  addEventListener('scroll', queue, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  addEventListener('pagehide', save);
  setTimeout(save, 2500); // record arrival even without a scroll

  // ---- study stats (home-screen tiles): days opened + time spent reading ----
  const ymd = (d: Date) => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  function stampDay() {
    try {
      const days = (JSON.parse(lsGet('asl-days') || '{}') || {}) as Record<string, number>;
      const t = ymd(new Date());
      if (days[t]) return;
      days[t] = 1;
      const keys = Object.keys(days).sort();
      while (keys.length > 400) delete days[keys.shift()!];
      lsSet('asl-days', JSON.stringify(days));
    } catch { /* corrupt — leave it */ }
  }
  let visStart: number | null = document.visibilityState === 'visible' ? Date.now() : null;
  function flushTime() {
    if (visStart == null) return;
    const add = Math.round((Date.now() - visStart) / 1000);
    visStart = document.visibilityState === 'visible' ? Date.now() : null;
    if (add < 3 || add > 7200) return; // ignore blips and absurd gaps
    try {
      const t = (JSON.parse(lsGet('asl-time') || '{}') || {}) as { total?: number };
      t.total = (+(t.total ?? 0) || 0) + add;
      lsSet('asl-time', JSON.stringify(t));
    } catch { /* corrupt — leave it */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushTime();
    else if (visStart == null) visStart = Date.now();
  });
  addEventListener('pagehide', flushTime);
  setInterval(flushTime, 30000); // survive abrupt app kills
  setTimeout(stampDay, 4000);    // a real visit, not a bounce

  // ---- ?goto=<bayt> : resume at a saved position ----
  const m = location.search.match(/[?&]goto=(\d+)/);
  if (!m) return;
  const want = +m[1]!;
  const target = medallions.find((el) => parseInt(el.textContent || '', 10) === want);
  if (!target) return;
  const verse = target.closest<HTMLElement>('.verse');
  const section = target.closest('section.chapter');
  if (!verse) return;
  function go() {
    if (document.body.classList.contains('mz-on')) {
      // Memorize mode shows one chapter at a time — open the right one.
      if (section) document.dispatchEvent(new CustomEvent('asl-mz-goto', { detail: { id: section.id } }));
      return;
    }
    const y = verse!.getBoundingClientRect().top + window.pageYOffset - offsetTop();
    window.scrollTo(0, Math.max(0, y));
    verse!.classList.add('lv-flash');
    setTimeout(() => verse!.classList.remove('lv-flash'), 2400);
  }
  const st = document.createElement('style');
  st.textContent = FLASH_CSS;
  document.head.appendChild(st);
  /* Keep the reader at that bayt while the page finishes settling. The
     feature modules each walk every verse adding their own button, so the
     ground moves for a moment after the jump — app-shell.ts in particular
     hides the web chrome when it runs last, which on a long matn moved
     everything by some 7,800px. Setting the position once and leaving it
     meant arriving at the right bayt and then sliding off it. So the
     position is held until the document height stops changing rather than
     for a guessed interval. A reader who starts scrolling is left alone:
     only drift that happens while they are still is corrected. */
  function pin() {
    const giveUp = Date.now() + 8000;
    let settledAt = 0, lastH = -1, last = -1;
    const step = () => {
      if (document.body.classList.contains('mz-on')) return;
      const h = document.documentElement.scrollHeight;
      if (h !== lastH) { lastH = h; settledAt = Date.now(); }
      const y = Math.max(0, verse!.getBoundingClientRect().top + window.pageYOffset - offsetTop());
      const here = window.pageYOffset;
      if (Math.abs(y - here) > 4 && Math.abs(here - last) < 4) window.scrollTo(0, y);
      last = window.pageYOffset;
      // stop once the page has stopped moving under us, not after a guessed delay
      if (Date.now() < giveUp && Date.now() - settledAt < 1400) setTimeout(step, 100);
    };
    step();
  }

  /* Go now, rather than after every other feature module has walked every
     verse — on a matn of 1,173 abyāt that was the difference between
     arriving in about three seconds and in twelve. Memorize mode still waits
     for the settled pass below, because which chapter to open depends on
     memorize.ts having run; the URL already says which mode we are heading
     into, so there is nothing to guess. */
  if (!/[?&]mode=memorize/.test(location.search)) { go(); pin(); }
  // after memorize.ts has decided the mode and the reveal animations settled
  setTimeout(go, 60);
  setTimeout(save, 3000);
}
