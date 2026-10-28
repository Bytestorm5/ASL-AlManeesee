/* Qurʾanic examples and reading rules under a bayt — the qirāʾāt panel.
   On a matn registered with `qiraat: true`, bayts that treat specific Qurʾanic
   words get a small mushaf button in the verse's action row; it opens a panel
   showing, for each treated word: the āyah (Uthmani text, Ḥafṣ) with the word
   highlighted, and who among the readers reads it how. Categorical chapters
   get rule cards instead (a statement, its conditions, cautions, examples).

   The dataset is stored at data/qiraat/<id>.json and edited in the content
   editor; it is read through the data loader (reading/data-loader.ts). */
import type { PoemConfig, QxCard, QxExampleCard, QxReading, QxRuleCard, QxText } from '../../poems/types.ts';
import { getSwitches } from '../api.ts';
import { currentPoem, lsGet, lsSet } from '../page.ts';
import { fetchQiraat, fetchQiraatIndex } from './data-loader.ts';

type Lang = 'ar' | 'en' | 'ur';

const CSS = [
  '.qx-btn{flex:0 0 auto;display:inline-grid;place-items:center;width:26px;height:26px;padding:0;',
  'border-radius:50%;border:1px solid var(--paper-edge,#e8dcc7);background:#fff;color:var(--madder,#8a4447);cursor:pointer;',
  'transition:border-color .15s,background .15s;-webkit-tap-highlight-color:transparent}',
  '.qx-btn:hover{border-color:var(--gilt,#c0973c);background:var(--paper,#f7f2e5)}',
  '.qx-btn.on{background:var(--madder,#8a4447);border-color:var(--madder,#8a4447);color:#fbeee8}',
  '.qx-btn svg{width:15px;height:15px;display:block}',
  '.qx-panel{display:none;margin:10px 8px 2px;border:1px solid var(--paper-edge,#e8dcc7);border-radius:14px;',
  'background:linear-gradient(180deg,#fdfaf1,var(--paper-2,#f4ecdb));overflow:hidden;animation:fade .25s ease}',
  '.qx-panel.open{display:block}',
  '.qx-hd{display:flex;align-items:center;gap:8px;padding:8px 13px 7px;border-bottom:1px solid var(--paper-edge,#e8dcc7)}',
  '.qx-hd .t{font-family:"Cinzel","Cormorant Garamond",serif;font-weight:600;font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:var(--gilt-deep,#8a6a1c)}',
  '.qx-hd .ar{font-family:"Scheherazade New","Amiri";font-size:1rem;color:var(--madder,#8a4447);margin-inline-start:auto;line-height:1}',
  '.qx-item{padding:10px 13px 11px}',
  '.qx-item+.qx-item{border-top:1px dashed var(--paper-edge,#e8dcc7)}',
  '.qx-ref{display:inline-flex;align-items:center;gap:6px;font-family:"Montserrat",sans-serif;font-size:.6rem;font-weight:700;',
  'color:var(--gilt-deep,#8a6a1c);background:#f4ead4;border:1px solid var(--paper-edge,#e8dcc7);border-radius:10px;padding:2px 9px;margin-bottom:7px}',
  '.qx-ayah{direction:rtl;text-align:right;font-family:"Scheherazade New","Amiri";font-size:1.28rem;line-height:2.1;color:var(--ink,#2f2422);margin-bottom:7px}',
  '.qx-ayah b{color:var(--madder,#8a4447);font-weight:700}',
  '.qx-scope{direction:rtl;text-align:right;font-family:"Amiri";font-size:.82rem;color:var(--ink-soft,#6c585a);line-height:1.6;margin:-2px 0 6px}',
  '.qx-rd{display:flex;gap:9px;direction:rtl;text-align:right;padding:4px 0;align-items:baseline}',
  '.qx-rd .who{flex:0 0 34%;min-width:0;font-family:"Amiri","Scheherazade New";font-size:.95rem;color:var(--ink-soft,#6c585a)}',
  '.qx-rd .who b{color:var(--madder,#8a4447);font-weight:700}',
  '.qx-rd .how{flex:1 1 auto;font-family:"Scheherazade New","Amiri";font-size:1.15rem;line-height:1.7;color:var(--ink,#2f2422)}',
  '.qx-rd .how .nt{display:block;font-family:"Amiri";font-size:.85rem;color:var(--ink-soft,#6c585a);line-height:1.5}',
  '.qx-rd.hafs .how{color:var(--madder,#8a4447)}',
  '.qx-rd.hafs .who::after{content:"— قراءتنا";font-size:.75rem;color:var(--gilt-deep,#8a6a1c);margin-inline-start:5px}',
  '.qx-l-en .qx-rd.hafs .who::after{content:"— our reading"}',
  '.qx-l-ur .qx-rd.hafs .who::after{content:"— ہماری قراءت"}',
  '.qx-src{padding:5px 13px 8px;font-family:"Montserrat",sans-serif;font-size:.53rem;font-weight:600;letter-spacing:.05em;color:var(--ink-soft,#6c585a);opacity:.75}',
  /* rule-card (categorical usul chapters) */
  '.qx-rule-hd{display:flex;align-items:center;gap:8px;direction:rtl;margin-bottom:3px}',
  '.qx-rule-badge{flex:0 0 auto;font-family:"Montserrat",sans-serif;font-size:.48rem;font-weight:700;letter-spacing:.08em;color:#fff;background:var(--gilt,#c0973c);border-radius:6px;padding:2px 7px}',
  '.qx-rule-title{font-family:"Cormorant Garamond","Amiri","Scheherazade New",serif;font-size:1.22rem;font-weight:700;color:var(--madder,#8a4447);line-height:1.3}',
  '.qx-rule-stmt{direction:rtl;text-align:right;font-family:"Cormorant Garamond","Amiri",serif;font-size:1.04rem;line-height:1.85;color:var(--ink,#2f2422);background:#faf4e6;border:1px solid var(--paper-edge,#e8dcc7);border-radius:9px;padding:8px 11px;margin-bottom:9px}',
  '.qx-cond{direction:rtl;text-align:right;margin:2px 2px 8px;padding:0;list-style:none}',
  '.qx-cond li{position:relative;font-family:"Amiri";font-size:.9rem;line-height:1.65;color:var(--ink-soft,#6c585a);margin-bottom:4px;padding-inline-start:14px}',
  '.qx-cond li::before{content:"◦";position:absolute;inset-inline-start:0;color:var(--gilt,#c0973c);font-weight:700}',
  /* caution — an exception/warning pulled out of the plain conditions
     list so it can't be skimmed past, e.g. a case where the usual rule
     is barred and a different wajh is required instead */
  '.qx-caution{direction:rtl;text-align:right;margin:6px 2px 8px;padding:8px 11px;border-radius:9px;',
  'background:rgba(63,116,88,.08);border:1px solid rgba(63,116,88,.35);border-inline-start:3px solid #3f7458}',
  '.qx-caution+.qx-caution{margin-top:-2px}',
  '.qx-caution-hd{font-family:"Montserrat",sans-serif;font-size:.6rem;font-weight:700;letter-spacing:.1em;',
  'text-transform:uppercase;color:#3f7458;margin-bottom:4px}',
  '.qx-caution-body{font-family:"Amiri";font-size:.9rem;line-height:1.65;color:var(--ink,#2f2422)}',
  '.qx-l-en .qx-caution,.qx-l-en .qx-caution-hd,.qx-l-en .qx-caution-body{direction:ltr;text-align:left}',
  ':root[data-theme="dark"] .qx-caution{background:rgba(63,116,88,.14);border-color:rgba(63,116,88,.45)}',
  '.qx-ex-hd{display:flex;align-items:baseline;gap:8px;direction:rtl;margin:9px 0 5px;border-top:1px dashed var(--paper-edge,#e8dcc7);padding-top:8px}',
  '.qx-ex-hd .a{font-family:"Amiri";font-size:.98rem;color:var(--madder,#8a4447);font-weight:700}',
  '.qx-ex-hd .e{font-family:"Montserrat",sans-serif;font-size:.48rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gilt-deep,#8a6a1c)}',
  '.qx-ex{margin-bottom:8px}',
  '.qx-ex-top{display:flex;align-items:center;gap:7px;direction:rtl;flex-wrap:wrap;margin-bottom:2px}',
  '.qx-ex .qx-ref{margin-bottom:0}',
  '.qx-ex-case{font-family:"Cormorant Garamond","Amiri",serif;font-size:.84rem;color:var(--ink-soft,#6c585a)}',
  '.qx-ex .qx-ayah{font-size:1.18rem;line-height:1.95;margin-bottom:0}',
  /* language toggle */
  '.qx-lang{display:inline-flex;gap:2px;margin-inline-start:auto;background:var(--paper-2,#f4ecdb);border:1px solid var(--paper-edge,#e8dcc7);border-radius:9px;padding:2px}',
  '.qx-lang-b{font-family:"Montserrat",sans-serif;font-size:.56rem;font-weight:700;letter-spacing:.02em;color:var(--ink-soft,#6c585a);background:transparent;border:0;border-radius:7px;padding:3px 9px;cursor:pointer;line-height:1.25;-webkit-tap-highlight-color:transparent}',
  '.qx-lang-b.on{background:var(--madder,#8a4447);color:#fbeee8}',
  /* English → left-to-right for the prose blocks (āyah stays RTL) */
  '.qx-l-en .qx-rule-hd,.qx-l-en .qx-rule-stmt,.qx-l-en .qx-cond,.qx-l-en .qx-rd,.qx-l-en .qx-ex-top,.qx-l-en .qx-ex-hd,.qx-l-en .qx-scope{direction:ltr;text-align:left}',
  '.qx-l-en .qx-rule-stmt{font-style:italic}',
  '.qx-l-en .qx-rd .who{flex-basis:40%}',
  /* dark mode */
  ':root[data-theme="dark"] .qx-btn{background:var(--surface-2,#241b16)}',
  ':root[data-theme="dark"] .qx-btn.on{background:var(--madder,#8a4447)}',
  ':root[data-theme="dark"] .qx-panel{background:linear-gradient(180deg,#241a15,var(--paper,#17110f))}',
  ':root[data-theme="dark"] .qx-ref{background:var(--paper-2,#211712)}',
  ':root[data-theme="dark"] .qx-rule-stmt{background:var(--paper-2,#211712)}',
].join('');

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M12 5.5C10.6 4.2 8.7 3.5 6.5 3.5c-1.2 0-2.4.2-3.5.7v14.6c1.1-.5 2.3-.7 3.5-.7 2.2 0 4.1.7 5.5 2 1.4-1.3 3.3-2 5.5-2 1.2 0 2.4.2 3.5.7V4.2c-1.1-.5-2.3-.7-3.5-.7-2.2 0-4.1.7-5.5 2z"/><path d="M12 5.5v14.6"/></svg>';

