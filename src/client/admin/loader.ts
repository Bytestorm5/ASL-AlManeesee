/* The Bulk Loader (/admin/loader) — puts a matn's explanations, word meanings,
   or translations & sharḥ into its stored document, from a JSON file the
   admin chooses (or pastes). docs/data-formats.md describes the three formats.

   One page for what the Mutūn site did with three, each wired to one matn's
   bundled data script:
     · explanations-loader.html — explanations loaded per bayt, then shown to
       readers per bayt with the explanation switch (two separate steps);
     · word-meanings-loader.html — word-by-word glosses, cells cut out of the
       stored hemistich so the Arabic is never retyped;
     · urdu-loader.html — English translation, Urdu translation and sharḥ.
   Every rule those pages kept is kept here, and lives in src/shared/bulk.ts so
   the terminal version (scripts/load.ts) applies exactly the same ones: the
   Arabic is never retyped, word counts must add up, unchanged bayts are not
   sent, prose goes as prose-only patches on the version the page loaded, and
   a long list goes up in ordered batches. */
import { ApiError, getPoemDoc, getSwitches, saveBayts, saveSwitches } from '../api.ts';
import { forgetPassword, signIn, storedPassword } from './auth.ts';
import { ALL_POEMS, explanationBayts, getPoem } from '../../poems/index.ts';
import type { PoemConfig, PoemDoc } from '../../poems/types.ts';
import { checkProseMarkup, stripTags } from '../../shared/poem-data.ts';
import {
  BATCH, BULK_KINDS, BatchFailure, buildWords, describeBayts, detectKind, expLoadable, explanationPatch,
  explanationState, expOf, indexDoc, isBulkKind, isFlagged, parseExplanations, parseTranslations, parseWords,
  proseText, readJsonText, saveInBatches, sortedBayts, storedIsPlaceholder, translationPatch, translationState,
  withSwitches, wordsPatch, wordsState,
  type BuiltWords, type BulkKind, type ExplanationEntry, type ExplanationState, type Parsed, type StoredVerse,
  type TranslationEntry, type TranslationPatch, type TranslationState, type WordsEntry, type WordsPatch,
  type WordsState,
} from '../../shared/bulk.ts';

const $ = <T extends HTMLElement = HTMLElement>(s: string): T => document.querySelector(s) as T;
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const LANG_NAME: Record<string, string> = { en: 'English', ur: 'Urdu', ar: 'Arabic' };

let PW = '';
let POEM: PoemConfig = ALL_POEMS[0]!;
let KIND: BulkKind = 'explanations';

/* the chosen file, and what it says read as the chosen kind */
let file: { name: string; json: unknown } | null = null;
let exps: Parsed<ExplanationEntry> | null = null;
let words: Parsed<WordsEntry> | null = null;
let trs: Parsed<TranslationEntry> | null = null;

/* the stored state */
let doc: PoemDoc | null = null;
let stored = new Map<number, StoredVerse>();
let enabled: Record<string, boolean> = {};
/* Sending `enabled` replaces the whole map, so a map that could not be read
   must never be sent back — it would switch every other bayt off. */
let switchesOk = false;
let expSet = new Set<number>();
let loadToken = 0;

/* ── messages ─────────────────────────────────────────────────────────── */

function say(t: string, kind: 'ok' | 'warn' | 'err' = 'ok', list?: string[]): void {
  const m = $('#msg');
  m.className = 'msg ' + kind;
  m.textContent = t;
  if (list?.length) {
    const ul = document.createElement('ul');
    for (const item of list) { const li = document.createElement('li'); li.textContent = item; ul.appendChild(li); }
    m.appendChild(ul);
  }
}
function quiet(): void { const m = $('#msg'); m.className = 'msg'; m.textContent = ''; }
function log(t: string): void {
  const l = $('#log');
  l.classList.add('on');
  const d = document.createElement('div');
  d.textContent = t;
  l.appendChild(d);
  l.scrollTop = l.scrollHeight;
}
function notice(t: string | null): void {
  const el = $('#notice');
  el.classList.toggle('hidden', !t);
  el.textContent = t ?? '';
}
function empty(t: string | null): void {
  const el = $('#empty');
  el.classList.toggle('hidden', !t);
  el.textContent = t ?? '';
}

function button(label: string, fn: () => void, cls?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'act' + (cls ? ' ' + cls : '');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', fn);
  return b;
}
function chip(cls: string, label: string, title?: string): HTMLSpanElement {
  const c = document.createElement('span');
  c.className = 'chip ' + cls;
  c.textContent = label;
  if (title) c.title = title;
  return c;
}
function cell(cls: string, text = ''): HTMLTableCellElement {
  const td = document.createElement('td');
  if (cls) td.className = cls;
  td.textContent = text;
  return td;
}
function why(td: HTMLElement, reason: string, detail?: string): void {
  const s = document.createElement('span');
  s.className = 'why';
  s.textContent = reason;
  td.appendChild(s);
  if (detail) {
    const d = document.createElement('span');
    d.className = 'why-words';
    d.dir = 'rtl';
    d.textContent = detail;
    td.appendChild(d);
  }
}
function head(cols: [string, boolean?][]): void {
  const tr = document.createElement('tr');
  for (const [label, opt] of cols) {
    const th = document.createElement('th');
    th.textContent = label;
    if (opt) th.className = 'opt';
    tr.appendChild(th);
  }
  $('#head').replaceChildren(tr);
}
function chapterRow(st: StoredVerse, span: number): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'chap';
  const td = cell('', (st.ch.en || st.ch.tr || '') + (st.ch.ar ? '  ·  ' + stripTags(st.ch.ar) : ''));
  td.colSpan = span;
  tr.appendChild(td);
  return tr;
}
/** Toggle a preview row under `tr`, built by `fill` when it opens. */
function togglePreview(tr: HTMLTableRowElement, btn: HTMLButtonElement, span: number, fill: (td: HTMLTableCellElement) => void): void {
  const next = tr.nextElementSibling;
  if (next && next.classList.contains('prev')) { next.remove(); btn.textContent = 'Preview'; return; }
  const row = document.createElement('tr');
  row.className = 'prev';
  const td = document.createElement('td');
  td.colSpan = span;
  fill(td);
  row.appendChild(td);
  tr.after(row);
  btn.textContent = 'Close';
}
/** Prose HTML for a preview — injected only when it passes the same markup
    check the API applies, so a file can never put script on this page. */
