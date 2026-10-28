/* The Content Editor (/admin/content) — everything that sits under a bayt:
   its English and Urdu translations, its explanation, and (for a matn that has
   them) its qirāʾāt cards, each with the per-bayt switch that shows or hides it
   on the reading page. The verse text itself is edited in the Bayt Editor.

   The only script on its page, so it runs at import time. */
import {
  ApiError, getPoemDoc, getQiraat, getSwitches, saveBayts, saveQiraat, saveSwitches,
} from '../api.ts';
import { signIn, storedPassword } from './auth.ts';
import { ALL_POEMS, explanationBayts, getPoem, isPoemId } from '../../poems/index.ts';
import type { ExpLang, PoemConfig, Switches, Verse } from '../../poems/types.ts';
import {
  DIR_VALUES, EXP_LANGS, PROSE_CLASSES, PROSE_FIELDS, PROSE_TAGS,
  validateBayt, validateQiraatCard, versesOf,
} from '../../shared/poem-data.ts';

type Loose = Record<string, unknown>;
type ExpObj = Partial<Record<ExpLang, string>>;
type TrackId = 'tr' | 'ur' | 'exp' | 'qx';
type Filter = 'all' | 'on' | 'off' | 'has' | 'none';
interface Track {
  label: string;
  kind: 'text' | 'prose' | 'cards';
  lang?: 'en' | 'ur';
  written: (k: number) => string;
}
/** Staged content for one bayt, per field — only what was actually changed. */
interface Staged { tr?: string; ur?: string; exp?: ExpObj; expBy?: string }

const $ = <T extends HTMLElement = HTMLElement>(s: string): T => document.querySelector(s) as T;
const $$ = <T extends HTMLElement = HTMLElement>(s: string): T[] => Array.from(document.querySelectorAll<T>(s));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const isObj = (v: unknown): v is Loose => !!v && typeof v === 'object' && !Array.isArray(v);
const closestIn = <T extends Element>(e: Event, sel: string): T | null =>
  e.target instanceof Element ? e.target.closest<T>(sel) : null;

const nameOf = (id: string): string => getPoem(id)?.shortEn ?? id;

/* The tracks a matn offers, from its registration. Translations always; the
   explanation track when the matn registers `explanations`; the qirāʾāt card
   editor when it registers `qiraat: true`. (The Mutūn site hard-coded this:
   Shāṭibiyyah's "explanation" was not prose at all but the qirāʾāt panel the
   mushaf button opens, so it got the card editor instead of the rich text one,
   and every other matn got the rich text one. A matn may now carry both.) */
const TRACKS: Record<TrackId, Track> = {
  tr:   { label: 'English translation', kind: 'text', lang: 'en',
          written: (k) => `${k} English translation${k === 1 ? '' : 's'} written` },
  ur:   { label: 'Urdu translation',    kind: 'text', lang: 'ur',
          written: (k) => `${k} Urdu translation${k === 1 ? '' : 's'} written` },
  exp:  { label: 'Explanation',         kind: 'prose',
          written: (k) => `${k} explanation${k === 1 ? '' : 's'} written` },
  qx:   { label: 'Qirāʾāt cards',       kind: 'cards',
          written: (k) => `${k} bayt${k === 1 ? '' : 's'} carry cards` },
};
function tracksFor(p: PoemConfig | undefined): TrackId[] {
  const out: TrackId[] = ['tr', 'ur'];
  if (p?.explanations) out.push('exp');
  if (p?.qiraat) out.push('qx');
  return out;
}

let PW = '';
let POEM: string = ALL_POEMS[0]?.id ?? '';
let TRACK: TrackId = 'tr';
let filter: Filter = 'all';

/* Everything loaded for the current matn. Versions are per matn and per
   dataset; they are reloaded on every switch, so nothing from one matn can be
   sent as another's base version. */
let BYNUM = new Map<number, Verse>();   // n -> verse object as stored
let BAYTS: number[] = [];               // sorted verse numbers
let DOC_VERSION: number | null = null;  // version of the poem document
let QX: { version: number; examples: Record<string, Loose[]> } | null = null; // qirāʾāt document
let QX_VERSION: number | null = null;
let SW: Switches = { enabled: {}, trHidden: {}, urHidden: {} };     // as loaded
let SW_NOW: Switches = { enabled: {}, trHidden: {}, urHidden: {} }; // working copy
/** Abyāt that may carry an explanation — the only ones the `enabled` map keeps. */
let SWITCHABLE = new Set<number>();
const EDITS = new Map<number, Staged>();            // n -> staged content, per field
const CARD_EDITS = new Map<number, Loose[] | null>(); // n -> staged qirāʾāt cards
let rows = new Map<number, HTMLElement>();           // n -> row element
let openN: number | null = null;

if (ALL_POEMS.length && document.getElementById('editor')) main();

