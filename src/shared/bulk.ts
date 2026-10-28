/* The Bulk Loader's rules, shared by the admin page (/admin/loader,
   src/client/admin/loader.ts) and its terminal twin (scripts/load.ts):

     · reading the three JSON formats an admin can load — explanations, word
       meanings, translations & sharḥ (docs/data-formats.md documents them);
     · cutting word cells out of the STORED hemistich, so the Arabic is never
       retyped;
     · comparing each bayt with the stored document, so only what would change
       is sent, and every patch other than word cells is prose-only;
     · sending a long list in ordered batches, each on the version the last
       one returned.

   Nothing here fetches or stores anything: the callers do, through their own
   transport, and hand the results in. It runs in the browser, in Node and in
   workerd (the unit tests), so it uses no DOM and no Node API. */

import { checkExp, checkProseMarkup, stripTags, validateBayt, versesOf } from './poem-data.ts';
import type { Chapter, ExpLang, PoemDoc, Verse, WordCell } from '../poems/types.ts';

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => !!v && typeof v === 'object' && !Array.isArray(v);

/* ── the three kinds ───────────────────────────────────────────────────── */

export type BulkKind = 'explanations' | 'words' | 'translations';

export const BULK_KINDS: readonly { id: BulkKind; label: string }[] = [
  { id: 'explanations', label: 'Explanations' },
  { id: 'words', label: 'Word meanings' },
  { id: 'translations', label: 'Translations & sharḥ' },
];
export function isBulkKind(k: unknown): k is BulkKind {
  return BULK_KINDS.some((x) => x.id === k);
}

/* A matn can be larger than one request should carry — a few hundred abyāt
   come to well over a thousand word cells — and a half-applied save is the
   one outcome worth ruling out, so the patches go up in ordered batches. */
export const BATCH: Record<BulkKind, number> = { words: 60, translations: 40, explanations: 40 };

/* ── reading a file ────────────────────────────────────────────────────── */

/** One cell of a word-meanings entry: how many of the hemistich's words it
    takes, and what it means in English and/or Urdu. */
export interface WordGroup { count: number; g?: string; gu?: string }
export interface WordsEntry {
  s: WordGroup[];
  a: WordGroup[];
  /** The hemistichs with colour-coding written in: markup only, the letters
      must be the stored ones. Both or neither. */
  sadr?: string;
  ajuz?: string;
}
/** An explanation in one or more languages (a bare string in the file is English). */
export type ExplanationEntry = Partial<Record<ExpLang, string>>;
export interface TranslationEntry { tr?: string; ur?: string; sharh?: string }

export interface EntryOf { words: WordsEntry; explanations: ExplanationEntry; translations: TranslationEntry }

export interface Parsed<T> {
  /** bayt → what the file says, for the entries that can be used. */
  entries: Map<number, T>;
  /** bayt → why its entry cannot be used. The rest of the file still can. */
  invalid: Map<number, string[]>;
  /** Why the file as a whole cannot be used (empty when it can). */
  problems: string[];
  /** Keys that are not bayt numbers — the "_" note at the top of a file. */
  ignored: string[];
}

const EXP_LANGS: readonly ExpLang[] = ['en', 'ur', 'ar'];
const SHAPE: Record<BulkKind, string> = {
  words: '{"1": {"s": [[1, "meaning"], …], "a": […]}, …}',
  explanations: '{"1": "<p>…</p>", …}',
  translations: '{"1": {"tr": "…", "ur": "…", "sharh": "<p>…</p>"}, …}',
};

/** JSON.parse with a message an admin can act on. A leading BOM is allowed. */
export function readJsonText(text: string): { json: unknown } | { error: string } {
  const t = String(text ?? '').replace(/^﻿/, '');
  if (!t.trim()) return { error: 'The file is empty.' };
  try { return { json: JSON.parse(t) }; }
  catch (e) { return { error: 'Not valid JSON: ' + (e instanceof Error ? e.message : String(e)) }; }
}

