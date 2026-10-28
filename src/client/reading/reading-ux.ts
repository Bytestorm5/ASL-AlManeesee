/* First-run coach mark that makes the Translation control discoverable.
   Shows once (stored in localStorage): a tappable tooltip pointing at the
   Translation button, plus a gentle pulse, the first time the reader scrolls
   to the verses. Does nothing for returning users, if a translation is
   already being shown, or on a matn with no translation to show. */
import { lsGet, lsSet } from '../page.ts';

const KEY = 'asl-trhint';

const CSS = [
  '.trhint{position:fixed;z-index:150;max-width:240px;background:#8a4447;color:#fbeee8;',
  'font-family:"Montserrat",sans-serif;font-size:.75rem;font-weight:600;line-height:1.35;',
  'padding:10px 30px 10px 13px;border-radius:11px;box-shadow:0 12px 30px rgba(94,44,48,.42);',
  'cursor:pointer;animation:trbob 1.5s ease-in-out infinite}',
  '.trhint::after{content:"";position:absolute;bottom:100%;right:22px;border:7px solid transparent;border-bottom-color:#8a4447}',
  '.trhint .x{position:absolute;top:5px;right:9px;font-size:1rem;line-height:1;opacity:.85}',
  '@keyframes trbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}',
  '#viewBtn.trpulse{animation:trpulse 1.5s ease-out infinite}',
  '@keyframes trpulse{0%{box-shadow:0 0 0 0 rgba(138,68,71,.55)}70%{box-shadow:0 0 0 12px rgba(138,68,71,0)}100%{box-shadow:0 0 0 0 rgba(138,68,71,0)}}',
  '@media (prefers-reduced-motion:reduce){.trhint,#viewBtn.trpulse{animation:none}}',
].join('');

export function init(): void {
  if (lsGet(KEY)) return;

  const btn = document.getElementById('viewBtn');
  const drop = document.getElementById('viewDrop');
  if (!btn || !drop) return;
  // A translation is already on (returning reader with a saved choice): don't nag.
  if (!document.body.classList.contains('view-ar')) {
    lsSet(KEY, '1');
    return;
  }
  /* The menu lists only the translations this matn has (render.ts), and is
     hidden when it has none — then there is nothing to point at. */
  const hasEn = !!drop.querySelector('[data-k="en"]');
  const hasUr = !!drop.querySelector('[data-k="ur"]');
  if (!hasEn && !hasUr) return;
  const langs = hasEn && hasUr ? 'English & Urdu' : hasUr ? 'Urdu' : 'English';

  const st = document.createElement('style');
  st.appendChild(document.createTextNode(CSS));
  document.head.appendChild(st);

  let tip: HTMLElement | null = null, timer: number | undefined, shown = false;

  function place() {
    if (!tip) return;
    const r = btn!.getBoundingClientRect();
    tip.style.top = (r.bottom + 10) + 'px';
    tip.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  }
  function done() {
    clearTimeout(timer);
    if (tip) { tip.remove(); tip = null; }
    btn!.classList.remove('trpulse');
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', maybe);
    btn!.removeEventListener('click', done);
    drop!.removeEventListener('click', done);
    lsSet(KEY, '1');
  }
  function show() {
    if (shown) return;
    shown = true;
    window.removeEventListener('scroll', maybe);
    btn!.classList.add('trpulse');
    const t = document.createElement('div');
    tip = t;
    t.className = 'trhint';
    t.setAttribute('role', 'note');
    t.innerHTML = '<span class="x" aria-hidden="true">×</span>Tap here to show ' + langs + ' translation';
    document.body.appendChild(t);
    place();
    window.addEventListener('resize', place);
    timer = window.setTimeout(done, 9000);
    t.addEventListener('click', (e) => { e.stopPropagation(); done(); btn!.click(); });
    btn!.addEventListener('click', done);
    drop!.addEventListener('click', done);
  }
  // Show it once the reader has scrolled so the Translation button is pinned
  // near the top. The lenient threshold handles a taller two-row bar.
  function maybe() {
    const r = btn!.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight && r.top < window.innerHeight * 0.55) show();
  }
  window.addEventListener('scroll', maybe, { passive: true });
  maybe();
}
