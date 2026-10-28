/* The per-verse explanation card: its markup (built during the page's own
   render) and everything that happens afterwards —

     · the book button that opens and closes a card;
     · the EN / اردو / ع language bar, when a card is written in more than one
       language — one choice applies to every card, remembered per device;
     · the styling those two need.

   The markup:

     <div class="explanation show-en" data-langs="en ur">
       <div class="exp-langbar">…<button class="exp-lang-b" data-xl="en">…</div>
       <div class="exp-body exp-en">…</div>
       <div class="exp-body exp-ur" dir="rtl" lang="ur">…</div>
       <div class="exp-by">— …</div>
     </div>

   `data-langs` is what makes the language choice work across cards written in
   different ones: asking for Urdu on a card that only has English leaves that
   card in English rather than blanking it. */
import type { AslExplanationApi } from '../globals.d.ts';
import { lsGet, lsSet } from '../page.ts';

const LANGS = ['en', 'ur', 'ar'] as const;
type Lang = (typeof LANGS)[number];
const LABEL: Record<Lang, string> = { en: 'EN', ur: 'اردو', ar: 'ع' };
const KEY = 'asl-exp-lang';

export const BTN = '<button class="exp-toggle" type="button" aria-pressed="false" title="Show explanation"'
  + ' aria-label="Show explanation"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none"'
  + ' stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"'
  + ' d="M12 6c-1.7-1-3.8-1.5-6-1.5H4v13h2c2.2 0 4.3.5 6 1.5 1.7-1 3.8-1.5 6-1.5h2v-13h-2c-2.2 0-4.3.5-6 1.5zM12 6v13"/></svg></button>';

/* Stored either as one string (English) or as {en, ur, ar}. */
function asObject(exp: unknown): Partial<Record<Lang, string>> {
  if (!exp) return {};
  if (typeof exp === 'string') return { en: exp };
  return typeof exp === 'object' ? (exp as Partial<Record<Lang, string>>) : {};
}

/** Which languages this verse's explanation is actually written in. */
export function langsOf(v: { exp?: unknown } | null | undefined): Lang[] {
  const e = asObject(v?.exp);
  return LANGS.filter((l) => typeof e[l] === 'string' && e[l]!.trim());
}

/** The .explanation div, or '' when there is nothing. `defaultBy` is the
    attribution to fall back on when the verse records none. */
export function card(v: { exp?: unknown; expBy?: string }, defaultBy?: string): string {
  const have = langsOf(v);
  if (!have.length) return '';
  const e = asObject(v.exp);
  const bar = have.length > 1
    ? '<div class="exp-langbar"><div class="exp-lang" role="group" aria-label="Explanation language">'
      + have.map((l) => `<button type="button" class="exp-lang-b" data-xl="${l}">${LABEL[l]}</button>`).join('')
      + '</div></div>'
    : '';
  const bodies = have.map((l) => {
    const attrs = l === 'en' ? '' : ` dir="rtl" lang="${l}"`;
    return `<div class="exp-body exp-${l}"${attrs}>${e[l]}</div>`;
  }).join('');
  const by = v.expBy || defaultBy || '';
  return `<div class="explanation show-${have[0]}" data-langs="${have.join(' ')}">`
    + bar + bodies + (by ? `<div class="exp-by">— ${by}</div>` : '') + '</div>';
}

function stored(): Lang {
  const s = lsGet(KEY);
  return (LANGS as readonly string[]).includes(s ?? '') ? (s as Lang) : 'en';
}
let lang: Lang = stored();

function injectCSS(): void {
  if (document.getElementById('asl-exp-css')) return;
  const st = document.createElement('style');
  st.id = 'asl-exp-css';
  st.textContent = [
    /* Only the chosen language shows. */
    '.explanation .exp-body{display:none}',
    '.explanation.show-en .exp-en,.explanation.show-ur .exp-ur,.explanation.show-ar .exp-ar{display:block}',
    '.explanation .exp-ur{font-family:"UrduNastaliq","Noto Nastaliq Urdu",serif;direction:rtl;text-align:right;line-height:2.05}',
    '.explanation .exp-ar{font-family:"Amiri","Scheherazade New",serif;direction:rtl;text-align:right;line-height:1.95;font-size:1.05em}',
    /* A quoted bayt or āyah set apart from the prose around it — a class rather
       than an inline style, so stored content never carries CSS. */
    '.explanation .qline{text-align:center;font-size:1.15em;margin:10px 0}',
    '.exp-langbar{display:flex;justify-content:flex-end;align-items:center;padding-bottom:9px;margin-bottom:12px;border-bottom:1px solid var(--paper-edge,#e8dcc7)}',
    '.exp-lang{display:inline-flex;gap:2px;background:var(--paper-2,#f4ecdb);border:1px solid var(--paper-edge,#e8dcc7);border-radius:9px;padding:2px}',
    '.exp-lang-b{font-family:"Montserrat",sans-serif;font-size:.58rem;font-weight:700;letter-spacing:.02em;color:var(--ink-soft,#6c585a);background:transparent;border:0;border-radius:7px;padding:3px 10px;cursor:pointer;line-height:1.25;-webkit-tap-highlight-color:transparent}',
    '.exp-lang-b.on{background:var(--madder,#8a4447);color:#fbeee8}',
    '.explanation .exp-by{margin-top:13px;padding-top:9px;border-top:1px solid var(--paper-edge,#e8dcc7);font-size:.78rem;opacity:.85}',
  ].join('');
  document.head.appendChild(st);
}

/** Show `l` on every card that has it, and each card's own first language on the rest. */
export function applyLang(l: string): void {
  lang = (LANGS as readonly string[]).includes(l) ? (l as Lang) : 'en';
  lsSet(KEY, lang);
  for (const p of document.querySelectorAll<HTMLElement>('.explanation')) {
    const have = (p.getAttribute('data-langs') || 'en').split(/\s+/).filter(Boolean);
    const pick = have.includes(lang) ? lang : have[0] || 'en';
    for (const k of LANGS) p.classList.toggle('show-' + k, k === pick);
    for (const b of p.querySelectorAll('.exp-lang-b')) b.classList.toggle('on', b.getAttribute('data-xl') === pick);
  }
}

/* Delegated, so it covers cards the data loader patched in after load — and so
   a page cannot end up with two handlers on one button, which would toggle it
   twice and look like nothing happened. */
function wireClicks(): void {
  const main = (document.getElementById('main') || document.body) as HTMLElement & { _aslExpWired?: boolean };
  if (main._aslExpWired) return;
  main._aslExpWired = true;
  main.addEventListener('click', (e) => {
    const t = e.target as Element | null;
    const lb = t?.closest?.('.exp-lang-b');
    if (lb) { e.stopPropagation(); applyLang(lb.getAttribute('data-xl') || 'en'); return; }
    const btn = t?.closest?.('.exp-toggle') as HTMLElement | null;
    if (!btn) return;
    e.stopPropagation();
    const verse = btn.closest('.verse');
    if (!verse) return;
    const on = verse.classList.toggle('showExp');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Hide explanation' : 'Show explanation';
  });
}

export const ASLExp: AslExplanationApi = {
  BTN, langs: langsOf, card, applyLang,
  get lang() { return lang; },
};
window.ASLExp = ASLExp;

/** Wire the cards up. Called once the page has rendered its verses. */
export function init(): void {
  if (!document.querySelector('.explanation, .exp-toggle')) return; // page carries none
  injectCSS();
  wireClicks();
  applyLang(lang);
}