/** Walk a file's keys: bayt numbers are handed on, anything else is a note. */
function walk<T>(
  kind: BulkKind, json: unknown, maxBayt: number | undefined,
  one: (value: unknown, where: string, problems: string[]) => T | null,
): Parsed<T> {
  const out: Parsed<T> = { entries: new Map(), invalid: new Map(), problems: [], ignored: [] };
  if (!isObj(json)) {
    out.problems.push(`A file of ${BULK_KINDS.find((k) => k.id === kind)!.label.toLowerCase()} is a JSON object keyed by bayt number: ${SHAPE[kind]}`);
    return out;
  }
  for (const [key, value] of Object.entries(json)) {
    if (!/^\s*\d+\s*$/.test(key)) { out.ignored.push(key); continue; }
    const n = Number(key);
    const problems: string[] = [];
    if (n < 1 || (maxBayt && n > maxBayt)) problems.push(`bayt ${n}: out of range${maxBayt ? ` (1–${maxBayt})` : ''}`);
    if (out.entries.has(n) || out.invalid.has(n)) problems.push(`bayt ${n}: given twice`);
    const entry = problems.length ? null : one(value, `bayt ${n}`, problems);
    if (problems.length || entry == null) out.invalid.set(n, problems.length ? problems : [`bayt ${n}: nothing to load`]);
    else out.entries.set(n, entry);
  }
  if (!out.entries.size && !out.invalid.size) out.problems.push(`No bayt numbers in this file. Expected ${SHAPE[kind]}`);
  return out;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Word meanings: `{"7": {"s": [[1, "The first is"], [2, "before the letters"]],
 * "a": […]}}`. A group is [howManyWords, english] or [howManyWords, english,
 * urdu]; english may be "" (or null) when only the Urdu is written, but every
 * cell needs a meaning in one language or the other.
 */
export function parseWords(json: unknown, maxBayt?: number): Parsed<WordsEntry> {
  return walk('words', json, maxBayt, (value, where, problems) => {
    if (!isObj(value) || !Array.isArray(value.s) || !Array.isArray(value.a)) {
      problems.push(`${where}: needs an "s" list (sadr) and an "a" list (ʿajuz)`);
      return null;
    }
    const groups = (list: unknown[], half: string): WordGroup[] => list.map((c, i) => {
      const at = `${where} ${half} cell ${i + 1}`;
      if (!Array.isArray(c) || !Number.isInteger(c[0]) || (c[0] as number) < 1) {
        problems.push(`${at}: a cell must start with how many words it takes`);
        return { count: 0 };
      }
      if (c.length > 3) problems.push(`${at}: a cell is [howManyWords, english] or [howManyWords, english, urdu]`);
      for (const k of [1, 2]) {
        if (c[k] != null && typeof c[k] !== 'string') problems.push(`${at}: the meaning must be text`);
      }
      const g = text(c[1]), gu = text(c[2]);
      if (!g && !gu) problems.push(`${at}: has no meaning in either language`);
      const out: WordGroup = { count: c[0] as number };
      if (g) out.g = g;
      if (gu) out.gu = gu;
      return out;
    });
    const entry: WordsEntry = { s: groups(value.s, 'sadr'), a: groups(value.a, 'ʿajuz') };
    /* a matn may also ship the hemistich itself, when the words file carries
       colour-coding that has to go into the bayt text alongside the cells */
    const hasS = value.sadr != null, hasA = value.ajuz != null;
    if (hasS || hasA) {
      if (typeof value.sadr !== 'string' || typeof value.ajuz !== 'string') {
        problems.push(`${where}: give both "sadr" and "ajuz" as text, or neither`);
      } else {
        entry.sadr = value.sadr;
        entry.ajuz = value.ajuz;
      }
    }
    return entry;
  });
}

/**
 * Explanations: `{"2": "<p>…</p>"}` — English, in the HTML the Content Editor
 * stores — or `{"2": {"en": "…", "ur": "…", "ar": "…"}}` for any of the three
 * languages. Checked against the explanation markup the reading page accepts.
 */
export function parseExplanations(json: unknown, maxBayt?: number): Parsed<ExplanationEntry> {
  return walk('explanations', json, maxBayt, (value, where, problems) => {
    let entry: ExplanationEntry;
    if (typeof value === 'string') entry = { en: value.trim() };
    else if (isObj(value)) {
      const stray = Object.keys(value).filter((k) => !(EXP_LANGS as readonly string[]).includes(k));
      if (stray.length) problems.push(`${where}: unknown language(s) ${JSON.stringify(stray)} — use en, ur and ar`);
      entry = {};
      for (const l of EXP_LANGS) {
        if (value[l] == null) continue;
        if (typeof value[l] !== 'string') { problems.push(`${where}: ${l} must be text`); continue; }
        entry[l] = (value[l] as string).trim();
      }
    } else {
      problems.push(`${where}: an explanation is a string, or an {en, ur, ar} object`);
      return null;
    }
    for (const l of EXP_LANGS) if (entry[l] === '') delete entry[l];
    if (!Object.keys(entry).length) { problems.push(`${where}: the explanation is empty`); return null; }
    checkExp(entry, where, problems);
    return entry;
  });
}

/**
 * Translations & sharḥ: `{"1": {"tr": "…", "ur": "…", "sharh": "<p>…</p>"}}`.
 * `tr` is the English translation and `ur` the Urdu one, both plain text;
 * `sharh` is the Urdu explanation, in explanation markup. Any of the three may
 * be left out, and a blank one counts as left out — this never deletes.
 */
export function parseTranslations(json: unknown, maxBayt?: number): Parsed<TranslationEntry> {
  return walk('translations', json, maxBayt, (value, where, problems) => {
    if (!isObj(value)) { problems.push(`${where}: an entry is an object {tr, ur, sharh}`); return null; }
    const stray = Object.keys(value).filter((k) => !['tr', 'ur', 'sharh'].includes(k));
    if (stray.length) problems.push(`${where}: unknown field(s) ${JSON.stringify(stray)} — use tr, ur and sharh`);
    const entry: TranslationEntry = {};
    for (const f of ['tr', 'ur', 'sharh'] as const) {
      if (value[f] == null) continue;
      if (typeof value[f] !== 'string') { problems.push(`${where}: ${f} must be text`); continue; }
      const s = (value[f] as string).trim();
      if (s) entry[f] = s;
    }
    /* translations go into the page as text, so they must carry no markup */
    for (const f of ['tr', 'ur'] as const) {
      if (entry[f] && /[<>]/.test(entry[f]!)) problems.push(`${where}: ${f} contains "<" or ">" — translations must be plain text`);
    }
    if (entry.sharh) checkProseMarkup(entry.sharh, `${where}.sharh`, problems);
    if (!Object.keys(entry).length) { problems.push(`${where}: has no tr, ur or sharh`); return null; }
    return entry;
  });
}

export function parseBulk<K extends BulkKind>(kind: K, json: unknown, maxBayt?: number): Parsed<EntryOf[K]> {
  const parse = { words: parseWords, explanations: parseExplanations, translations: parseTranslations }[kind];
  return parse(json, maxBayt) as Parsed<EntryOf[K]>;
}

/** Which kind a file looks like, from its first bayt entry — so a file chosen
    under the wrong kind can say what it probably is. */
export function detectKind(json: unknown): BulkKind | null {
  if (!isObj(json)) return null;
  const first = Object.entries(json).find(([k]) => /^\s*\d+\s*$/.test(k))?.[1];
  if (typeof first === 'string') return 'explanations';
  if (!isObj(first)) return null;
  if (Array.isArray(first.s) || Array.isArray(first.a)) return 'words';
  if ('tr' in first || 'sharh' in first) return 'translations';
  if ('en' in first || 'ar' in first) return 'explanations';
  if ('ur' in first) return 'translations';
  return null;
}

/** "⟨?⟩" marks a passage the translator wants checked. */
export const isFlagged = (e: TranslationEntry): boolean => ((e.tr ?? '') + (e.ur ?? '') + (e.sharh ?? '')).includes('⟨?⟩');

/* ── the stored document ───────────────────────────────────────────────── */

export interface StoredVerse { v: Verse; ch: Chapter }

/** bayt → its verse and chapter, from a stored (unwelded) document. */
export function indexDoc(doc: Pick<PoemDoc, 'chapters'>): Map<number, StoredVerse> {
  const out = new Map<number, StoredVerse>();
  for (const ch of doc.chapters ?? []) {
    for (const v of versesOf(ch.verses)) out.set(Number(v.n), { v, ch });
  }
  return out;
}

/* ── word meanings ─────────────────────────────────────────────────────────
   The groups say how many of the hemistich's words each cell takes; the words
   themselves come from the stored verse. That is what makes this safe to run
   against a verse somebody has since re-vowelled: the API refuses any verse
   whose cells, joined by single spaces, do not come back to the hemistich
   exactly, and cutting rather than copying makes that true by construction —
   a hand-copied Arabic word with one diacritic adrift is impossible to spot by
   eye. A bayt whose counts no longer add up is reported, not guessed at. */

/**
 * A word is what a reader sees as a word, not what splitting on spaces gives.
 * A rubricated letter is written into the bayt as <span class="rmz4">حُ</span>زۡ,
 * and the space inside that tag is not a word break — splitting on it would
 * turn one word into two and throw every later count out, so a hemistich
 * would start failing here the moment somebody picked its rumūz out in red.
 * Spaces inside < … > are therefore kept, which also means a cell's text can
 * carry the markup through and still rejoin into the hemistich exactly.
 *
 * Only a plain space (U+0020) separates words, because a plain space is what
 * the API joins cells with. The Mutūn site split on any whitespace, which also
 * broke at the no-break spaces the Bayt Editor deliberately keeps — the seat
 * of a <span class="dot"> circle, the bearer of a small alif — so such a
 * hemistich miscounted, and its cells could never have rejoined to it. For
 * the same reason a space directly before a closing tag is the content of
 * that span, not a break.
 */
export function wordsOf(s: string): string[] {
  const str = String(s ?? '');
  const out: string[] = [];
  let cur = '', depth = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i]!;
    if (c === '<') depth++;
    else if (c === '>' && depth) depth--;
    if (!depth && c === ' ' && !str.startsWith('</', i + 1)) { if (cur) { out.push(cur); cur = ''; } continue; }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

export type CutResult = { cells: WordCell[] } | { error: string; words: string[] };

/** Cut one hemistich into cells by the counts. Refuses when the counts do not
    use up its words exactly — which is the whole point of counting rather
    than copying. */
export function cutCells(hemistich: string, groups: readonly WordGroup[]): CutResult {
  const words = wordsOf(hemistich);
  const want = groups.reduce((n, g) => n + g.count, 0);
  if (want !== words.length) {
    return {
      error: `covers ${want} word${want === 1 ? '' : 's'} but the verse now has ${words.length}`,
      words,
    };
  }
  const cells: WordCell[] = [];
  let at = 0;
  for (const g of groups) {
    const c: WordCell = { w: words.slice(at, at + g.count).join(' ') };
    if (g.g) c.g = g.g;
    if (g.gu) c.gu = g.gu;
    cells.push(c);
    at += g.count;
  }
  return { cells };
}

/** "1·word 2·word …" — what a miscount has to be checked against. */
export const numberedWords = (words: readonly string[]): string => words.map((w, i) => `${i + 1}·${w}`).join(' ');

/**
 * A stored cell may carry a footnote on a variant reading (`fn`), which no
 * words file holds. Rebuilding the cells would silently drop it, so it is
 * carried onto the new cell with exactly the same words — the same position
 * first — and a footnote with nowhere to go is an error, not a loss.
 */
function carryFootnotes(stored: WordCell[] | null | undefined, cells: WordCell[]): string | null {
  const used = new Set<number>();
  for (const [i, old] of (stored ?? []).entries()) {
    if (!old.fn) continue;
    const j = cells[i]?.w === old.w && !used.has(i) ? i : cells.findIndex((c, k) => c.w === old.w && !used.has(k));
    if (j < 0) return `the footnote on «${stripTags(old.w)}» has no cell with the same words — group it as before, or move the footnote in the Bayt Editor first`;
    used.add(j);
    cells[j] = { ...cells[j]!, fn: old.fn };
  }
  return null;
}

export interface BuiltWords {
  sadrW: WordCell[];
  ajuzW: WordCell[];
  /** Set when the file carried colour-coded hemistichs: they travel with the cells. */
  sadr?: string;
  ajuz?: string;
}
export type BuildResult = BuiltWords | { error: string; detail?: string };

/** The cells for one stored verse, or why they cannot be built. */
export function buildWords(v: Verse, e: WordsEntry): BuildResult {
  /* Normally the Arabic is cut out of the stored verse and cannot change.
     A words file that also carries the hemistich is saying the bayt text
     itself changes — colour-coding written into it — so the cells are cut out
     of THAT and sent with it. Markup only: a hemistich that is not the stored
     one once its tags are stripped is refused. */
  const retype = typeof e.sadr === 'string' && typeof e.ajuz === 'string';
  if (retype && (stripTags(e.sadr) !== stripTags(v.sadr) || stripTags(e.ajuz) !== stripTags(v.ajuz))) {
    return { error: 'the colour-coded text is not the stored bayt' };
  }
  const sadr = retype ? e.sadr! : v.sadr;
  const ajuz = retype ? e.ajuz! : v.ajuz;
  const s = cutCells(sadr, e.s);
  if ('error' in s) return { error: 'sadr ' + s.error, detail: numberedWords(s.words) };
  const a = cutCells(ajuz, e.a);
  if ('error' in a) return { error: 'ʿajuz ' + a.error, detail: numberedWords(a.words) };
  const lost = carryFootnotes(v.sadrW, s.cells) ?? carryFootnotes(v.ajuzW, a.cells);
  if (lost) return { error: lost };
  const built: BuiltWords = retype ? { sadr, ajuz, sadrW: s.cells, ajuzW: a.cells } : { sadrW: s.cells, ajuzW: a.cells };
  /* The same rules the API applies, so a bad colour-coded hemistich is a
     "needs a look" here rather than a refused save. */
  const problems = validateBayt(wordsPatch(Number(v.n), v, built));
  if (problems.length) return { error: problems.join('; ') };
  return built;
}

export function sameCells(a: readonly WordCell[] | null | undefined, b: readonly WordCell[] | null | undefined): boolean {
  const x = a ?? [], y = b ?? [];
  if (x.length !== y.length) return false;
  return x.every((c, i) => c.w === y[i]!.w && (c.g || '') === (y[i]!.g || '')
    && (c.gu || '') === (y[i]!.gu || '') && (c.fn || '') === (y[i]!.fn || ''));
}

/** none: no cells stored yet · loaded: these exact cells are live ·
    differs: other cells are live · mismatch: cannot be built. */
export type WordsState = 'none' | 'loaded' | 'differs' | 'mismatch';

export function wordsState(v: Verse | undefined, b: BuildResult | undefined): WordsState {
  if (!v || !b || 'error' in b) return 'mismatch';
  if (sameCells(v.sadrW, b.sadrW) && sameCells(v.ajuzW, b.ajuzW)) return 'loaded';
  if (v.sadrW?.length || v.ajuzW?.length) return 'differs';
  return 'none';
}

export interface WordsPatch { n: number; sadr: string; ajuz: string; sadrW: WordCell[]; ajuzW: WordCell[] }

/* The hemistichs go with the cells — the API rejects cells that arrive alone,
   and where the words file carried colour-coded text it is that text the
   cells were cut from, so the two have to travel together. */
export function wordsPatch(n: number, v: Verse, b: BuiltWords): WordsPatch {
  return { n, sadr: b.sadr ?? v.sadr, ajuz: b.ajuz ?? v.ajuz, sadrW: b.sadrW, ajuzW: b.ajuzW };
}

/* ── explanations ──────────────────────────────────────────────────────── */

/** A stored explanation as {en, ur, ar} (the old single-language shape is English). */
export function expOf(v: Pick<Verse, 'exp'> | undefined): ExplanationEntry {
  const e = v?.exp;
  if (!e) return {};
  if (typeof e === 'string') return { en: e };
  return isObj(e) ? { ...e } : {};
}

/** Nothing real stored: empty, or the "being prepared" placeholder text. */
export const isPlaceholder = (s: string | undefined): boolean => !s || !s.trim() || /being prepared/i.test(s);

/** No language of the stored explanation holds real text. */
export function storedIsPlaceholder(v: Pick<Verse, 'exp'> | undefined): boolean {
  const e = expOf(v);
  return EXP_LANGS.every((l) => isPlaceholder(e[l]));
}

/** Every language the file gives is already stored, word for word. */
export function expMatches(v: Pick<Verse, 'exp'> | undefined, want: ExplanationEntry): boolean {
  const have = expOf(v);
  return EXP_LANGS.every((l) => want[l] == null || (have[l] || '').trim() === want[l]!.trim());
}

/* placeholder — nothing real stored, hidden
   stale       — readers are seeing this bayt, but not the text written for it
   differs     — real text stored, not the written one, and hidden
   loaded      — the written text is in, and hidden
   shown       — the written text is in, and readers can see it
   mismatch    — the file's entry cannot be used (see the row's note)       */
export type ExplanationState = 'placeholder' | 'stale' | 'differs' | 'loaded' | 'shown' | 'mismatch';

export function explanationState(v: Verse | undefined, want: ExplanationEntry | undefined, on: boolean): ExplanationState {
  if (want && !expMatches(v, want)) {
    if (on) return 'stale';
    return storedIsPlaceholder(v) ? 'placeholder' : 'differs';
  }
  if (storedIsPlaceholder(v)) return on ? 'stale' : 'placeholder';
  return on ? 'shown' : 'loaded';
}

/** A state the Load button applies to. */
export const expLoadable = (st: ExplanationState): boolean => st === 'placeholder' || st === 'differs' || st === 'stale';

/* Sending `exp` replaces the whole object, so every patch is built on top of
   what is stored — otherwise the Urdu beside each English explanation would
   be deleted. Null when the stored text already matches. */
export function explanationPatch(n: number, v: Verse, want: ExplanationEntry): { n: number; exp: ExplanationEntry } | null {
  if (expMatches(v, want)) return null;
  const exp = expOf(v);
  for (const l of EXP_LANGS) if (want[l] != null) exp[l] = want[l]!.trim();
  return { n, exp };
}

/* ── translations & sharḥ ──────────────────────────────────────────────── */

/** loaded: everything the file gives is in place · differs: something else
    is stored in one of those fields · none: nothing stored in them yet. */
export type TranslationState = 'none' | 'loaded' | 'differs' | 'mismatch';

const trSame = (v: Verse, w: TranslationEntry) =>
  (w.tr == null || (v.tr || '') === w.tr)
  && (w.ur == null || (v.ur || '') === w.ur)
  && (w.sharh == null || (expOf(v).ur || '') === w.sharh);

export function translationState(v: Verse | undefined, w: TranslationEntry | undefined): TranslationState {
  if (!v || !w) return 'mismatch';
  if (trSame(v, w)) return 'loaded';
  const stored = (w.tr != null && v.tr) || (w.ur != null && v.ur) || (w.sharh != null && expOf(v).ur);
  return stored ? 'differs' : 'none';
}

export interface TranslationPatch { n: number; tr?: string; ur?: string; exp?: ExplanationEntry }

/* An explanation is one object holding every language it has been written in,
   and sending `exp` replaces the whole of it. So the sharḥ is merged onto what
   is already stored rather than sent on its own — otherwise loading it here
   would silently delete an English explanation written in the Content Editor.
   A field the file leaves out is not sent, so it is left exactly as stored. */
export function translationPatch(n: number, v: Verse, w: TranslationEntry): TranslationPatch | null {
  if (trSame(v, w)) return null;
  const p: TranslationPatch = { n };
  if (w.tr != null) p.tr = w.tr;
  if (w.ur != null) p.ur = w.ur;
  if (w.sharh != null) p.exp = { ...expOf(v), ur: w.sharh };
  return p;
}

/* ── explanation switches ──────────────────────────────────────────────── */

/* Sending `enabled` replaces the whole map, so the stored map is read, the
   bayts changed, and the whole thing sent back — otherwise every bayt left
   out would be switched off. */
export function withSwitches(enabled: Record<string, boolean>, ns: readonly number[], on: boolean): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(enabled)) next[k] = v === true;
  for (const n of ns) next[n] = on;
  return next;
}