function proseInto(el: HTMLElement, html: string): void {
  const problems: string[] = [];
  checkProseMarkup(html, 'preview', problems);
  if (problems.length) {
    const pre = document.createElement('pre');
    pre.textContent = html;
    el.replaceChildren(pre);
  } else el.innerHTML = html;
}

/* ── the kinds ────────────────────────────────────────────────────────── */

const HINT: Record<BulkKind, [string, string]> = {
  explanations: ['{"12": "<p>…</p>"}',
    ' — each bayt’s English explanation, in the HTML the Content Editor stores; or {"12": {"en": "…", "ur": "…", "ar": "…"}} for other languages.'],
  words: ['{"7": {"s": [[1, "The first is"], [2, "before the letters"]], "a": [[1, "of the throat", "حلق کے"], …]}}',
    ' — for each hemistich, how many of its words each cell takes and what it means: English, then (optionally) Urdu.'],
  translations: ['{"1": {"tr": "English translation", "ur": "اردو ترجمہ", "sharh": "<p>…</p>"}}',
    ' — any of the three may be left out, and what is left out is not touched.'],
};
const NOTE: Record<BulkKind, string> = {
  explanations: 'Loading the text and showing it are separate steps on purpose: nothing loaded here reaches a reader '
    + 'until you press Show for that bayt — unless that bayt is already shown, in which case its text changes straight '
    + 'away. The verse itself is never touched, only its explanation, and a language already stored beside the one '
    + 'you load is kept.',
  words: 'Unlike an explanation there is no second switch: a bayt loaded here is live for readers at once, so read it '
    + 'in Preview first. The Arabic itself is never retyped — each cell is cut out of the stored hemistich, so the '
    + 'verse on the page cannot change, and a bayt whose counts no longer add up to its words is left alone.',
  translations: 'Each translation shows beside the Arabic once the reader picks that language; the sharḥ is the '
    + 'bayt’s Urdu explanation, behind its explanation button, and saving it switches that button on. All three go '
    + 'live as soon as they are saved, so read them in Preview first. The Arabic is never touched — only these '
    + 'three fields are written, and an explanation already stored in another language is kept.',
};

function renderStatic(): void {
  const [code, rest] = HINT[KIND];
  const c = document.createElement('code');
  c.textContent = code;
  $('#hint').replaceChildren('Format: ', c, rest, ' Keys that are not bayt numbers (a "_" note) are skipped. '
    + 'The formats are described in full in docs/data-formats.md.');
  $('#kindNote').textContent = NOTE[KIND];
  const label = BULK_KINDS.find((k) => k.id === KIND)!.label.toLowerCase();
  $<HTMLTextAreaElement>('#paste').placeholder = `Paste a JSON file of ${label} here`;
}

function reparse(): void {
  exps = words = trs = null;
  if (!file) return;
  const max = POEM.verses;
  const p = KIND === 'explanations' ? (exps = parseExplanations(file.json, max))
    : KIND === 'words' ? (words = parseWords(file.json, max))
    : (trs = parseTranslations(file.json, max));
  const seems = detectKind(file.json);
  const label = (k: BulkKind) => BULK_KINDS.find((x) => x.id === k)!.label.toLowerCase();
  const hint = seems && seems !== KIND ? ` This looks like a file of ${label(seems)} — choose that above.` : '';
  if (p.problems.length) say(`${file.name} cannot be read as ${label(KIND)}.${hint}`, 'err', p.problems);
  else if (!p.entries.size && hint) say(`Nothing in ${file.name} can be loaded as ${label(KIND)}.${hint}`, 'warn');

  const name = $('#fileName');
  const b = document.createElement('b');
  b.textContent = file.name;
  const bits = [plural(p.entries.size + p.invalid.size, 'bayt', 'abyāt')];
  if (p.invalid.size) bits.push(`${p.invalid.size} need${p.invalid.size === 1 ? 's' : ''} a look`);
  if (p.ignored.length) bits.push(`${plural(p.ignored.length, 'note')} skipped`);
  name.replaceChildren(b, ' · ' + bits.join(' · '));
}

function setFile(name: string, text: string): void {
  quiet();
  const r = readJsonText(text);
  if ('error' in r) {
    file = null;
    reparse();
    say(`${name}: ${r.error}`, 'err');
    const b = document.createElement('b');
    b.textContent = name;
    $('#fileName').replaceChildren(b, ' — not loaded');
  } else {
    file = { name, json: r.json };
    reparse();
  }
  $('#clearFile').classList.toggle('hidden', !file);
  render();
}