function esc(t: unknown): string { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

const RULE_HD: Record<Lang, string> = { ar: 'قَاعِدَة', en: 'Reading rule', ur: 'قاعدہ' };
const RULE_BADGE: Record<Lang, string> = { ar: 'قاعدة', en: 'RULE', ur: 'قاعدہ' };
const EXPL_HD: Record<Lang, string> = { ar: 'شَرْح', en: 'Commentary', ur: 'شرح' };
const EXPL_BADGE: Record<Lang, string> = { ar: 'شرح', en: 'NOTE', ur: 'شرح' };
const EX_HD: Record<Lang, string> = { ar: 'أمثلة', en: 'Examples', ur: 'مثالیں' };
const CAUTION_HD: Record<Lang, string> = { ar: 'تنبيه', en: 'Caution', ur: 'تنبیہ' };
const LANGS: [Lang, string][] = [['ar', 'ع'], ['en', 'EN'], ['ur', 'اردو']];

const isRuleCard = (it: QxCard | undefined): it is QxRuleCard => !!it && 'rule' in it && !!it.rule;

export function init(): void {
  const cfg = currentPoem();
  if (!cfg?.qiraat) return;
  const poem = cfg.id;
  const main = document.getElementById('main');
  if (!main) return;

  // The dataset can run to megabytes, so it is deliberately NOT loaded up
  // front. Deciding which verses get a button only needs the list of bayt
  // numbers (the index, a few KB); the payload itself is fetched the first
  // time a panel is opened.
  let QX: Record<string, unknown[]> | null = null;
  let loading: Promise<Record<string, unknown[]> | null> | null = null;
  function ensureData(): Promise<Record<string, unknown[]> | null> {
    if (QX) return Promise.resolve(QX);
    if (loading) return loading;
    loading = fetchQiraat(poem).then((ex) => { QX = ex || null; return QX; });
    return loading;
  }

  /* Attach only the panels the admin has switched on. The switches come from
     content-switches.ts, which has already asked for them — it hides
     translations out of the same document — so this reuses that one request
     rather than making a second for the same bytes, and inherits its
     localStorage cache (which is what keeps the gate working offline). The
     direct fetch stays as the fallback for a page without that module.
     Either way, a failure attaches nothing: safer than surfacing commentary
     that is still under review. */
  const enabledMap: Promise<Record<string, boolean> | null> = window.ASLSwitches
    ? window.ASLSwitches.get(poem).then((m) => m.enabled)
    : getSwitches(poem).then((j) => j.enabled || null).catch(() => null);

  void Promise.all([fetchQiraatIndex(poem), enabledMap]).then(([known, map]) => {
    if (!known || !known.length) return;
    const enabled = new Set<number>();
    if (map) for (const k of Object.keys(map)) if (map[k] === true) enabled.add(parseInt(k, 10));
    injectCss();
    attachButtons(new Set(known.map(Number)), enabled, cfg, ensureData);
  });
}

function injectCss(): void {
  if (document.getElementById('asl-qx-css')) return;
  const st = document.createElement('style');
  st.id = 'asl-qx-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

function attachButtons(
  hasExample: Set<number>,
  enabled: Set<number>,
  cfg: PoemConfig,
  ensureData: () => Promise<Record<string, unknown[]> | null>,
): void {
  /* An attribution line under every panel — the commentary the readings are
     sourced from. Read from the matn's registration (`qiraatSource`); none
     is printed when the matn records none. */
  const source = cfg.qiraatSource || '';

  // ---- trilingual state (rule-cards) ----
  let QLANG: Lang = 'ar';
  const saved = lsGet('asl-qx-lang');
  if (saved === 'ar' || saved === 'en' || saved === 'ur') QLANG = saved;
  const rulePanels: { el: HTMLElement; items: QxCard[]; isRule: boolean }[] = []; // for live re-render on language change

  /* A field is a plain (Arabic) string, or the same text in up to three
     languages. A language the field was not written in falls back to the
     Arabic, then to whichever language it does have. */
  function tr(x: QxText | null | undefined): string {
    if (x && typeof x === 'object' && !Array.isArray(x)) return x[QLANG] || x.ar || x.en || x.ur || '';
    return x == null ? '' : String(x);
  }

  function langPills(): string {
    return '<div class="qx-lang">' + LANGS.map(([k, label]) =>
      '<button type="button" class="qx-lang-b' + (QLANG === k ? ' on' : '') + '" data-l="' + k + '">' + label + '</button>').join('') + '</div>';
  }

  function readingRows(readings: QxReading[]): string {
    return readings.map((r) =>
      '<div class="qx-rd' + (r.hafs ? ' hafs' : '') + '">'
      + '<span class="who"><b>' + esc(tr(r.who)) + '</b></span>'
      + '<span class="how">' + esc(tr(r.how)) + (r.note ? '<span class="nt">' + esc(tr(r.note)) + '</span>' : '') + '</span></div>').join('');
  }

  const refOf = (sura: QxText | undefined, ayah: number | undefined) => (sura ? tr(sura) + (ayah ? ' · ' + ayah : '') : '');

  function ruleItem(it: QxRuleCard): string {
    const r = it.rule;
    const badge = r.kind === 'explain' ? EXPL_BADGE : RULE_BADGE;
    let h = '<div class="qx-item">'
      + '<div class="qx-rule-hd"><span class="qx-rule-badge">' + esc(badge[QLANG]) + '</span><span class="qx-rule-title">' + esc(tr(r.title)) + '</span></div>'
      + '<div class="qx-rule-stmt">' + esc(tr(r.statement)) + '</div>'
      + readingRows(it.readings || []);
    if (r.conditions && r.conditions.length) {
      h += '<ul class="qx-cond">' + r.conditions.map((c) => '<li>' + esc(tr(c)) + '</li>').join('') + '</ul>';
    }
    if (r.caution && r.caution.length) {
      h += r.caution.map((c) => '<div class="qx-caution"><div class="qx-caution-hd">' + esc(CAUTION_HD[QLANG]) + '</div>'
        + '<div class="qx-caution-body">' + esc(tr(c)) + '</div></div>').join('');
    }
    if (it.examples && it.examples.length) {
      h += '<div class="qx-ex-hd"><span class="a">' + esc(EX_HD[QLANG]) + '</span></div>';
      h += it.examples.map((e) => {
        const ref = refOf(e.sura, e.ayah);
        return '<div class="qx-ex">'
          + '<div class="qx-ex-top">' + (ref ? '<span class="qx-ref">' + esc(ref) + '</span>' : '')
          + (e.case ? '<span class="qx-ex-case">' + esc(tr(e.case)) + '</span>' : '') + '</div>'
          + (e.ayahText ? '<div class="qx-ayah">' + e.ayahText + '</div>'
            : '<div class="qx-scope"><b style="color:var(--madder,#8a4447)">' + esc(tr(e.word)) + '</b></div>')
          + '</div>';
      }).join('');
    }
    return h + '</div>';
  }

  // A panel gets the language toggle once ANY of its content has actually
  // been translated (a {ar,en,ur} object rather than a plain Arabic
  // string) — not every "Qurʾanic examples" panel has been translated
  // yet, so the toggle only shows where switching would do something.
  function hasTranslation(items: QxCard[]): boolean {
    return items.some((it) => {
      if (isRuleCard(it)) return true;
      const ex = it as QxExampleCard;
      if (ex.word && typeof ex.word === 'object') return true;
      if (ex.scope && typeof ex.scope === 'object') return true;
      return (ex.readings || []).some((r) =>
        (r.who && typeof r.who === 'object') || (r.how && typeof r.how === 'object') || (r.note && typeof r.note === 'object'));
    });
  }

  function panelInner(items: QxCard[], isRule: boolean): string {
    let html = '<div class="qx-hd">';
    if (isRule) {
      const first = items[0];
      const HD = isRuleCard(first) && first.rule.kind === 'explain' ? EXPL_HD : RULE_HD;
      html += '<span class="t">' + esc(HD[QLANG]) + '</span>';
    } else {
      html += '<span class="t">Qurʾanic examples</span><span class="ar">شَوَاهِد</span>';
    }
    if (isRule || hasTranslation(items)) html += langPills();
    html += '</div>';
    for (const it of items) {
      if (isRuleCard(it)) { html += ruleItem(it); continue; }
      const ex = it as QxExampleCard;
      const refTxt = refOf(ex.sura, ex.ayah);
      html += '<div class="qx-item">'
        + (refTxt ? '<span class="qx-ref">' + esc(refTxt) + '</span>' : '')
        + '<div class="qx-scope"><b style="color:var(--madder,#8a4447)">' + esc(tr(ex.word)) + '</b>' + (ex.scope ? ' — ' + esc(tr(ex.scope)) : '') + '</div>'
        + (ex.ayahText ? '<div class="qx-ayah">' + ex.ayahText + '</div>' : '')
        + readingRows(ex.readings || [])
        + '</div>';
    }
    if (source) html += '<div class="qx-src">Source: ' + esc(source) + '</div>';
    return html;
  }

  function applyLang(el: HTMLElement): void {
    el.classList.remove('qx-l-ar', 'qx-l-en', 'qx-l-ur');
    el.classList.add('qx-l-' + QLANG);
  }
  function wirePills(el: HTMLElement): void {
    el.querySelectorAll('.qx-lang-b').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const l = btn.getAttribute('data-l');
        QLANG = l === 'en' || l === 'ur' ? l : 'ar';
        lsSet('asl-qx-lang', QLANG);
        for (const rec of rulePanels) {
          rec.el.innerHTML = panelInner(rec.items, rec.isRule);
          applyLang(rec.el);
          wirePills(rec.el);
        }
      });
    });
  }

  function buildPanel(items: QxCard[]): HTMLElement {
    const p = document.createElement('div');
    p.className = 'qx-panel';
    const isRule = isRuleCard(items[0]);
    p.innerHTML = panelInner(items, isRule);
    if (isRule || hasTranslation(items)) {
      applyLang(p);
      wirePills(p);
      rulePanels.push({ el: p, items, isRule });
    }
    return p;
  }

  document.querySelectorAll<HTMLElement>('#main .verse').forEach((v) => {
    const vn = v.querySelector('.vn');
    if (!vn) return;
    const n = (vn.textContent || '').trim();
    if (!hasExample.has(parseInt(n, 10))) return;
    // Accuracy gate: only surface a panel the admin has switched on (the
    // explanation switch for this bayt, set in the content editor). Anything
    // not explicitly enabled stays hidden while its commentary is verified.
    if (!enabled.has(parseInt(n, 10))) return;
    const row = v.querySelector(':scope > .verse-actions');
    if (!row) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'qx-btn';
    btn.title = 'شواهد من القرآن — Qurʾanic examples';
    btn.setAttribute('aria-label', 'Qurʾānic examples for this bayt');
    btn.innerHTML = ICON;
    let panel: HTMLElement | null = null;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (panel) {                                  // already built — just toggle
        const open = !panel.classList.contains('open');
        panel.classList.toggle('open', open);
        btn.classList.toggle('on', open);
        return;
      }
      // First open on this page: pull the examples, then build.
      btn.disabled = true;
      void ensureData().then((data) => {
        btn.disabled = false;
        const items = data?.[n] as QxCard[] | undefined;
        if (!items || !items.length) return;        // offline and never fetched
        panel = buildPanel(items);
        v.appendChild(panel);
        panel.classList.add('open');
        btn.classList.add('on');
      });
    });
    row.insertBefore(btn, row.firstChild);
  });
}