/* ── bayt lists ────────────────────────────────────────────────────────── */

/** "1-16", "1,5,9-12" → the bayt numbers, checked against 1–last. Throws with
    a message on anything it cannot read. */
export function parseBaytSpec(spec: string, last: number): number[] {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const m = /^\s*(\d+)\s*(?:[-–]\s*(\d+)\s*)?$/.exec(part);
    if (!m) throw new Error(`cannot read "${part}" in --bayts`);
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b > last || b < a) throw new Error(`--bayts ${part.trim()}: out of range (1–${last})`);
    for (let n = a; n <= b; n++) out.add(n);
  }
  return [...out].sort((x, y) => x - y);
}

/** "1–14" when they run on, "1, 5, 9–12" when they do not. */
export function describeBayts(ns: readonly number[]): string {
  const runs: [number, number][] = [];
  for (const n of [...ns].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && n === last[1] + 1) last[1] = n; else runs.push([n, n]);
  }
  return runs.map(([a, b]) => (a === b ? String(a) : `${a}–${b}`)).join(', ');
}

/* ── sending ───────────────────────────────────────────────────────────────
   Sent in order, each batch carrying the version the last one returned, so a
   failure leaves a prefix stored — which the next run sees as already current
   and skips — rather than half a request applied. */

export interface SaveAnswer { version: number; applied: number[] }