/* ── unlock ───────────────────────────────────────────────────────────── */

async function unlock(): Promise<void> {
  const input = $<HTMLInputElement>('#pw');
  const v = input.value.trim();
  if (!v) return;
  const btn = $<HTMLButtonElement>('#unlock');
  btn.disabled = true;
  $('#gateMsg').textContent = '';
  try {
    if (!(await signIn(v))) { $('#gateMsg').textContent = 'Wrong password.'; return; }
    PW = v;
    $('#gate').classList.add('hidden');
    $('#main').classList.remove('hidden');
    void load();
  } catch {
    $('#gateMsg').textContent = 'Could not reach the server — check your connection.';
  } finally {
    btn.disabled = false;
  }
}

function signedOut(): void {
  forgetPassword();
  PW = '';
  $('#main').classList.add('hidden');
  $('#gate').classList.remove('hidden');
  $('#gateMsg').textContent = 'The password was not accepted — sign in again.';
}

/* ── read state ───────────────────────────────────────────────────────── */

/* Deliberately does not clear the message: it runs straight after every save,
   and clearing here would wipe the confirmation before anyone could read it.
   Callers that want a clean slate call quiet() themselves. */
async function load(): Promise<void> {
  const token = ++loadToken;
  const p = POEM;
  const [d, s] = await Promise.allSettled([getPoemDoc(p.id), getSwitches(p.id)]);
  if (token !== loadToken) return;            // the matn changed while this was in flight
  expSet = new Set(explanationBayts(p));
  if (d.status === 'fulfilled') {
    doc = d.value;
    stored = indexDoc(doc);
  } else {
    doc = null;
    stored = new Map();
    const e = d.reason;
    say(e instanceof ApiError && e.status === 404
      ? `${p.titleEn} is not stored yet — import its text first, at /admin/import.`
      : e instanceof ApiError ? `Could not read the stored matn: ${e.message}.` : 'Could not read the stored matn.', 'err');
  }
  switchesOk = s.status === 'fulfilled';
  enabled = s.status === 'fulfilled' ? { ...s.value.enabled } : {};
  render();
}

/* ── render ───────────────────────────────────────────────────────────── */

function render(): void {
  $('#rows').textContent = '';
  notice(null);
  empty(null);
  const all = $<HTMLButtonElement>('#loadAll');
  if (!doc) {
    $('#head').textContent = '';
    $('#count').textContent = '';
    all.disabled = true;
    empty('Nothing to show until this matn’s text is stored.');
    return;
  }
  if (KIND === 'explanations') renderExplanations();
  else if (KIND === 'words') renderWords();
  else renderTranslations();
  if (!switchesOk && KIND !== 'words') {
    notice('The explanation switches could not be read, so Show and Hide are off until Refresh reads them.');
  }
}

/* ── explanations ─────────────────────────────────────────────────────── */

const EXP_LABEL: Record<ExplanationState, string> = {
  placeholder: 'Placeholder', stale: 'Shown — old text', differs: 'Not loaded',
  loaded: 'Loaded, hidden', shown: 'Shown to readers', mismatch: 'Needs a look',
};

function expWhy(n: number): string | null {
  const bad = exps?.invalid.get(n);
  if (bad) return bad.join('; ');
  if (!exps?.entries.has(n)) return null;
  if (!stored.has(n)) return 'no such bayt in the stored matn';
  if (!expSet.has(n)) return `${POEM.shortEn} takes no explanation on this bayt (explanations.bayts in the registry)`;
  return null;
}
function expState(n: number): ExplanationState {
  if (expWhy(n)) return 'mismatch';
  return explanationState(stored.get(n)?.v, exps?.entries.get(n), enabled[n] === true);
}
/** Nothing at all stored for this bayt's explanation — not even a placeholder. */
const expEmpty = (n: number) => !Object.values(expOf(stored.get(n)?.v)).some((s) => s && s.trim());

/** Bayts in the file, plus every bayt with an explanation stored (a
    placeholder included) — so a stored one can be shown or hidden here
    without a file. A bayt with nothing stored and no entry is left out, even
    when its switch is on: a reader sees no card there, and on a matn whose
    explanations default to shown that would be every bayt. */
function expListed(): number[] {
  const extra = [...expSet].filter((n) => !expEmpty(n));
  return sortedBayts([...(exps?.entries.keys() ?? []), ...(exps?.invalid.keys() ?? []), ...extra]);
}
function expTodo(): number[] {
  return expListed().filter((n) => exps?.entries.has(n) && expLoadable(expState(n)));
}