function main(): void {
  // ---------- gate ----------
  async function tryUnlock(): Promise<void> {
    const val = $<HTMLInputElement>('#pw').value;
    if (!val) return;
    $<HTMLButtonElement>('#unlock').disabled = true;
    const m = $('#gateMsg'); m.className = 'msg'; m.textContent = '';
    let ok: boolean;
    try {
      ok = await signIn(val);
    } catch {
      m.className = 'msg err'; m.textContent = 'Could not reach the server — check your connection.';
      $<HTMLButtonElement>('#unlock').disabled = false; return;
    }
    if (!ok) { m.className = 'msg err'; m.textContent = 'Wrong password.'; $<HTMLButtonElement>('#unlock').disabled = false; return; }
    PW = val;
    $('#gate').classList.add('hidden');
    $('#editor').classList.remove('hidden');
    $<HTMLButtonElement>('#unlock').disabled = false;
    await switchPoem(POEM, true);
  }
  $('#unlock').addEventListener('click', () => void tryUnlock());
  $('#pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') void tryUnlock(); });
  {
    const saved = storedPassword();
    if (saved) { $<HTMLInputElement>('#pw').value = saved; void tryUnlock(); }
  }

  // ---------- loading ----------
  async function loadPoem(): Promise<void> {
    /* Always the document as stored, uncached (api.ts asks with no-store): the
       version number that comes with it is what the next save is checked
       against, so a stale copy would make every save look like someone else's. */
    let doc;
    try {
      doc = await getPoemDoc(POEM);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404)
        throw new Error(`${nameOf(POEM)} is not stored yet — import its text at /admin/import first.`);
      if (e instanceof ApiError) throw new Error(`${nameOf(POEM)} could not be read from storage (HTTP ${e.status}).`);
      throw e;
    }
    if (!doc || !Array.isArray(doc.chapters)) throw new Error(`${nameOf(POEM)} is not stored yet.`);
    BYNUM = new Map();
    for (const v of versesOf(doc.chapters)) BYNUM.set(v.n, v);
    BAYTS = [...BYNUM.keys()].sort((a, b) => a - b);
    /* `?? 1`, never `|| 1` — matches the server, which treats a document
       without a version as version 1 and one with version 0 as 0. */
    DOC_VERSION = doc.version ?? 1;
  }

  async function loadSwitches(): Promise<void> {
    let j: Partial<Switches> | null = null;
    try { j = await getSwitches(POEM); } catch { /* treated as nothing stored */ }
    SW = {
      enabled: j?.enabled || {},
      trHidden: j?.trHidden || {},
      urHidden: j?.urHidden || {},
    };
    SW_NOW = clone(SW);
  }

  async function loadQiraat(): Promise<void> {
    if (QX) return;
    try {
      const doc = await getQiraat(POEM);
      QX = { version: doc.version, examples: (doc.examples || {}) as unknown as Record<string, Loose[]> };
    } catch (e) {
      /* A matn whose cards have never been saved has no dataset yet: start from
         an empty one at version 0 — the first save creates it. */
      if (e instanceof ApiError && e.status === 404) QX = { version: 0, examples: {} };
      else if (e instanceof ApiError) throw new Error(`The qirāʾāt cards could not be read (HTTP ${e.status}).`);
      else throw e;
    }
    // `|| 0`, as the server reads it: a dataset not stored yet is version 0.
    QX_VERSION = QX.version || 0;
  }

  // ---------- switch helpers, per track ----------
  /* Two of the three maps say "hidden" and one says "shown" — translations are
     already live everywhere and must stay so unless a bayt is explicitly listed,
     while an explanation must be switched on deliberately. The rest of the page
     only ever asks isOn()/setOn(), so that asymmetry lives here alone.

     The explanation and the qirāʾāt cards share the one `enabled` map: it is
     the switch the reading page gates both panels on (the Mutūn site's
     qirāʾāt panel read it too), and it only holds the abyāt the registry lets
     carry an explanation (explanations.bayts — all of them by default). */
  const usesEnabled = (): boolean => TRACK === 'exp' || TRACK === 'qx';
  const canSwitch = (n: number): boolean => !usesEnabled() || SWITCHABLE.has(n);
  function isOn(n: number): boolean {
    if (usesEnabled()) return SW_NOW.enabled[n] === true;
    const map = TRACK === 'tr' ? SW_NOW.trHidden : SW_NOW.urHidden;
    return map[n] !== true;
  }
  function setOn(n: number, on: boolean): void {
    if (usesEnabled()) {
      if (!SWITCHABLE.has(n)) return;
      if (on) SW_NOW.enabled[n] = true; else delete SW_NOW.enabled[n];
      return;
    }
    const map = TRACK === 'tr' ? SW_NOW.trHidden : SW_NOW.urHidden;
    if (on) delete map[n]; else map[n] = true;
  }
  function switchKey(): keyof Switches { return usesEnabled() ? 'enabled' : (TRACK === 'tr' ? 'trHidden' : 'urHidden'); }
  function switchesDirty(): boolean {
    const k = switchKey();
    return JSON.stringify(normMap(SW[k])) !== JSON.stringify(normMap(SW_NOW[k]));
  }
  const normMap = (m: Record<string, boolean> | undefined): number[] =>
    Object.keys(m || {}).filter((x) => m?.[x] === true).map(Number).sort((a, b) => a - b);

  // ---------- current value for a bayt, on the current track ----------
  function storedText(n: number): string {
    const v = BYNUM.get(n);
    if (TRACK === 'tr') return v?.tr || '';
    if (TRACK === 'ur') return v?.ur || '';
    return '';
  }
  function storedExp(n: number): ExpObj { return expObject(BYNUM.get(n)?.exp); }
  function expObject(exp: unknown): ExpObj {
    if (!exp) return {};
    if (typeof exp === 'string') return { en: exp };
    if (!isObj(exp)) return {};
    const o: ExpObj = {};
    for (const l of EXP_LANGS) { const s = exp[l]; if (typeof s === 'string' && s.trim()) o[l] = s; }
    return o;
  }
  /** The value as it stands now — staged edit if there is one, else what is stored. */
  function currentText(n: number): string {
    const e = EDITS.get(n);
    if (TRACK === 'tr' && e && 'tr' in e) return e.tr ?? '';
    if (TRACK === 'ur' && e && 'ur' in e) return e.ur ?? '';
    return storedText(n);
  }
  function currentExp(n: number): ExpObj {
    const e = EDITS.get(n);
    return (e && 'exp' in e) ? (e.exp ?? {}) : storedExp(n);
  }
  function currentCards(n: number): Loose[] {
    if (CARD_EDITS.has(n)) return CARD_EDITS.get(n) || [];
    return QX?.examples[n] || [];
  }
  function hasContent(n: number): boolean {
    if (TRACK === 'qx') return currentCards(n).length > 0;
    if (TRACK === 'exp') return Object.keys(currentExp(n)).length > 0;
    return !!currentText(n).trim();
  }

  // ---------- preview ----------
  const strip = (s: unknown): string => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  interface Preview { text: string; blank: boolean; cls: string }
  function previewOf(n: number): Preview {
    if (TRACK === 'qx') {
      const cards = currentCards(n);
      if (!cards.length) return { text: 'No cards', blank: true, cls: '' };
      const bits = cards.map((c) => isObj(c.rule) ? txt(c.rule.title) : txt(c.word)).filter(Boolean);
      return { text: `${cards.length} card${cards.length === 1 ? '' : 's'} — ${bits.join(' · ')}`, blank: false, cls: 'ar' };
    }
    if (TRACK === 'exp') {
      const o = currentExp(n);
      const langs = EXP_LANGS.filter((l) => o[l]);
      const first = langs[0];
      if (!first) return { text: 'No explanation', blank: true, cls: '' };
      return { text: `[${first.toUpperCase()}] ${strip(o[first])}`, blank: false, cls: first === 'ur' ? 'ur' : (first === 'ar' ? 'ar' : '') };
    }
    const v = currentText(n);
    if (!v.trim()) return { text: TRACK === 'ur' ? 'No Urdu translation' : 'No translation', blank: true, cls: '' };
    return { text: v, blank: false, cls: TRACK === 'ur' ? 'ur' : '' };
  }
  /** First non-empty of an {ar,en,ur} field, for a one-line summary. */
  function txt(x: unknown): string {
    if (x == null) return '';
    if (typeof x === 'string') return x;
    if (!isObj(x)) return '';
    for (const l of ['ar', 'en', 'ur']) { const s = x[l]; if (typeof s === 'string' && s) return s; }
    return '';
  }

  // ---------- rendering ----------
  function trackPills(): void {
    const tracks = tracksFor(getPoem(POEM));
    $('#trackPills').innerHTML = tracks.map((t) =>
      `<button type="button" class="pill small track${t === TRACK ? ' active' : ''}" data-track="${t}">${TRACKS[t].label}</button>`,
    ).join(' ');
    /* Both gated tracks on one matn: say that their switch is the same one, so
       turning a bayt's cards on is not a surprise on the explanation track. */
    $('#trackNote').classList.toggle('hidden', !(tracks.includes('exp') && tracks.includes('qx') && usesEnabled()));
  }

  function buildList(): void {
    const frag = document.createDocumentFragment();
    rows = new Map();
    openN = null;
    for (const n of BAYTS) {
      const row = document.createElement('div');
      row.className = 'row';
      row.dataset.bayt = String(n);
      row.appendChild(rowHead(n));
      frag.appendChild(row);
      rows.set(n, row);
    }
    const list = $('#list');
    list.innerHTML = '';
    list.appendChild(frag);
    applyFilter();
  }

  function rowHead(n: number): HTMLElement {
    const head = document.createElement('div');
    head.className = 'rowhead';
    const p = previewOf(n);
    const locked = canSwitch(n) ? ''
      : ' disabled title="This bayt carries no explanation (explanations.bayts in the registry)"';
    head.innerHTML =
      `<label class="sw"><input type="checkbox" data-sw="${n}"${isOn(n) ? ' checked' : ''}${locked}` +
      ` aria-label="Show bayt ${n} on the reading page"><span class="track"></span><span class="knob"></span></label>` +
      `<span class="n">Bayt <b>${n}</b></span>` +
      `<span class="prev ${p.cls}${p.blank ? ' blank' : ''}"></span>` +
      `<button type="button" class="edit-b" data-edit="${n}">Edit</button>`;
    head.querySelector('.prev')!.textContent = p.text;
    return head;
  }

  function refreshRow(n: number): void {
    const row = rows.get(n);
    if (!row) return;
    const head = row.querySelector('.rowhead')!;
    const p = previewOf(n);
    const prev = head.querySelector('.prev')!;
    prev.className = 'prev ' + p.cls + (p.blank ? ' blank' : '');
    prev.textContent = p.text;
    const box = head.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    if (box.checked !== isOn(n)) box.checked = isOn(n);
  }

  function refresh(): void {
    let on = 0, written = 0;
    for (const n of BAYTS) { if (isOn(n)) on++; if (hasContent(n)) written++; }
    $('#count').innerHTML =
      `<b>${on}</b> of <b>${BAYTS.length}</b> shown to readers · ` +
      TRACKS[TRACK].written(written).replace(/^(\d+)/, '<b>$1</b>');
    const dirty = isDirty();
    $<HTMLButtonElement>('#save').disabled = !dirty;
    $('#dirtyNote').classList.toggle('show', dirty);
  }
  function isDirty(): boolean { return switchesDirty() || EDITS.size > 0 || CARD_EDITS.size > 0; }

  // ---------- list interactions ----------
  $('#list').addEventListener('change', (e) => {
    const box = closestIn<HTMLInputElement>(e, 'input[data-sw]');
    if (!box) return;
    const n = Number(box.dataset.sw);
    setOn(n, box.checked);
    refreshRow(n);
    refresh();
    if (filter !== 'all') applyFilter();
    // "toggle it on and write it" — switching a bayt on opens its editor, which
    // is the point of turning one on when there is nothing there yet
    if (box.checked && openN !== n) openEditor(n);
  });
  $('#list').addEventListener('click', (e) => {
    const b = closestIn<HTMLButtonElement>(e, 'button[data-edit]');
    if (!b) return;
    const n = Number(b.dataset.edit);
    if (openN === n) closeEditor(); else openEditor(n);
  });

  function closeEditor(): void {
    if (openN == null) return;
    const row = rows.get(openN);
    if (row) {
      row.querySelector('.ed')?.remove();
      row.classList.remove('open');
    }
    openN = null;
  }
  /** The bayt being edited, RTL and in the reading font. */
  function hintFor(n: number): string {
    const v = BYNUM.get(n);
    return `<div class="hint">${strip(v?.sadr)} <span class="bn">‖</span> ${strip(v?.ajuz)} <span class="bn">— bayt ${n}</span></div>`;
  }
  function openEditor(n: number): void {
    closeEditor();
    const row = rows.get(n);
    if (!row) return;
    row.classList.add('open');
    const ed = document.createElement('div');
    ed.className = 'ed';
    if (TRACK === 'tr' || TRACK === 'ur') plainEditor(ed, n);
    else if (TRACK === 'exp') proseEditor(ed, n);
    else cardsEditor(ed, n);
    row.appendChild(ed);
    openN = n;
    ed.scrollIntoView({ block: 'nearest' });
  }

  // ---------- plain-text editor (translations) ----------
  /* Translations stay plain text: the reading page injects them as HTML, so the
     API rejects "<" and ">" outright. A rich box here would only invite markup
     that the save would then refuse. */
  function plainEditor(ed: HTMLElement, n: number): void {
    const key = TRACK as 'tr' | 'ur';
    const lang = TRACKS[key].lang;
    const ta = document.createElement('textarea');
    ta.className = lang === 'ur' ? 'ta-ur' : '';
    if (lang === 'ur') { ta.dir = 'rtl'; ta.lang = 'ur'; }
    ta.placeholder = lang === 'ur' ? 'اردو ترجمہ…' : 'English translation…';
    ta.value = currentText(n);
    ed.innerHTML = hintFor(n);
    ed.appendChild(ta);
    const actions = document.createElement('div');
    actions.className = 'ed-actions';
    actions.innerHTML =
      `<button type="button" class="mini" data-act="revert">Revert to saved</button>` +
      `<button type="button" class="mini danger" data-act="clear">Delete this translation</button>` +
      `<span class="ed-note">Plain text — no formatting.</span>`;
    ed.appendChild(actions);

    const stage = (): void => {
      const val = ta.value;
      if (val === storedText(n)) dropEdit(n, key);
      else setEdit(n, key, val);
      refreshRow(n); refresh();
    };
    ta.addEventListener('input', stage);
    actions.addEventListener('click', (e) => {
      const a = closestIn<HTMLButtonElement>(e, 'button[data-act]');
      if (!a) return;
      if (a.dataset.act === 'revert') ta.value = storedText(n);
      if (a.dataset.act === 'clear') ta.value = '';
      stage();
    });
  }

  function setEdit<K extends keyof Staged>(n: number, key: K, val: Staged[K]): void {
    const e = EDITS.get(n) || {};
    e[key] = val;
    EDITS.set(n, e);
  }
  function dropEdit(n: number, key: keyof Staged): void {
    const e = EDITS.get(n);
    if (!e) return;
    delete e[key];
    if (!Object.keys(e).length) EDITS.delete(n);
  }

  // ---------- rich text editor (explanations) ----------
  /* The vocabulary is the one the API enforces (src/shared/poem-data.ts). */
  const PROSE_TAGS_UC = PROSE_TAGS.map((t) => t.toUpperCase());
  /* Everything else is unwrapped and its text kept — that is what makes a paste
     from Word survive as readable prose. These are the exceptions: their content
     is not prose at all, so keeping it would drop stylesheet or script source
     into the explanation as visible text. Dropped whole, subtree and all. */
  const DROP_WHOLE = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT', 'HEAD', 'TITLE'];

  /* contenteditable produces whatever the browser feels like — <div> wrappers,
     <font> tags, style attributes pasted in from Word. The API would reject all
     of it, so the box is read back through this instead of being trusted: it
     rebuilds the fragment from the tags and classes that are actually allowed
     and drops the rest, keeping the text. */
  function cleanProse(root: Node): string {
    const out = document.createElement('div');
    (function walk(src: Node, dst: Node): void {
      for (const node of Array.from(src.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) { dst.appendChild(document.createTextNode(node.nodeValue ?? '')); continue; }
        if (!(node instanceof Element)) continue;
        let tag = node.tagName;
        if (DROP_WHOLE.includes(tag)) continue;               // not prose — drop the subtree
        if (tag === 'DIV') tag = 'P';                         // Chrome's line wrapper
        if (tag === 'STRONG') tag = 'B';
        if (tag === 'EM') tag = 'I';
        if (!PROSE_TAGS_UC.includes(tag)) { walk(node, dst); continue; }   // unwrap, keep the text
        const el = document.createElement(tag.toLowerCase());
        const cls = Array.from(node.classList).filter((c) => PROSE_CLASSES.includes(c));
        if (cls.length) el.className = cls.join(' ');
        const dir = node.getAttribute('dir');
        if (dir && DIR_VALUES.includes(dir)) el.setAttribute('dir', dir);
        dst.appendChild(el);
        walk(node, el);
      }
    })(root, out);
    // strip empties left behind by unwrapping, then normalise whitespace
    out.querySelectorAll('p,span,b,i,u,li').forEach((el) => {
      if (!(el.textContent ?? '').trim() && !el.querySelector('br,img')) el.remove();
    });
    return out.innerHTML.replace(/\s+/g, ' ').trim();
  }

  /* Prose written before there was any rule about what stored prose may
     contain can carry `<p dir='rtl' style='text-align:center;font-size:1.15em'>`.
     It says "a quoted line set apart", which is exactly what class="qline"
     means, so convert it on the way in rather than making the author's first
     save fail validation on markup they never typed. */
  function modernise(html: string): string {
    return String(html || '').replace(
      /<p([^>]*?)style=(["'])[^"']*text-align:\s*center[^"']*\2([^>]*)>/gi,
      (_m, a: string, _q: string, b: string) => `<p class="qline"${/dir=/.test(a + b) ? ' dir="rtl"' : ''}>`);
  }
  /* Put a stored string through exactly what the editable box would do to it,
     without showing it. innerHTML on a detached node never runs a <script>. */
  function sanitiseProse(html: string): string {
    const d = document.createElement('div');
    d.innerHTML = modernise(html || '');
    return cleanProse(d);
  }
  /* EVERY language, not just the one on screen.
     A save sends the whole explanation object, so a language the author never
     opened would go out exactly as stored — and one stored with an inline style
     still on it would make the API refuse the lot. Cleaning all three at load
     also means the dirty check compares like with like: this is the baseline,
     so merely opening a bayt never counts as an edit. */
  function sanitiseExp(o: ExpObj): ExpObj {
    const out: ExpObj = {};
    for (const l of EXP_LANGS) {
      const src = o[l];
      if (!src) continue;
      const s = sanitiseProse(src);
      if (s) out[l] = s;
    }
    return out;
  }

  function proseEditor(ed: HTMLElement, n: number): void {
    const v = BYNUM.get(n);
    const staged = EDITS.get(n);
    const base: ExpObj = (staged && 'exp' in staged) ? (staged.exp ?? {}) : sanitiseExp(storedExp(n));
    const val: ExpObj = clone(base);
    let lang: ExpLang = EXP_LANGS.find((l) => val[l]) || 'en';
    /* The attribution the reading page falls back to when a bayt records none. */
    const defaultBy = getPoem(POEM)?.explanations?.by;

    ed.innerHTML =
      hintFor(n) +
      `<div class="langtabs" id="lt"></div>` +
      `<div class="rt-tools">` +
        `<button type="button" data-cmd="bold"><b>B</b></button>` +
        `<button type="button" data-cmd="italic"><i>I</i></button>` +
        `<button type="button" data-cmd="underline"><u>U</u></button>` +
        `<button type="button" data-cmd="insertUnorderedList">• List</button>` +
        `<button type="button" data-wrap="ar">Arabic run</button>` +
        `<button type="button" data-wrap="ur">Urdu run</button>` +
        `<button type="button" data-line="qline">Centred line</button>` +
        `<button type="button" data-cmd="removeFormat">Clear ✕</button>` +
      `</div>` +
      `<div class="rt" contenteditable="true" id="rt"></div>` +
      `<div class="ed-actions">` +
        `<label style="flex:1 1 220px;min-width:180px"><span class="ed-note">Attribution (optional)</span>` +
        `<input type="text" id="expBy"></label>` +
      `</div>` +
      `<div class="ed-actions">` +
        `<button type="button" class="mini" data-act="revert">Revert to saved</button>` +
        `<button type="button" class="mini danger" data-act="clearLang">Delete this language</button>` +
        `<button type="button" class="mini danger" data-act="clearAll">Delete the whole explanation</button>` +
      `</div>`;

    const rt = ed.querySelector<HTMLElement>('#rt')!;
    const by = ed.querySelector<HTMLInputElement>('#expBy')!;
    const lt = ed.querySelector<HTMLElement>('#lt')!;
    by.placeholder = defaultBy ? `Blank shows the default: ${defaultBy}` : 'e.g. the title of the commentary';
    const st = EDITS.get(n);
    by.value = (st && 'expBy' in st) ? (st.expBy ?? '') : (v?.expBy || '');

    function paintTabs(): void {
      lt.innerHTML = EXP_LANGS.map((l) =>
        `<button type="button" data-l="${l}" class="${l === lang ? 'on' : ''}">` +
        `${l === 'en' ? 'EN' : (l === 'ur' ? 'اردو' : 'ع')}${val[l] ? '<span class="dot"></span>' : ''}</button>`,
      ).join('');
    }
    function showLang(l: ExpLang): void {
      lang = l;
      rt.className = 'rt lang-' + l;
      if (l === 'en') rt.removeAttribute('dir'); else rt.dir = 'rtl';
      rt.innerHTML = val[l] || '';       // already cleaned — see sanitiseExp
      paintTabs();
    }
    function stash(): void { const s = cleanProse(rt); if (s) val[lang] = s; else delete val[lang]; }
    function stage(): void {
      stash();
      if (JSON.stringify(val) === JSON.stringify(base)) dropEdit(n, 'exp');
      else setEdit(n, 'exp', clone(val));
      const byNow = by.value.trim();
      if (byNow === (v?.expBy || '')) dropEdit(n, 'expBy'); else setEdit(n, 'expBy', byNow);
      paintTabs(); refreshRow(n); refresh();
    }

    showLang(lang);
    rt.addEventListener('input', stage);
    rt.addEventListener('blur', stage);
    by.addEventListener('input', stage);

    lt.addEventListener('click', (e) => {
      const b = closestIn<HTMLButtonElement>(e, 'button[data-l]');
      if (!b) return;
      stash();
      showLang(b.dataset.l as ExpLang);
    });

    ed.querySelector('.rt-tools')!.addEventListener('click', (e) => {
      const b = closestIn<HTMLButtonElement>(e, 'button');
      if (!b) return;
      rt.focus();
      if (b.dataset.cmd) document.execCommand(b.dataset.cmd, false);
      else if (b.dataset.wrap) wrapSelection(rt, b.dataset.wrap);
      else if (b.dataset.line) lineClass(rt, b.dataset.line);
      stage();
    });

    ed.querySelectorAll<HTMLButtonElement>('.ed-actions button[data-act]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.act === 'revert') {
        for (const k of Object.keys(val) as ExpLang[]) delete val[k];
        Object.assign(val, clone(base));
        by.value = v?.expBy || '';
        dropEdit(n, 'exp'); dropEdit(n, 'expBy');
        showLang(EXP_LANGS.find((l) => val[l]) || 'en');
      } else if (b.dataset.act === 'clearLang') {
        rt.innerHTML = '';
      } else {
        for (const k of Object.keys(val) as ExpLang[]) delete val[k];
        rt.innerHTML = '';
        paintTabs();
      }
      stage();
    }));
  }

  /** Wrap whatever is selected in <span class="ar"> / <span class="ur">. */
  function wrapSelection(root: HTMLElement, cls: string): void {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer) || range.collapsed) return;
    const span = document.createElement('span');
    span.className = cls;
    try { range.surroundContents(span); }
    catch { span.appendChild(range.extractContents()); range.insertNode(span); }
    sel.removeAllRanges();
  }
  /** Turn the paragraph the caret is in into a centred display line (or back). */
  function lineClass(root: HTMLElement, cls: string): void {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    let node: Node | null = sel.getRangeAt(0).startContainer;
    while (node && node !== root && !(node instanceof Element && /^(P|LI)$/.test(node.tagName))) node = node.parentNode;
    if (!node || node === root || !(node instanceof Element)) { document.execCommand('formatBlock', false, 'p'); return; }
    const on = node.classList.toggle(cls);
    if (on) node.setAttribute('dir', 'rtl'); else node.removeAttribute('dir');
  }

  // ---------- qirāʾāt card editor ----------
  /* One recursive form driven by the card's own shape, rather than a hand-written
     layout per card kind. Every text field in this dataset is either a plain
     string or an {ar,en,ur} triple, so they all render the same way — which also
     means a field can never be missing from the form because someone forgot it.
     Known keys get a readable label; anything unrecognised still gets an editor. */
  const QLABEL: Record<string, string> = {
    word: 'Word', scope: 'Scope / note', sura: 'Sūra', ayah: 'Āyah', ayahText: 'Āyah text',
    readings: 'Readings', who: 'Who reads it', how: 'How they read it', note: 'Note',
    hafs: 'This is our reading (Ḥafṣ)', rule: 'Rule', kind: 'Kind', title: 'Title',
    statement: 'Statement', conditions: 'Conditions', caution: 'Caution', examples: 'Examples',
    case: 'Case', word_: 'Word',
  };
  const qlabel = (k: string): string => QLABEL[k] || k;
  const LANG3: [l: 'ar' | 'en' | 'ur', tag: string][] = [['ar', 'ع'], ['en', 'EN'], ['ur', 'اردو']];
  type Triple = Record<'ar' | 'en' | 'ur', string>;

  function asTriple(v: unknown): Triple {
    if (v == null) return { ar: '', en: '', ur: '' };
    if (typeof v === 'string') return { ar: v, en: '', ur: '' };
    const o = isObj(v) ? v : {};
    const s = (x: unknown): string => (typeof x === 'string' ? x : '');
    return { ar: s(o.ar), en: s(o.en), ur: s(o.ur) };
  }
  function tidyTriple(t: Triple): Partial<Triple> | null {
    const o: Partial<Triple> = {};
    for (const l of ['ar', 'en', 'ur'] as const) if (t[l] && t[l].trim()) o[l] = t[l].trim();
    return Object.keys(o).length ? o : null;
  }
  /* The form edits plain objects and, for conditions/caution, arrays of lines;
     these read and write either by key. */
  type Holder = Loose | unknown[];
  function take(obj: Holder, key: string): unknown { return Array.isArray(obj) ? obj[Number(key)] : obj[key]; }
  function put(obj: Holder, key: string, v: unknown): void { if (Array.isArray(obj)) obj[Number(key)] = v; else obj[key] = v; }

  function cardsEditor(ed: HTMLElement, n: number): void {
    // a deep copy that the form mutates; nothing is staged until it differs
    let cards: Loose[] = clone(currentCards(n));

    const draw = (): void => {
      ed.innerHTML = hintFor(n);
      const host = document.createElement('div');
      cards.forEach((c, i) => host.appendChild(cardForm(c, i)));
      ed.appendChild(host);
      const add = document.createElement('div');
      add.className = 'ed-actions';
      add.innerHTML =
        `<button type="button" class="mini" data-new="example">+ Word card</button>` +
        `<button type="button" class="mini" data-new="rule">+ Rule card</button>` +
        `<button type="button" class="mini" data-act="revert">Revert to saved</button>` +
        (cards.length ? `<button type="button" class="mini danger" data-act="clear">Remove all cards</button>` : '') +
        `<span class="ed-note">Cards show under this bayt when the switch is on.</span>`;
      ed.appendChild(add);
      add.addEventListener('click', (e) => {
        const b = closestIn<HTMLButtonElement>(e, 'button');
        if (!b) return;
        if (b.dataset.new === 'example') cards.push({ word: { ar: '' }, sura: '', ayah: null, ayahText: '', readings: [blankReading()] });
        else if (b.dataset.new === 'rule') cards.push({ rule: { kind: 'rule', title: { ar: '' }, statement: { ar: '' }, conditions: [] }, readings: [] });
        else if (b.dataset.act === 'revert') cards = clone(QX?.examples[n] || []);
        else if (b.dataset.act === 'clear') { if (!confirm(`Remove all cards from bayt ${n}?`)) return; cards = []; }
        stage(); draw();
      });
    };

    const blankReading = (): Loose => ({ who: { ar: '' }, how: { ar: '' }, note: { ar: '' } });

    /* Tidied on both sides of the comparison. Most stored readings carry a note
       that is blank in all three languages; tidying only the working copy would
       make every card look edited the moment its form was opened. */
    function stage(): void {
      const tidied = tidyCards(cards);
      const before = tidyCards(QX?.examples[n] || []);
      if (JSON.stringify(tidied) === JSON.stringify(before)) CARD_EDITS.delete(n);
      else CARD_EDITS.set(n, tidied.length ? tidied : null);
      refreshRow(n); refresh();
    }

    function cardForm(c: Loose, i: number): HTMLElement {
      const box = document.createElement('div');
      box.className = 'qc';
      const rule = isObj(c.rule) ? c.rule : null;
      const head = document.createElement('div');
      head.className = 'qc-head';
      head.innerHTML =
        `<span class="qc-badge${rule ? ' rule' : ''}">${rule ? 'Rule' : 'Word'}</span>` +
        `<span class="ed-note">Card ${i + 1} of ${cards.length}</span>` +
        `<span class="sp"></span>` +
        (i > 0 ? `<button type="button" class="mini" data-up="${i}">↑</button>` : '') +
        `<button type="button" class="mini danger" data-del="${i}">Remove</button>`;
      head.addEventListener('click', (e) => {
        const b = closestIn<HTMLButtonElement>(e, 'button');
        if (!b) return;
        if (b.dataset.del != null) { cards.splice(i, 1); }
        else if (b.dataset.up != null) { const [x] = cards.splice(i, 1); if (x) cards.splice(i - 1, 0, x); }
        stage(); draw();
      });
      box.appendChild(head);

      if (rule) {
        box.appendChild(selectField(rule, 'kind', ['rule', 'explain']));
        box.appendChild(tripleField(rule, 'title'));
        box.appendChild(tripleField(rule, 'statement'));
        box.appendChild(listField(rule, 'conditions'));
        box.appendChild(listField(rule, 'caution'));
        box.appendChild(readingsField(c));
        box.appendChild(examplesField(c));
      } else {
        box.appendChild(tripleField(c, 'word'));
        box.appendChild(tripleField(c, 'scope'));
        box.appendChild(tripleField(c, 'sura'));
        box.appendChild(numField(c, 'ayah'));
        box.appendChild(ayahField(c, 'ayahText'));
        box.appendChild(readingsField(c));
      }
      return box;
    }

    function tripleField(obj: Holder, key: string, label?: string): HTMLElement {
      const f = document.createElement('div');
      f.className = 'f';
      const t = asTriple(take(obj, key));
      f.innerHTML = `<label>${label || qlabel(key)}</label><div class="f3">` + LANG3.map(([l, tag]) =>
        `<span class="tag">${tag}</span><input type="text" data-l="${l}"${l === 'en' ? '' : ' dir="rtl"'}` +
        `${l === 'ur' ? ' class="u"' : ''}>`).join('') + `</div>`;
      f.querySelectorAll<HTMLInputElement>('input').forEach((inp) => {
        const l = inp.dataset.l as keyof Triple;
        inp.value = t[l] || '';
        inp.addEventListener('input', () => { t[l] = inp.value; put(obj, key, tidyTriple(t) || undefined); stage(); });
      });
      return f;
    }
    function numField(obj: Loose, key: string): HTMLElement {
      const f = document.createElement('div');
      f.className = 'f';
      f.innerHTML = `<label>${qlabel(key)}</label><input type="number" min="1" step="1">`;
      const inp = f.querySelector('input')!;
      inp.value = obj[key] == null ? '' : String(obj[key]);
      inp.addEventListener('input', () => {
        const x = parseInt(inp.value, 10);
        obj[key] = Number.isInteger(x) ? x : undefined;
        stage();
      });
      return f;
    }
    /* The one card field that reaches the page as HTML — only <b>, used to pick
       the treated word out of the āyah. The button wraps the selection so nobody
       has to type a tag. */
    function ayahField(obj: Loose, key: string): HTMLElement {
      const f = document.createElement('div');
      f.className = 'f';
      f.innerHTML = `<label>${qlabel(key)} <span class="ed-note">— select a word and press Bold</span></label>` +
        `<textarea dir="rtl" style="font-family:'Scheherazade New',serif;font-size:1.15rem;min-height:60px"></textarea>` +
        `<div class="ed-actions"><button type="button" class="mini" data-b="1">Bold the selection</button></div>`;
      const ta = f.querySelector('textarea')!;
      ta.value = typeof obj[key] === 'string' ? obj[key] : '';
      ta.addEventListener('input', () => { obj[key] = ta.value || undefined; stage(); });
      f.querySelector('button')!.addEventListener('click', () => {
        const s = ta.selectionStart, e2 = ta.selectionEnd;
        if (s === e2) return;
        ta.value = ta.value.slice(0, s) + '<b>' + ta.value.slice(s, e2) + '</b>' + ta.value.slice(e2);
        obj[key] = ta.value; stage();
      });
      return f;
    }
    function selectField(obj: Loose, key: string, opts: string[]): HTMLElement {
      const f = document.createElement('div');
      f.className = 'f';
      f.innerHTML = `<label>${qlabel(key)}</label><select>` +
        opts.map((o) => `<option value="${o}">${o === 'explain' ? 'explain (commentary)' : 'rule'}</option>`).join('') + `</select>`;
      const sel = f.querySelector('select')!;
      sel.value = typeof obj[key] === 'string' && obj[key] ? obj[key] : (opts[0] ?? '');
      sel.addEventListener('change', () => { obj[key] = sel.value; stage(); });
      return f;
    }
    /** conditions / caution — an ordered list of {ar,en,ur} lines. */
    function listField(obj: Loose, key: string): HTMLElement {
      const g = document.createElement('div');
      g.className = 'grp';
      const cur = obj[key];
      const items: unknown[] = Array.isArray(cur) ? cur : [];
      g.innerHTML = `<div class="glabel">${qlabel(key)}</div>`;
      const one = qlabel(key).replace(/s$/, '');
      items.forEach((_, i) => {
        const wrap = document.createElement('div');
        wrap.appendChild(tripleField(items, String(i), `${one} ${i + 1}`));
        const rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'mini danger'; rm.textContent = 'Remove';
        rm.addEventListener('click', () => { items.splice(i, 1); obj[key] = items; stage(); draw(); });
        wrap.appendChild(rm);
        g.appendChild(wrap);
      });
      const add = document.createElement('button');
      add.type = 'button'; add.className = 'mini'; add.textContent = '+ ' + one;
      add.addEventListener('click', () => { items.push({ ar: '' }); obj[key] = items; stage(); draw(); });
      g.appendChild(add);
      return g;
    }
    function readingsField(c: Loose): HTMLElement {
      const g = document.createElement('div');
      g.className = 'grp';
      const rs: Loose[] = Array.isArray(c.readings) ? (c.readings as Loose[]) : (c.readings = []) as Loose[];
      g.innerHTML = `<div class="glabel">${qlabel('readings')}</div>`;
      rs.forEach((r, i) => {
        const wrap = document.createElement('div');
        wrap.className = 'qc';
        wrap.style.margin = '6px 0';
        wrap.appendChild(tripleField(r, 'who'));
        wrap.appendChild(tripleField(r, 'how'));
        wrap.appendChild(tripleField(r, 'note'));
        const foot = document.createElement('div');
        foot.className = 'ed-actions';
        foot.innerHTML = `<label class="chk"><input type="checkbox"${r.hafs ? ' checked' : ''}>${qlabel('hafs')}</label>` +
          `<button type="button" class="mini danger">Remove reading</button>`;
        const hafs = foot.querySelector('input')!;
        hafs.addEventListener('change', () => {
          if (hafs.checked) r.hafs = true; else delete r.hafs;
          stage();
        });
        foot.querySelector('button')!.addEventListener('click', () => { rs.splice(i, 1); stage(); draw(); });
        wrap.appendChild(foot);
        g.appendChild(wrap);
      });
      const add = document.createElement('button');
      add.type = 'button'; add.className = 'mini'; add.textContent = '+ Reading';
      add.addEventListener('click', () => { rs.push(blankReading()); stage(); draw(); });
      g.appendChild(add);
      return g;
    }
    function examplesField(c: Loose): HTMLElement {
      const g = document.createElement('div');
      g.className = 'grp';
      const ex: Loose[] = Array.isArray(c.examples) ? (c.examples as Loose[]) : (c.examples = []) as Loose[];
      g.innerHTML = `<div class="glabel">${qlabel('examples')}</div>`;
      ex.forEach((e2, i) => {
        const wrap = document.createElement('div');
        wrap.className = 'qc';
        wrap.style.margin = '6px 0';
        wrap.appendChild(tripleField(e2, 'word'));
        wrap.appendChild(tripleField(e2, 'case'));
        wrap.appendChild(tripleField(e2, 'sura'));
        wrap.appendChild(numField(e2, 'ayah'));
        wrap.appendChild(ayahField(e2, 'ayahText'));
        const rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'mini danger'; rm.textContent = 'Remove example';
        rm.addEventListener('click', () => { ex.splice(i, 1); stage(); draw(); });
        wrap.appendChild(rm);
        g.appendChild(wrap);
      });
      const add = document.createElement('button');
      add.type = 'button'; add.className = 'mini'; add.textContent = '+ Example';
      add.addEventListener('click', () => { ex.push({ word: { ar: '' }, sura: '', ayah: null, ayahText: '' }); stage(); draw(); });
      g.appendChild(add);
      return g;
    }

    draw();
  }

  /* Drop the empty fields the form leaves behind, so a save is a real diff.

     Bottom-up, deliberately. A reading added and left blank starts as
     {who:{ar:''}, how:{ar:''}, note:{ar:''}}: the blank strings go first, which
     empties the three triples, which empties the reading itself. A single
     top-down pass sees each of those as non-empty at the moment it looks at it
     and leaves {who:{},how:{},note:{}} behind — junk that the API then rejects,
     failing the whole save over a row the author never filled in.

     Empty ARRAYS are kept: a card with `readings: []` is a real thing — a source
     may give the word and the āyah without saying which reciters hold each
     view — and dropping the key would make the card fail validation on the way
     back. */
  function prune(v: unknown): unknown {
    if (v === undefined || v === null) return undefined;
    if (typeof v === 'string') { const s = v.trim(); return s === '' ? undefined : s; }
    if (Array.isArray(v)) return v.map(prune).filter((x) => x !== undefined);
    if (typeof v === 'object') {
      const out: Loose = {};
      for (const k of Object.keys(v)) {
        const x = prune((v as Loose)[k]);
        if (x !== undefined) out[k] = x;
      }
      return Object.keys(out).length ? out : undefined;
    }
    return v;
  }
  function tidyCards(cards: Loose[]): Loose[] { return (prune(cards) as Loose[] | undefined) || []; }

  // ---------- filter / search ----------
  function applyFilter(): void {
    const q = ($<HTMLInputElement>('#search').value || '').replace(/[^0-9]/g, '');
    for (const n of BAYTS) {
      const row = rows.get(n);
      if (!row) continue;
      const on = isOn(n), has = hasContent(n);
      const passF = filter === 'all'
        || (filter === 'on' && on) || (filter === 'off' && !on)
        || (filter === 'has' && has) || (filter === 'none' && !has);
      const passQ = !q || String(n).indexOf(q) === 0;
      row.style.display = (passF && passQ) ? '' : 'none';
    }
  }
  $$<HTMLButtonElement>('.filt').forEach((b) => b.addEventListener('click', () => {
    filter = (b.dataset.f || 'all') as Filter;
    $$('.filt').forEach((x) => x.classList.toggle('active', x === b));
    applyFilter();
  }));
  $('#search').addEventListener('input', applyFilter);

  $('#showAll').addEventListener('click', () => bulk(true));
  $('#hideAll').addEventListener('click', () => bulk(false));
  function bulk(on: boolean): void {
    let count = 0;
    for (const n of BAYTS) {
      const row = rows.get(n);
      if (!row || row.style.display === 'none' || !canSwitch(n)) continue;
      setOn(n, on); refreshRow(n); count++;
    }
    if (count) { refresh(); applyFilter(); }
  }

  // ---------- matn / track switching ----------
  async function switchPoem(p: string, force = false): Promise<void> {
    if (!force && p === POEM) return;
    if (!force && isDirty() && !confirm(`Discard unsaved changes to ${nameOf(POEM)}?`)) return;
    POEM = p;
    QX = null; QX_VERSION = null;
    const cfg = getPoem(POEM);
    SWITCHABLE = new Set(cfg ? explanationBayts(cfg) : []);
    if (!tracksFor(cfg).includes(TRACK)) TRACK = 'tr';
    $$('.pill.poem').forEach((b) => b.classList.toggle('active', b.dataset.poem === POEM));
    history.replaceState(null, '', location.pathname + '?poem=' + encodeURIComponent(POEM));
    await reload();
  }
  async function switchTrack(t: TrackId): Promise<void> {
    if (t === TRACK) return;
    if (isDirty() && !confirm('Discard unsaved changes to this track?')) return;
    TRACK = t;
    await reload();
  }
  async function reload(): Promise<void> {
    EDITS.clear(); CARD_EDITS.clear();
    closeEditor();
    showMsg('', '');
    trackPills();
    $('#list').innerHTML = '<div class="empty">Loading…</div>';
    try {
      await Promise.all([loadPoem(), loadSwitches()]);
      if (TRACK === 'qx') await loadQiraat();
    } catch (e) {
      // textContent: the message may quote server text
      const box = document.createElement('div');
      box.className = 'empty';
      box.textContent = (e instanceof Error && e.message) || 'Could not load.';
      $('#list').replaceChildren(box);
      $('#count').textContent = '';
      $<HTMLButtonElement>('#save').disabled = true;
      return;
    }
    buildList();
    refresh();
  }
  $$<HTMLButtonElement>('.pill.poem').forEach((b) => b.addEventListener('click', () => void switchPoem(b.dataset.poem || '')));
  $('#trackPills').addEventListener('click', (e) => {
    const b = closestIn<HTMLButtonElement>(e, 'button[data-track]');
    if (b) void switchTrack(b.dataset.track as TrackId);
  });

  // ---------- save ----------
  /* textContent, not innerHTML. A validation error names the tag it objected to
     — "stray attribute(s) [\"style\"] on <p>" — and setting that as HTML parsed
     the <p> as markup, so the message stopped dead at "on" and hid the one word
     that said where to look. */
  function showMsg(kind: '' | 'ok' | 'err' | 'warn', text: string): void {
    const m = $('#msg');
    m.className = 'msg' + (kind ? ' ' + kind : '');
    m.textContent = text;
  }
  window.addEventListener('beforeunload', (e) => {
    if (isDirty()) { e.preventDefault(); e.returnValue = 'You have unsaved changes.'; }
  });

  /** The error a failed save reports: the server's own words when it gave any,
      else "<label>: HTTP <status>". `stale` names the dataset for a 409. */
  function saveError(e: unknown, label: string, stale?: { what: string; is: string }): Error {
    if (!(e instanceof ApiError)) return e instanceof Error ? e : new Error(String(e));
    if (e.status === 409 && stale) {
      /* A stale baseVersion says which versions collided; a write that lost the
         compare-and-swap race does not, so it gets the sentence without them. */
      const theirs = e.body?.version, yours = e.body?.yours;
      const which = theirs != null && yours != null
        ? ` (${stale.is} v${String(theirs)}, you were editing v${String(yours)})` : '';
      return new Error(`Someone else saved ${stale.what} first${which}. Nothing was lost — reload the matn and reapply.`);
    }
    if (e.status === 422) return new Error('Rejected — ' + (e.problems.length ? e.problems : ['validation failed']).slice(0, 4).join(' · '));
    return new Error(typeof e.body?.error === 'string' ? e.body.error : `${label}: HTTP ${e.status}`);
  }

  $('#save').addEventListener('click', () => void save());
  async function save(): Promise<void> {
    if (!isDirty()) return;

    /* Checked before anything is sent, against the same rules the API enforces
       (src/shared/poem-data.ts). A save can touch three stores, and finding a
       half-written card after the first two have gone through would leave the
       matn saved in pieces. */
    const bayts = [...EDITS.entries()].sort((a, b) => a[0] - b[0]).map(([n, e]) => ({ n, ...e }));
    const incomplete: string[] = [];
    for (const b of bayts) incomplete.push(...validateBayt(b));
    for (const [n, list] of CARD_EDITS) {
      (list || []).forEach((c, i) => incomplete.push(...validateQiraatCard(c, `Bayt ${n}, card ${i + 1}`)));
    }
    if (incomplete.length) {
      showMsg('err', 'Nothing saved — ' + incomplete.slice(0, 4).join(' · ') +
        (incomplete.length > 4 ? ` · and ${incomplete.length - 4} more` : ''));
      return;
    }

    $<HTMLButtonElement>('#save').disabled = true;
    showMsg('', 'Saving…');
    const done: string[] = [];
    try {
      if (switchesDirty()) {
        const k = switchKey();
        const maps: Partial<Switches> = { [k]: SW_NOW[k] };
        try { await saveSwitches(PW, POEM, maps); }
        catch (e) { throw saveError(e, 'Switches'); }
        SW[k] = clone(SW_NOW[k]);
        const shown = BAYTS.filter(isOn).length;
        done.push(`${shown} of ${BAYTS.length} shown to readers`);
      }

      if (bayts.length) {
        /* Prose-only patches: no sadr/ajuz, so the verse text is left exactly as
           stored and the word-cell rules never come into it. */
        let out;
        try { out = await saveBayts(PW, POEM, DOC_VERSION, bayts); }
        catch (e) { throw saveError(e, 'Text', { what: nameOf(POEM), is: 'it is' }); }
        DOC_VERSION = out.version;
        // fold what was sent into the loaded copy rather than re-reading it
        for (const b of bayts) {
          const v = BYNUM.get(b.n);
          if (!v) continue;
          const rec = v as unknown as Loose;
          for (const f of PROSE_FIELDS) {
            if (!(f in b)) continue;
            const val = b[f];
            const empty = val === '' || (f === 'exp' && !Object.keys(val ?? {}).length);
            if (empty) delete rec[f]; else rec[f] = val;
          }
        }
        EDITS.clear();
        done.push(`${(out.applied || []).length} bayt(s) written — now v${out.version}`);
      }

      if (CARD_EDITS.size) {
        const cards: Record<string, unknown[] | null> = {};
        for (const [n, list] of CARD_EDITS) cards[n] = list;
        let out;
        try { out = await saveQiraat(PW, POEM, QX_VERSION, cards); }
        catch (e) { throw saveError(e, 'Cards', { what: 'the qirāʾāt cards', is: 'they are' }); }
        QX_VERSION = out.version;
        QX ??= { version: out.version, examples: {} };
        QX.version = out.version;
        for (const [n, list] of CARD_EDITS) {
          if (list && list.length) QX.examples[n] = list; else delete QX.examples[n];
        }
        CARD_EDITS.clear();
        const changed = (out.applied || []).length + (out.removed || []).length;
        done.push(`${changed} bayt(s) of cards — now v${out.version}`);
      }

      showMsg('ok', 'Saved. ' + done.join(' · ') + '. Changes are live for readers.');
    } catch (e) {
      showMsg('err', (e instanceof Error && e.message) || 'Save failed — try again.');
    }
    refresh();
  }

  // deep link: ?poem=
  {
    const p = new URLSearchParams(location.search).get('poem');
    if (isPoemId(p)) POEM = p;
    $$('.pill.poem').forEach((b) => b.classList.toggle('active', b.dataset.poem === POEM));
  }
}