/** Thrown when a batch fails: what failed, and what went in before it. */
export class BatchFailure extends Error {
  /** What the save threw (the caller's own error type, e.g. an ApiError). */
  readonly error: unknown;
  /** The bayts of the batch that failed. */
  readonly chunk: number[];
  /** Bayts stored by the batches before it. */
  readonly applied: number;
  /** The version the failed batch was sent on. */
  readonly version: number;
  constructor(cause: unknown, chunk: number[], applied: number, version: number) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'BatchFailure';
    this.error = cause;
    this.chunk = chunk;
    this.applied = applied;
    this.version = version;
  }
}

export async function saveInBatches<T extends { n: number }>(
  bayts: readonly T[], size: number, baseVersion: number,
  save: (baseVersion: number, chunk: T[]) => Promise<SaveAnswer>,
  onSending?: (chunk: T[], version: number) => void,
  onSaved?: (chunk: T[], before: number, answer: SaveAnswer) => void,
): Promise<{ version: number; applied: number; appliedBayts: number[] }> {
  let version = baseVersion, applied = 0;
  const appliedBayts: number[] = [];
  for (let at = 0; at < bayts.length; at += size) {
    const chunk = bayts.slice(at, at + size);
    onSending?.(chunk, version);
    let answer: SaveAnswer;
    try { answer = await save(version, chunk); }
    catch (e) { throw new BatchFailure(e, chunk.map((b) => b.n), applied, version); }
    onSaved?.(chunk, version, answer);
    applied += answer.applied.length;
    appliedBayts.push(...answer.applied);
    version = answer.version;
  }
  return { version, applied, appliedBayts };
}

/** Bayt numbers in order, from any iterable of keys. */
export const sortedBayts = (keys: Iterable<number>): number[] => [...new Set(keys)].sort((a, b) => a - b);