function renderExplanations(): void {
  head([['Bayt'], ['State'], ['Opens'], ['']]);
  const body = $('#rows');
  const counts: Record<ExplanationState, number> = { placeholder: 0, stale: 0, differs: 0, loaded: 0, shown: 0, mismatch: 0 };
  let staleEmpty = 0, staleOld = 0, still = 0;
  const listed = expListed();
  for (const n of listed) {
    const st = expState(n);
    counts[st]++;
    /* with a file, "still to load" is what this file can load; without one,
       every bayt that holds no real text yet */
    if (expLoadable(st) && (!file || exps?.entries.has(n))) {
      still++;
      if (st === 'stale') { if (expEmpty(n)) staleEmpty++; else staleOld++; }
    }
    body.appendChild(expRow(n, st));
  }
  const todo = expTodo();
  $('#count').innerHTML = `<b>${counts.shown}</b> shown to readers · <b>${counts.loaded}</b> loaded but hidden · <b>`
    + `${still}</b> still to load`
    + (staleOld ? ` · <b style="color:#8a2a2a">${staleOld}</b> of those already visible with older text` : '')
    + (staleEmpty ? ` · <b style="color:#8a2a2a">${staleEmpty}</b> already switched on, so they show as soon as they load` : '');
  const all = $<HTMLButtonElement>('#loadAll');
  all.textContent = 'Load all text';
  all.disabled = !todo.length;
  if (counts.mismatch) {
    const bad = listed.filter((n) => expState(n) === 'mismatch');
    notice(`Bayt ${describeBayts(bad)} ${bad.length === 1 ? 'needs' : 'need'} a look — the reason is on the row. `
      + 'Those are left alone; the rest can still be loaded.');
  }
  if (!listed.length) {
    empty(file ? 'Nothing in this file can be loaded.'
      : `No explanation is stored or shown for ${POEM.titleEn} yet. Choose a JSON file of explanations to load some.`);
  }
}

function expRow(n: number, st: ExplanationState): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.id = 'r' + n;
  const want = exps?.entries.get(n);
  const v = stored.get(n)?.v;
  const on = enabled[n] === true;

  const tdChip = cell('st');
  /* "old text" would be untrue where nothing is stored yet: the switch is on,
     so the text shows the moment it is loaded */
  tdChip.appendChild(chip(st, st === 'stale' && expEmpty(n) ? 'On — not loaded' : EXP_LABEL[st]));
  const snip = cell('snip');
  const reason = expWhy(n);
  if (reason) why(snip, reason);
  else {
    const src = want ?? expOf(v);
    const html = src.en ?? src.ur ?? src.ar ?? '';
    const text = proseText(html);
    snip.textContent = text.slice(0, 76) + (text.length > 76 ? '…' : '');
    if (!src.en && text) snip.dir = 'rtl';
  }

  const acts = cell('act-cell');
  if (want || !storedIsPlaceholder(v)) {
    const b = button('Preview', () => togglePreview(tr, b, 4, (td) => expPreview(td, want ?? expOf(v))));
    acts.appendChild(b);
  }
  if (want && expLoadable(st)) acts.appendChild(button('Load', () => void loadExplanations([n]), 'go'));
  if (switchesOk && st === 'loaded') acts.appendChild(button('Show', () => void setShown(n, true), 'go'));
  if (switchesOk && on && (st === 'shown' || st === 'stale' || st === 'mismatch')) {
    acts.appendChild(button('Hide', () => void setShown(n, false)));
  }
  tr.append(cell('n', String(n)), tdChip, snip, acts);
  return tr;
}

function expPreview(td: HTMLTableCellElement, e: ExplanationEntry): void {
  const box = document.createElement('div');
  box.className = 'prevbox';
  const langs = (['en', 'ur', 'ar'] as const).filter((l) => e[l]);
  for (const l of langs) {
    if (langs.length > 1) {
      const lbl = document.createElement('div');
      lbl.className = 'plang';
      lbl.textContent = LANG_NAME[l]!;
      box.appendChild(lbl);
    }
    const body = document.createElement('div');
    if (l !== 'en') { body.dir = 'rtl'; body.lang = l; }
    proseInto(body, e[l]!);
    box.appendChild(body);
  }
  td.appendChild(box);
}

async function loadExplanations(ns: number[]): Promise<void> {
  quiet();
  const want = exps?.entries;
  const bayts: { n: number; exp: ExplanationEntry }[] = [];
  for (const n of ns) {
    const w = want?.get(n), v = stored.get(n)?.v;
    if (!w || !v || expWhy(n)) continue;
    const patch = explanationPatch(n, v, w);
    if (patch) bayts.push(patch);
  }
  if (!bayts.length) { say('Nothing to load — those are already current.', 'warn'); return; }
  const live = bayts.filter((b) => enabled[b.n] === true).map((b) => b.n);
  const from = doc!.version;
  busy(true);
  try {
    const r = await send(bayts, false);
    log(`[${POEM.id}] loaded bayt ${describeBayts(bayts.map((b) => b.n))} — version ${from} → ${r.version}`);
    say(`${plural(r.applied, 'explanation')} loaded. `
      + (live.length
        ? `Bayt ${describeBayts(live)} ${live.length === 1 ? 'was' : 'were'} already switched on for readers, so `
          + `${live.length === 1 ? 'its' : 'their'} text shows straight away; the rest stay hidden until you press Show.`
        : 'Nothing is shown to readers yet — press Show on a bayt once you have read it.'), 'ok');
    await load();
  } catch (e) {
    await failed(e, bayts, 'Load');
  } finally {
    busy(false);
  }
}

function confirmExplanations(): void {
  const todo = expTodo();
  if (!todo.length) return;
  const live = todo.filter((n) => expState(n) === 'stale');
  /* Most of these are hidden, so loading them changes nothing a reader sees.
     A bayt that is already shown is the exception, and saying "nothing
     becomes visible" without naming it would be untrue. */
  const note = live.length
    ? `\n\nBayt ${describeBayts(live)} ${live.length === 1 ? 'is' : 'are'} already switched on for readers, so `
      + `${live.length === 1 ? 'its' : 'their'} text shows straight away. The rest stay hidden until you press Show.`
    : '\n\nThis only puts the text in place. None of them becomes visible to readers until you press Show on that bayt.';
  if (!confirm(`Load the written explanation for ${plural(todo.length, 'bayt', 'abyāt')} of ${POEM.titleEn}?${note}`)) return;
  void loadExplanations(todo);
}

/* Sending `enabled` replaces the whole map — withSwitches sends it all back
   with the one bayt changed. */
async function setShown(n: number, on: boolean): Promise<void> {
  quiet();
  if (!switchesOk) return;
  if (on && storedIsPlaceholder(stored.get(n)?.v)) {
    say(`Bayt ${n} still holds the placeholder — load its text first.`, 'err');
    return;
  }
  busy(true);
  try {
    const r = await saveSwitches(PW, POEM.id, { enabled: withSwitches(enabled, [n], on) });
    log(`[${POEM.id}] ${on ? 'showing' : 'hiding'} bayt ${n} — ${r.on} now shown`);
    say(`Bayt ${n}${on ? ' is now shown to readers.' : ' is hidden again.'}`, 'ok');
    await load();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) signedOut();
    else say(e instanceof ApiError ? `Could not change the switch: ${e.message}` : 'Could not reach the server.', 'err');
  } finally {
    busy(false);
  }
}

/* ── word meanings ────────────────────────────────────────────────────── */

const WORDS_LABEL: Record<WordsState, string> = { none: 'not loaded', loaded: 'live', differs: 'changed', mismatch: 'needs a look' };
interface WordsInfo { st: WordsState; b?: BuiltWords; why?: string; detail?: string }

function wordsInfo(n: number): WordsInfo {
  const bad = words?.invalid.get(n);
  if (bad) return { st: 'mismatch', why: bad.join('; ') };
  const e = stored.get(n), w = words?.entries.get(n);
  if (!e || !w) return { st: 'mismatch', why: 'no such bayt in the stored matn' };
  const b = buildWords(e.v, w);
  if ('error' in b) return { st: 'mismatch', why: b.error, detail: b.detail };
  return { st: wordsState(e.v, b), b };
}
const wordsPending = (info: Map<number, WordsInfo>) =>
  [...info].filter(([, i]) => i.st === 'none' || i.st === 'differs').map(([n]) => n);

function renderWords(): void {
  head([['Bayt'], ['Verse'], ['Cells', true], ['State'], ['']]);
  const all = $<HTMLButtonElement>('#loadAll');
  if (!words) {
    $('#count').textContent = `version ${doc!.version}`;
    all.textContent = 'Load all';
    all.disabled = true;
    empty(`Choose a JSON file of word meanings for ${POEM.titleEn} — each bayt in it is listed here with what loading it would change.`);
    return;
  }
  const body = $('#rows');
  const nums = sortedBayts([...words.entries.keys(), ...words.invalid.keys()]);
  const info = new Map(nums.map((n) => [n, wordsInfo(n)] as const));
  let live = 0, cells = 0, lastCh: unknown = null;
  const bad: number[] = [];

  for (const n of nums) {
    const i = info.get(n)!, e = stored.get(n);
    if (i.st === 'loaded') live++;
    if (i.st === 'mismatch') bad.push(n);
    if (i.b) cells += i.b.sadrW.length + i.b.ajuzW.length;
    if (e && e.ch !== lastCh) { lastCh = e.ch; body.appendChild(chapterRow(e, 5)); }

    const tr = document.createElement('tr');
    const verse = cell('ar', e ? stripTags(e.v.sadr) + '  ◆  ' + stripTags(e.v.ajuz) : '');
    if (i.why) why(verse, i.why, i.detail);
    const tdChip = cell('st');
    tdChip.appendChild(chip(i.st, WORDS_LABEL[i.st], i.why));
    const acts = cell('act-cell');
    if (i.b) {
      const built = i.b;
      const b = button('Preview', () => togglePreview(tr, b, 5, (td) => wordsPreview(td, built)));
      acts.appendChild(b);
    }
    if (i.st === 'none' || i.st === 'differs') acts.appendChild(button('Load', () => void loadWords([n], false), 'go'));
    tr.append(cell('n', String(n)), verse, cell('cells opt', i.b ? String(i.b.sadrW.length + i.b.ajuzW.length) : '—'), tdChip, acts);
    body.appendChild(tr);
  }

  const todo = wordsPending(info);
  $('#count').innerHTML = `<b>${live}</b> of ${nums.length} abyāt live · ${cells} cells · version ${doc!.version}`;
  all.disabled = !todo.length;
  all.textContent = todo.length ? `Load ${plural(todo.length, 'bayt')}` : 'All loaded';
  if (bad.length) {
    notice(`Bayt ${describeBayts(bad)} ${bad.length === 1 ? 'does' : 'do'} not match ${bad.length === 1 ? 'its' : 'their'} `
      + 'written meanings — the reason is on the row (often the verse has been edited since). Those are left alone; '
      + 'the rest can still be loaded.');
  }
  if (!nums.length) empty('Nothing in this file can be loaded.');
}

function wordsPreview(td: HTMLTableCellElement, b: BuiltWords): void {
  const box = document.createElement('div');
  box.className = 'pairs';
  for (const [list, second] of [[b.sadrW, false], [b.ajuzW, true]] as const) {
    for (const c of list) {
      const d = document.createElement('div');
      if (second) d.className = 'half';
      const w = document.createElement('span'); w.className = 'w'; w.textContent = stripTags(c.w);
      const g = document.createElement('span'); g.className = 'g'; g.textContent = c.g || '';
      d.append(w, g);
      if (c.gu) { const gu = document.createElement('span'); gu.className = 'gu'; gu.textContent = c.gu; d.appendChild(gu); }
      if (c.fn) { const fn = document.createElement('span'); fn.className = 'fn'; fn.textContent = 'Footnote kept: ' + c.fn; d.appendChild(fn); }
      box.appendChild(d);
    }
  }
  td.appendChild(box);
}

async function loadWords(ns: number[], ask: boolean): Promise<void> {
  const bayts: WordsPatch[] = [];
  for (const n of ns) {
    const i = wordsInfo(n), v = stored.get(n)?.v;
    if (v && i.b && (i.st === 'none' || i.st === 'differs')) bayts.push(wordsPatch(n, v, i.b));
  }
  if (!bayts.length) return;
  if (ask && !confirm(`Load the word meanings for ${plural(bayts.length, 'bayt')} of ${POEM.titleEn}?\n\n`
    + 'They go live for readers straight away.')) return;
  quiet();
  busy(true);
  try {
    const r = await send(bayts, true);
    await load();
    /* after a Load all, say which of the file's abyāt it could not take */
    const left = ask
      ? sortedBayts([...(words?.entries.keys() ?? []), ...(words?.invalid.keys() ?? [])]).filter((n) => wordsInfo(n).st === 'mismatch')
      : [];
    say(`${plural(r.applied, 'bayt')} loaded. Tapping a word on the reading page now gives its meaning — `
      + 'an installed app picks it up after it is fully closed and reopened.'
      + (left.length ? ` Bayt ${describeBayts(left)} was left out: it needs a look (see its row).` : ''),
      left.length ? 'warn' : 'ok');
  } catch (e) {
    await failed(e, bayts, 'Load');
  } finally {
    busy(false);
  }
}

/* ── translations & sharḥ ─────────────────────────────────────────────── */

const TR_LABEL: Record<TranslationState, string> = { loaded: 'in place', differs: 'would change', none: 'not loaded', mismatch: 'needs a look' };
interface TrInfo { st: TranslationState; why?: string; patch?: TranslationPatch | null; sharhOff?: boolean }

function trInfo(n: number): TrInfo {
  const bad = trs?.invalid.get(n);
  if (bad) return { st: 'mismatch', why: bad.join('; ') };
  const v = stored.get(n)?.v, w = trs?.entries.get(n);
  if (!v || !w) return { st: 'mismatch', why: 'no such bayt in the stored matn' };
  if (w.sharh && !expSet.has(n)) {
    return { st: 'mismatch', why: `${POEM.shortEn} takes no explanation on this bayt — leave its sharḥ out (explanations.bayts in the registry)` };
  }
  const st = translationState(v, w);
  /* the sharḥ is in place but its explanation button is switched off */
  const sharhOff = switchesOk && !!w.sharh && (expOf(v).ur || '') === w.sharh && enabled[n] !== true;
  return { st, patch: translationPatch(n, v, w), sharhOff };
}

const clip = (s: string | undefined) => { const t = s || ''; return t.length > 44 ? t.slice(0, 44) + '…' : t; };

function renderTranslations(): void {
  head([['Bayt'], ['Verse'], ['English', true], ['Urdu', true], ['State'], ['']]);
  const all = $<HTMLButtonElement>('#loadAll');
  if (!trs) {
    $('#count').textContent = `version ${doc!.version}`;
    all.textContent = 'Save all';
    all.disabled = true;
    empty(`Choose a JSON file of translations for ${POEM.titleEn} — each bayt in it is listed here with what saving it would change.`);
    return;
  }
  const body = $('#rows');
  const inFile = new Set([...trs.entries.keys(), ...trs.invalid.keys()]);
  let have = 0, pending = 0, lastCh: unknown = null;
  const bad: number[] = [];
  /* in the stored order, under their chapter headings; a bayt the file names
     that the matn does not have comes last */
  const order = [...stored.keys()].filter((n) => inFile.has(n));
  const strays = sortedBayts([...inFile].filter((n) => !stored.has(n)));
  for (const n of [...order, ...strays]) {
    const i = trInfo(n), e = stored.get(n), w = trs.entries.get(n);
    if (w) have++;
    if (i.patch) pending++;
    if (i.st === 'mismatch') bad.push(n);
    if (e && e.ch !== lastCh) { lastCh = e.ch; body.appendChild(chapterRow(e, 6)); }

    const tr = document.createElement('tr');
    const verse = cell('ar', e ? stripTags(e.v.sadr) : '');
    if (i.why) why(verse, i.why);
    const tdChip = cell('st');
    tdChip.appendChild(chip(i.st, TR_LABEL[i.st], i.why));
    if (w && isFlagged(w)) tdChip.appendChild(chip('flag', '⟨?⟩', 'Marked ⟨?⟩ for review in the file'));
    if (i.sharhOff) tdChip.appendChild(chip('off', 'sharḥ hidden', 'The sharḥ is stored, but its explanation button is switched off'));
    const acts = cell('act-cell');
    if (w && e) {
      const entry = w, sv = e;
      const b = button('Preview', () => togglePreview(tr, b, 6, (td) => trPreview(td, sv, entry)));
      acts.appendChild(b);
    }
    if (i.patch) acts.appendChild(button('Save', () => void saveTranslations([n], false), 'go'));
    if (i.sharhOff) acts.appendChild(button('Show', () => void setShown(n, true), 'go'));
    tr.append(cell('n', String(n)), verse, cell('en opt', clip(w?.tr)), cell('ur opt', clip(w?.ur)), tdChip, acts);
    body.appendChild(tr);
  }

  $('#count').innerHTML = `<b>${have}</b> of ${stored.size} abyāt written · ${pending} to save · `
    + `${Math.max(0, stored.size - order.length)} still to write · version ${doc!.version}`;
  all.disabled = !pending;
  all.textContent = pending ? `Save ${plural(pending, 'bayt')}` : 'Nothing to save';
  if (bad.length) {
    notice(`Bayt ${describeBayts(bad)} ${bad.length === 1 ? 'needs' : 'need'} a look — the reason is on the row. `
      + 'Those are left alone; the rest can still be saved.');
  }
  if (!inFile.size) empty('Nothing in this file can be loaded.');
}

function trPreview(td: HTMLTableCellElement, e: StoredVerse, w: TranslationEntry): void {
  const v = e.v;
  const box = document.createElement('div');
  box.className = 'panel';
  const part = (label: string, cls: string, fill: (el: HTMLElement) => void, extra = '') => {
    const d = document.createElement('div');
    if (extra) d.className = extra;
    const l = document.createElement('div'); l.className = 'lbl'; l.textContent = label;
    const b = document.createElement('div'); b.className = cls;
    fill(b);
    d.append(l, b);
    box.appendChild(d);
    return d;
  };
  part('Bayt', 'ar', (el) => { el.textContent = stripTags(v.sadr) + '  ✽  ' + stripTags(v.ajuz); });
  if (w.tr != null) part('English translation', 'en', (el) => { el.textContent = w.tr!; });
  if (w.ur != null) part('Urdu translation', 'ur', (el) => { el.textContent = w.ur!; });
  if (w.sharh != null) part('Sharḥ', 'sharh', (el) => proseInto(el, w.sharh!));
  const was = v.tr || v.ur || expOf(v).ur;
  if (was) {
    const d = part('Already stored', 'en', (el) => { el.textContent = v.tr || ''; }, 'was');
    const ur = document.createElement('div');
    ur.className = 'ur';
    ur.textContent = v.ur || (v.tr ? '' : '(only a sharḥ)');
    d.appendChild(ur);
  }
  td.appendChild(box);
}

/* The sharḥ sits behind the bayt's explanation button, which stays hidden
   until the bayt is switched on. Saving the text alone would leave the note
   written but unreachable, so the switch is set in the same pass — read,
   merged and sent whole (withSwitches), so no other bayt is switched off. */
async function showThem(ns: number[]): Promise<number> {
  const add = ns.filter((n) => enabled[n] !== true);
  if (!add.length) return 0;
  if (!switchesOk) { log('  the text saved, but the explanation switches could not be read, so none was switched on'); return -1; }
  try {
    await saveSwitches(PW, POEM.id, { enabled: withSwitches(enabled, add, true) });
    log(`  switched ${plural(add.length, 'bayt')} on, so the explanation button shows`);
    return add.length;
  } catch (e) {
    log(`  the text saved, but the explanation switch failed (${e instanceof ApiError ? e.message : 'unreachable'})`);
    return -1;
  }
}

async function saveTranslations(ns: number[], ask: boolean): Promise<void> {
  const bayts = ns.map((n) => trInfo(n).patch).filter((p): p is TranslationPatch => !!p);
  if (!bayts.length) return;
  const sharh = bayts.filter((b) => b.exp).map((b) => b.n);
  if (ask) {
    const fields = [
      bayts.some((b) => b.tr != null) && 'the English translation',
      bayts.some((b) => b.ur != null) && 'the Urdu translation',
      sharh.length && 'the sharḥ',
    ].filter((x): x is string => !!x);
    const list = fields.length > 1 ? fields.slice(0, -1).join(', ') + ' and ' + fields[fields.length - 1] : fields[0]!;
    if (!confirm(`Save the text for ${plural(bayts.length, 'bayt')} of ${POEM.titleEn}?\n\n`
      + `${list[0]!.toUpperCase() + list.slice(1)} ${fields.length > 1 ? 'are all' : 'is'} written`
      + (sharh.length ? ', and each bayt with a sharḥ is switched on so its explanation button appears' : '')
      + '. It goes live for readers straight away. The Arabic is not touched, and an explanation already '
      + 'stored in another language is kept.')) return;
  }
  quiet();
  busy(true);
  try {
    const r = await send(bayts, true);
    const sw = await showThem(sharh);
    await load();
    say(`${plural(r.applied, 'bayt')} saved — now version ${r.version}.`
      + (sw > 0 ? ` ${sw} switched on, so the explanation button shows the sharḥ.` : '')
      + (sw === -1 ? ' The text saved but the explanation switch did not — press Show on those bayts.' : '')
      + ' The reading page shows it at once; an installed app after it is fully closed and reopened.',
    sw === -1 ? 'warn' : 'ok');
  } catch (e) {
    await failed(e, bayts, 'Save');
  } finally {
    busy(false);
  }
}

/* ── sending ──────────────────────────────────────────────────────────── */

function send<T extends { n: number }>(bayts: T[], chatty: boolean) {
  return saveInBatches(bayts, BATCH[KIND], doc!.version,
    (version, chunk) => saveBayts(PW, POEM.id, version, chunk),
    chatty ? (chunk, version) => log(`[${POEM.id}] sending bayt ${chunk[0]!.n}`
      + `${chunk.length > 1 ? '–' + chunk[chunk.length - 1]!.n : ''} on version ${version}…`) : undefined,
    chatty ? (_chunk, before, a) => log(`  version ${before} → ${a.version} · ${a.applied.length} applied`) : undefined);
}

/** What a failed save says: 409 refreshes and asks again, 422 lists the
    problems, anything else says how far it got. */
async function failed(e: unknown, bayts: { n: number }[], again: string): Promise<void> {
  const f = e instanceof BatchFailure ? e : null;
  const err = f ? f.error : e;
  const at = f?.chunk[0] ?? bayts[0]?.n;
  const first = at === bayts[0]?.n;
  const before = f && !first
    ? ` The ${plural(f.applied, 'bayt')} before it ${f.applied === 1 ? 'was' : 'were'} stored; press ${again} again to finish.`
    : '';
  if (err instanceof ApiError) {
    if (err.status === 401) { signedOut(); return; }
    if (err.status === 409) {
      await load();
      say(`Someone else saved while this was running, so ${first ? 'nothing' : `bayt ${at} onwards`} was`
        + `${first ? '' : ' not'} written. The list has been refreshed — press ${again} again to finish.`, 'warn');
      return;
    }
    if (err.status === 422) {
      say(`Save refused at bayt ${at}: ${err.message}.${before}`, 'err', err.problems.slice(0, 12));
      for (const p of err.problems.slice(0, 40)) log('  ' + p);
      return;
    }
    say(`Save failed at bayt ${at} (${err.status}). ${err.message}.${before}`, 'err');
    log(`  ${err.status} ${JSON.stringify(err.body ?? {}).slice(0, 400)}`);
    return;
  }
  say('Could not reach the server — anything already confirmed above was written.', 'err');
}

function busy(b: boolean): void {
  document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    '#main button, #main input, #main select, #main textarea',
  ).forEach((x) => { x.disabled = b; });
  if (!b) render();
}

/* ── wiring ───────────────────────────────────────────────────────────── */

function remember(): void {
  const q = new URLSearchParams(location.search);
  q.set('poem', POEM.id);
  q.set('kind', KIND);
  history.replaceState(null, '', location.pathname + '?' + q.toString());
}

export function init(): void {
  if (!ALL_POEMS.length) return;            // the page shows its empty state instead

  const q = new URLSearchParams(location.search);
  POEM = getPoem(q.get('poem')) ?? ALL_POEMS[0]!;
  const k = q.get('kind');
  if (isBulkKind(k)) KIND = k;

  const sel = $<HTMLSelectElement>('#poem');
  sel.value = POEM.id;
  sel.addEventListener('change', () => {
    POEM = getPoem(sel.value) ?? POEM;
    quiet();
    doc = null;
    $('#rows').textContent = '';
    reparse();
    remember();
    void load();
  });

  document.querySelectorAll<HTMLInputElement>('input[name=kind]').forEach((r) => {
    r.checked = r.value === KIND;
    r.addEventListener('change', () => {
      if (!r.checked || !isBulkKind(r.value)) return;
      KIND = r.value;
      quiet();
      renderStatic();
      reparse();
      remember();
      render();
    });
  });

  const input = $<HTMLInputElement>('#file');
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    let text = '';
    try { text = await f.text(); } catch { say(`Could not read ${f.name}.`, 'err'); return; }
    input.value = '';                        // so the same file can be chosen again after an edit
    setFile(f.name, text);
  });
  $('#pasteBtn').addEventListener('click', () => {
    const box = $('#pasteBox');
    const open = box.classList.toggle('hidden') === false;
    $('#pasteBtn').setAttribute('aria-expanded', String(open));
    if (open) $<HTMLTextAreaElement>('#paste').focus();
  });
  $('#usePaste').addEventListener('click', () => setFile('Pasted JSON', $<HTMLTextAreaElement>('#paste').value));
  $('#clearFile').addEventListener('click', () => {
    file = null;
    reparse();
    quiet();
    $('#fileName').textContent = 'No file chosen';
    $('#clearFile').classList.add('hidden');
    render();
  });

  $('#refresh').addEventListener('click', () => void load());
  $('#loadAll').addEventListener('click', () => {
    if (KIND === 'explanations') confirmExplanations();
    else if (KIND === 'words') {
      const info = new Map([...(words?.entries.keys() ?? [])].map((n) => [n, wordsInfo(n)] as const));
      void loadWords(wordsPending(info), true);
    } else {
      void saveTranslations([...(trs?.entries.keys() ?? [])].sort((a, b) => a - b), true);
    }
  });

  renderStatic();
  $('#unlock').addEventListener('click', () => void unlock());
  $('#pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') void unlock(); });
  const saved = storedPassword();
  if (saved) { $<HTMLInputElement>('#pw').value = saved; void unlock(); }
}
