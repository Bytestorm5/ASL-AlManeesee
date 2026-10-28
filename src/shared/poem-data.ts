/* The rules every stored matn obeys, shared by the worker (which enforces them
   on every write) and the editors (which check a draft before sending it).

   ── Storage layout (R2) ──────────────────────────────────────────────────
     data/poem/<id>.json              {id, version, updatedAt, chapters:[…], variants?}
     data/qiraat/<id>.json            {id, version, updatedAt, examples:{bayt:[…]}}
     data/qiraat/<id>.index.json      {id, version, bayts:[…]} — tiny; lets the page
                                      place its buttons without the whole dataset
     data/backup/poem-<id>-v<N>.json  previous versions (the last few are kept)
     data/backup/qiraat-<id>-v<N>.json
   Everything lives under data/ — outside the mutun/ recording namespace — so
   the recitation manager never lists or deletes it.

   ── Versioning ───────────────────────────────────────────────────────────
   Each dataset carries an increasing integer `version`. A page records the
   version it loaded and only pulls again when the manifest reports a HIGHER
   one, so a reader who is already up to date fetches nothing.

   ── Validation ───────────────────────────────────────────────────────────
   The page renders each hemistich from its word cells, so the string must
   equal their space-join; verse markup is limited to <span> with a known
   class and an optional data-tp; translations stay plain text. A write that
   fails any of these is rejected whole — never partially applied. */

import { getPoem, isPoemId } from '../poems/index.ts';
import type { Chapter, PoemDoc, QiraatDoc, QiraatIndex, Verse } from '../poems/types.ts';

export const poemKey = (id: string) => `data/poem/${id}.json`;
export const qiraatKey = (id: string) => `data/qiraat/${id}.json`;
export const qiraatIndexKey = (id: string) => `data/qiraat/${id}.index.json`;
export const backupKey = (id: string, v: number) => `data/backup/poem-${id}-v${v}.json`;
export const qiraatBackupKey = (id: string, v: number) => `data/backup/qiraat-${id}-v${v}.json`;
export const BACKUPS_KEPT = 5;

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => !!v && typeof v === 'object' && !Array.isArray(v);

/* ── markup vocabulary ─────────────────────────────────────────────────────
   The only classes the reading page styles inside VERSE TEXT (sadr/ajuz and
   their word cells). `rmz*` colour a run inline, `rd` is red ink, `qur` marks
   a Qurʾānic word quoted inside a bayt (green, so it reads apart from the
   rubrication the rumūz use), `ann` draws a small ramz above the word (via
   data-tp), `small-noon` raises a connecting letter and `dot` stands a solid
   circle in the line.

   Prose fields (exp/expBy) legitimately carry richer markup — <p>, <b>, <i>,
   <span class="ar"> — so they get their own, separate vocabulary below. */
export const COLOR_CLASSES = ['rmz', 'rmz2', 'rmz3', 'rmz4', 'rmz5', 'rmz6', 'rmz7', 'rd', 'qur'];
export const ALLOWED_CLASSES = [...COLOR_CLASSES, 'ann', 'small-noon', 'dot'];

/* ── prose vocabulary (explanations) ───────────────────────────────────────
   An explanation is written in the content editor and injected as HTML by the
   reading page, so it is the one field where an author's markup reaches the
   DOM verbatim. The tags below are exactly the ones .explanation styles, and
   nothing else gets through: no <a> (a link in stored content is a phishing
   surface), no <img>, no <script>, no event handlers, no style attribute. */
export const PROSE_TAGS = ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'span'];
/* `ar`/`ur` mark an inline run in that script; `qline` is a centred, slightly
   larger display line (a quoted bayt or āyah set apart from the prose). */
export const PROSE_CLASSES = ['ar', 'ur', 'qline'];
export const PROSE_ATTRS = ['class', 'dir'];
export const DIR_VALUES = ['rtl', 'ltr', 'auto'];
export const EXP_LANGS = ['en', 'ur', 'ar'] as const;

const SPACERS = new Set([' ', '\t', '\n', 'ـ', '‌', '‍', ' ', ' ']);
const MARK_EXTRA = new Set(['ۥ', 'ۦ']); // small waw / small yeh (silah)
const PUNCT_RE = /[\p{P}\p{S}\p{N}]/u;
const MN_RE = /\p{Mn}/u;

export function stripTags(s: unknown): string {
  return String(s == null ? '' : s).replace(/<[^>]*>/g, '');
}

/** Consonant skeleton: base letters only (no marks, spacers, punctuation). */
export function skeleton(s: unknown): string {
  const plain = stripTags(s).normalize('NFC');
  let out = '';
  for (const ch of plain) {
    if (MN_RE.test(ch) || MARK_EXTRA.has(ch) || SPACERS.has(ch) || PUNCT_RE.test(ch)) continue;
    out += ch;
  }
  return out;
}

/**
 * Only <span class="…" [data-tp="…"]> is allowed, and tags must balance.
 *
 * `checkBalance` is off for individual word cells: a span may legitimately
 * open in one cell and close in the next (`<span class="rmz">ابۡنِ` +
 * `الۡعَلَا</span>`), because the page joins the cells with a space before
 * inserting them. Balance is asserted on the whole hemistich instead, which is
 * the string that actually reaches the DOM.
 */
export function checkMarkup(s: unknown, where: string, problems: string[], checkBalance = true): void {
  let depth = 0;
  const re = /<(\/?)([a-zA-Z0-9]+)([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(s == null ? '' : s))) !== null) {
    const closing = m[1], tag = m[2]!.toLowerCase(), rest = m[3] ?? '';
    if (tag !== 'span') { problems.push(`${where}: disallowed tag <${tag}>`); continue; }
    if (closing) { depth--; continue; }
    depth++;
    const attrs: Record<string, string> = {};
    const attrRe = /([a-zA-Z-]+)="([^"]*)"/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(rest)) !== null) attrs[a[1]!] = a[2]!;
    const names: string[] = [];
    const nameRe = /([a-zA-Z-]+)=/g;
    let n2: RegExpExecArray | null;
    while ((n2 = nameRe.exec(rest)) !== null) names.push(n2[1]!);
    const stray = names.filter((k) => k !== 'class' && k !== 'data-tp');
    if (stray.length) problems.push(`${where}: stray attribute(s) ${JSON.stringify(stray)}`);
    const cls = String(attrs.class || '').split(/\s+/).filter(Boolean);
    const bad = cls.filter((c) => !ALLOWED_CLASSES.includes(c));
    if (bad.length) problems.push(`${where}: unknown class(es) ${JSON.stringify(bad)}`);
    if ('data-tp' in attrs && !cls.includes('ann')) problems.push(`${where}: data-tp without ann class`);
  }
  if (checkBalance && depth !== 0) problems.push(`${where}: unbalanced <span> tags (depth ${depth})`);
}

/**
 * The same job as checkMarkup, for the prose fields: a small whitelist of
 * formatting tags, `class` only from PROSE_CLASSES, `dir` only from
 * DIR_VALUES, and no other attribute at all. `<br>` is the one tag that does
 * not close. Quotes may be single or double.
 */
const VOID_PROSE = new Set(['br']);
export function checkProseMarkup(s: unknown, where: string, problems: string[]): void {
  const str = String(s == null ? '' : s);
  const stack: string[] = [];
  const re = /<(\/?)([a-zA-Z0-9]+)([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    const closing = m[1], tag = m[2]!.toLowerCase(), rest = m[3] ?? '';
    if (!PROSE_TAGS.includes(tag)) { problems.push(`${where}: disallowed tag <${tag}>`); continue; }
    if (VOID_PROSE.has(tag)) continue;
    if (closing) {
      if (stack.pop() !== tag) problems.push(`${where}: mismatched </${tag}>`);
      continue;
    }
    stack.push(tag);
    const attrs: Record<string, string> = {};
    const attrRe = /([a-zA-Z-]+)\s*=\s*("[^"]*"|'[^']*')/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(rest)) !== null) attrs[a[1]!.toLowerCase()] = a[2]!.slice(1, -1);
    const names: string[] = [];
    const nameRe = /([a-zA-Z-]+)\s*=/g;
    let n2: RegExpExecArray | null;
    while ((n2 = nameRe.exec(rest)) !== null) names.push(n2[1]!.toLowerCase());
    const stray = names.filter((k) => !PROSE_ATTRS.includes(k));
    if (stray.length) problems.push(`${where}: stray attribute(s) ${JSON.stringify(stray)} on <${tag}>`);
    const cls = String(attrs.class || '').split(/\s+/).filter(Boolean);
    const bad = cls.filter((c) => !PROSE_CLASSES.includes(c));
    if (bad.length) problems.push(`${where}: unknown prose class(es) ${JSON.stringify(bad)}`);
    if ('dir' in attrs && !DIR_VALUES.includes(attrs.dir!))
      problems.push(`${where}: dir must be one of ${DIR_VALUES.join('/')}`);
  }
  if (stack.length) problems.push(`${where}: unclosed <${stack[stack.length - 1]}>`);
}

/**
 * An explanation is either one string or a {en, ur, ar} object — the reading
 * page shows a language switcher when more than one is filled in. Normalising
 * to the object here means the pages only ever have one shape to handle.
 * Returns null when nothing is left, which is how an explanation is deleted.
 */
export function normalizeExp(exp: unknown): Partial<Record<(typeof EXP_LANGS)[number], string>> | null {
  if (exp == null) return null;
  if (typeof exp === 'string') {
    const s = exp.trim();
    return s ? { en: s } : null;
  }
  if (!isObj(exp)) return null;
  const out: Partial<Record<(typeof EXP_LANGS)[number], string>> = {};
  for (const l of EXP_LANGS) {
    const v = exp[l];
    if (typeof v === 'string' && v.trim()) out[l] = v.trim();
  }
  return Object.keys(out).length ? out : null;
}

/** Validate an explanation in either shape. */
export function checkExp(exp: unknown, where: string, problems: string[]): void {
  if (exp == null) return;
  if (typeof exp === 'string') { checkProseMarkup(exp, where, problems); return; }
  if (!isObj(exp)) {
    problems.push(`${where}: exp must be a string or an {en,ur,ar} object`);
    return;
  }
  const unknownLangs = Object.keys(exp).filter((k) => !(EXP_LANGS as readonly string[]).includes(k));
  if (unknownLangs.length) problems.push(`${where}: unknown explanation language(s) ${JSON.stringify(unknownLangs)}`);
  for (const l of EXP_LANGS) {
    if (exp[l] == null) continue;
    if (typeof exp[l] !== 'string') { problems.push(`${where}: exp.${l} must be a string`); continue; }
    checkProseMarkup(exp[l], `${where}.exp.${l}`, problems);
  }
}

/**
 * The hemistichs of an incoming bayt are optional in one case only: an entry
 * that carries no sadr/ajuz at all and at least one prose field is a
 * PROSE-ONLY patch, sent by the content editor when it changes a translation
 * or an explanation. Making it resend the verse text would be asking it to
 * rewrite something it never touched.
 */
export const PROSE_FIELDS = ['tr', 'ur', 'exp', 'expBy'] as const;
export function isProseOnly(e: unknown): boolean {
  return isObj(e) && !('sadr' in e) && !('ajuz' in e) && PROSE_FIELDS.some((f) => f in e);
}

const HEMIS = [['sadr', 'sadrW'], ['ajuz', 'ajuzW']] as const;

/** Check one hemistich and its word cells. Shared by bayts and edition variants. */
function checkHemistich(text: unknown, cells: unknown, f: string, wf: string, where: string, problems: string[]): void {
  if (typeof text !== 'string') { problems.push(`${where}: ${f} must be a string`); return; }
  checkMarkup(text, `${where}.${f}`, problems);
  if (cells == null) return;                          // no cells → the string is the content
  if (!Array.isArray(cells)) { problems.push(`${where}: ${wf} must be an array`); return; }
  if (!cells.length) return;                          // empty array behaves as "no cells"
  for (let i = 0; i < cells.length; i++) {
    const c: unknown = cells[i];
    if (!isObj(c) || typeof c.w !== 'string') { problems.push(`${where}: ${wf}[${i}] missing "w"`); continue; }
    // An empty cell joins back as a double space — the hemistich and its cells
    // could then never be made to agree, and the reading page would show a gap.
    if (!c.w.trim()) { problems.push(`${where}: ${wf}[${i}] is an empty word`); continue; }
    /* `g` is the English word meaning, `gu` the Urdu one — a cell may carry
       either, both, or neither. */
    if (c.g != null && typeof c.g !== 'string') problems.push(`${where}: ${wf}[${i}] gloss must be a string`);
    if (c.gu != null && typeof c.gu !== 'string') problems.push(`${where}: ${wf}[${i}] Urdu gloss must be a string`);
    if (c.fn != null && typeof c.fn !== 'string') problems.push(`${where}: ${wf}[${i}] footnote must be a string`);
    checkMarkup(c.w, `${where}.${wf}[${i}]`, problems, false); // spans may straddle cells
  }
  // the page renders the hemistich from its cells — the two must agree exactly
  const joined = cells.map((c: unknown) => (isObj(c) && typeof c.w === 'string' ? c.w : '')).join(' ');
  if (joined !== text) problems.push(`${where}: ${f} ≠ space-join of ${wf}`);
}

function checkIndexes(v: unknown, field: string, where: string, problems: string[]): void {
  if (v == null) return;
  if (!Array.isArray(v) || v.some((x) => !Number.isInteger(x) || x < 0))
    problems.push(`${where}: ${field} must be a list of word positions`);
}

/**
 * Validate one incoming bayt against the rules the reading page depends on.
 * Returns an array of problem strings (empty = OK).
 *
 * Word cells are OPTIONAL: the page renders from the cells when they exist and
 * falls back to the plain string when they don't. When cells ARE present they
 * are what gets rendered, so the string must equal their space-join.
 */
export function validateBayt(e: unknown): string[] {
  const problems: string[] = [];
  const where = `bayt ${isObj(e) ? String(e.n) : String(e)}`;
  if (!isObj(e)) return [`${where}: not an object`];
  if (!Number.isInteger(e.n)) return [`${where}: missing/invalid "n"`];
  const proseOnly = isProseOnly(e);
  if (!proseOnly) {
    for (const k of ['sadr', 'ajuz']) if (!(k in e)) problems.push(`${where}: missing ${k}`);
    if (problems.length) return problems;
    for (const [f, wf] of HEMIS) checkHemistich(e[f], e[wf], f, wf, where, problems);
    checkIndexes(e.sr, 'sr', where, problems);
    checkIndexes(e.jr, 'jr', where, problems);
  }
  // Translations are injected as HTML by the reading page, so keep them plain.
  for (const f of ['tr', 'ur']) {
    if (f in e && e[f] != null) {
      const v = e[f];
      if (typeof v !== 'string') problems.push(`${where}: ${f} must be a string`);
      else if (v.includes('<') || v.includes('>'))
        problems.push(`${where}: ${f} contains "<" or ">" (translations must be plain text)`);
    }
  }
  // The explanation is prose and DOES carry markup — checked against its own,
  // much smaller vocabulary. `expBy` is the attribution line under it.
  if ('exp' in e) checkExp(e.exp, where, problems);
  if ('expBy' in e && e.expBy != null) {
    if (typeof e.expBy !== 'string') problems.push(`${where}: expBy must be a string`);
    else checkProseMarkup(e.expBy, `${where}.expBy`, problems);
  }
  if ('kind' in e && e.kind != null && (typeof e.kind !== 'string' || !/^[a-z][a-z0-9-]*$/.test(e.kind)))
    problems.push(`${where}: kind must be a short lowercase name`);
  return problems;
}

/** Walk a chapters array and hand back every verse object. */
export function versesOf(chapters: unknown): Verse[] {
  const out: Verse[] = [];
  (function walk(n: unknown): void {
    if (Array.isArray(n)) n.forEach(walk);
    else if (isObj(n)) {
      if ('n' in n && 'ajuz' in n) out.push(n as unknown as Verse);
      Object.values(n).forEach(walk);
    }
  })(chapters);
  return out;
}

/** Drop keys the app treats as absent, so stored shape matches the pages. */
function tidyCells(cells: Loose[]): Loose[] {
  return cells.map((c) => {
    const o: Loose = { w: c.w };
    for (const k of ['g', 'gu', 'fn']) if (c[k] != null && c[k] !== '') o[k] = c[k];
    return o;
  });
}

export interface MergeResult<D> { doc: D; applied: number[]; skipped: number[]; problems: string[] }

/**
 * Merge validated bayts into a poem document, on a copy.
 * Only fields present on an incoming bayt are touched, so a caller can send
 * just `tr`, or just the two hemistichs, without clobbering the rest.
 */
export function mergeBayts(doc: PoemDoc, bayts: unknown[]): MergeResult<PoemDoc> {
  const next = structuredClone(doc);
  const byNum = new Map(versesOf(next.chapters).map((v) => [v.n, v as unknown as Loose]));
  const problems: string[] = [], applied: number[] = [], skipped: number[] = [];

  for (const raw of bayts) {
    const errs = validateBayt(raw);
    if (errs.length) { problems.push(...errs); continue; }
    const e = raw as Loose & { n: number };
    const v = byNum.get(e.n);
    if (!v) { problems.push(`bayt ${e.n}: no such bayt in ${next.id}`); continue; }
    const prose = isProseOnly(e);
    const staged: Loose = prose ? {} : { sadr: e.sadr, ajuz: e.ajuz };
    if (!prose) {
      if (Array.isArray(e.sadrW) && e.sadrW.length) staged.sadrW = tidyCells(e.sadrW as Loose[]);
      if (Array.isArray(e.ajuzW) && e.ajuzW.length) staged.ajuzW = tidyCells(e.ajuzW as Loose[]);
      for (const k of ['sr', 'jr']) if (k in e) staged[k] = Array.isArray(e[k]) && (e[k] as unknown[]).length ? e[k] : undefined;
      if ('kind' in e) staged.kind = e.kind || undefined;
    }
    /* null means "leave this field alone"; an empty string means "remove it",
       which is how the content editor deletes a translation or an explanation.
       Both have to be expressible — otherwise the only way to undo a mistaken
       translation would be to edit storage by hand. */
    for (const f of ['tr', 'ur']) {
      if (!(f in e) || e[f] == null) continue;
      staged[f] = e[f] === '' ? undefined : e[f];
    }
    if ('exp' in e) staged.exp = normalizeExp(e.exp) || undefined;
    if ('expBy' in e && e.expBy != null) staged.expBy = String(e.expBy).trim() ? e.expBy : undefined;

    const unchanged = Object.keys(staged).every((k) => JSON.stringify(v[k]) === JSON.stringify(staged[k]));
    if (unchanged) { skipped.push(e.n); continue; }
    for (const [k, val] of Object.entries(staged)) {
      if (val === undefined) delete v[k]; else v[k] = val;
    }

    /* A caller may legitimately send a hemistich without its cells. But if the
       STORED verse does have cells, changing only the string would leave the
       two disagreeing — and the page renders from the cells, so the edit would
       appear to do nothing. Catch that rather than storing a contradiction. */
    for (const [f, wf] of prose ? [] : HEMIS) {
      const cells = v[wf];
      if (!Array.isArray(cells) || !cells.length) continue;
      if (cells.map((c: Loose) => c.w).join(' ') !== v[f])
        problems.push(`bayt ${e.n}: ${f} no longer matches the stored ${wf} — send the word cells together with the text`);
    }
    applied.push(e.n);
  }
  return { doc: next, applied, skipped, problems };
}

/** Edition 2+ wording: keyed by edition, then bayt. */
export function validateVariants(doc: Pick<PoemDoc, 'id' | 'variants' | 'chapters'>): string[] {
  const problems: string[] = [];
  const variants = doc.variants;
  if (variants == null) return problems;
  if (!isObj(variants)) return ['variants must be an object keyed by edition number'];
  const p = getPoem(doc.id);
  const editions = p?.nuskhas?.length ?? 1;
  const nums = new Set(versesOf(doc.chapters).map((v) => v.n));
  for (const [k, byBayt] of Object.entries(variants)) {
    const ed = Number(k);
    if (!Number.isInteger(ed) || ed < 2 || ed > editions) {
      problems.push(`variants.${k}: edition must be 2–${editions} (register the editions in the matn's nuskhas first)`);
      continue;
    }
    if (!isObj(byBayt)) { problems.push(`variants.${k}: must be an object keyed by bayt`); continue; }
    for (const [b, o] of Object.entries(byBayt)) {
      const where = `variants.${k} bayt ${b}`;
      if (!nums.has(Number(b))) { problems.push(`${where}: no such bayt`); continue; }
      if (!isObj(o)) { problems.push(`${where}: not an object`); continue; }
      for (const [f, wf] of HEMIS) {
        if (o[f] == null) { if (o[wf] != null) problems.push(`${where}: ${wf} without ${f}`); continue; }
        checkHemistich(o[f], o[wf], f, wf, where, problems);
      }
      checkIndexes(o.sr, 'sr', where, problems);
      checkIndexes(o.jr, 'jr', where, problems);
      if (o.tr != null && (typeof o.tr !== 'string' || /[<>]/.test(o.tr))) problems.push(`${where}: tr must be plain text`);
      if ('exp' in o) checkExp(o.exp, where, problems);
    }
  }
  return problems;
}

/** Structural sanity on a whole poem document before it is stored. */
export function validatePoemDoc(doc: unknown): string[] {
  const problems: string[] = [];
  if (!isObj(doc)) return ['document is not an object'];
  if (!isPoemId(doc.id)) problems.push(`unknown poem id ${JSON.stringify(doc.id)} — register it in src/poems/registry.ts first`);
  if (!Array.isArray(doc.chapters) || !doc.chapters.length) problems.push('chapters must be a non-empty array');
  if (problems.length) return problems;

  const id = doc.id as string;
  (doc.chapters as unknown[]).forEach((ch, i) => {
    if (!isObj(ch)) { problems.push(`chapter ${i + 1}: not an object`); return; }
    if (!Array.isArray(ch.verses)) problems.push(`chapter ${i + 1}: verses must be an array`);
    if (typeof ch.ar !== 'string') problems.push(`chapter ${i + 1}: missing Arabic heading "ar"`);
    for (const f of ['en', 'tr', 'desc', 'note']) {
      if (ch[f] != null && typeof ch[f] !== 'string') problems.push(`chapter ${i + 1}: ${f} must be a string`);
    }
  });
  const verses = versesOf(doc.chapters);
  const expected = getPoem(id)?.verses;
  if (expected && verses.length !== expected)
    problems.push(`${id}: expected ${expected} verses, found ${verses.length}`);
  const nums = verses.map((v) => v.n);
  if (new Set(nums).size !== nums.length) problems.push(`${id}: duplicate verse numbers`);
  problems.push(...validateVariants(doc as unknown as PoemDoc));
  return problems;
}

/* ── cursive joining across markup boundaries ──────────────────────────────
   A ramz is coloured by wrapping PART of a word in a <span>, which splits that
   word into two style runs — e.g. `وَ<span class="rmz4">كُوفِيِّ</span>هِمۡ`,
   where the tag falls between the yāʾ and the hāʾ. HarfBuzz (Chrome, Firefox,
   Android, Linux WebKit) shapes across such a boundary and the word still
   reads as one; CoreText — Safari on iOS and macOS — shapes each run on its
   own, so the word came apart into two on an iPad.

   No CSS can fix that: it is a shaping decision, and the shaper is only ever
   given one run at a time. So say explicitly what it cannot infer — a ZERO
   WIDTH JOINER on each side of the boundary. It is inserted only where the two
   letters genuinely do join, and it is applied on the way OUT of storage: the
   stored text stays plain, so the Bayt Editor never sees a joiner. Search and
   copy strip it again. */
const ZWJ = '‍';

/* Joining behaviour, from ArabicShaping.txt, for the letters these mutūn use.
   Dual-joining (joins to BOTH neighbours) and right-joining (joins only to the
   letter BEFORE it — no initial/medial form). Everything else never joins. */
const JOIN_DUAL = 'ئبتثجحخسشصضطظعغـفقكلمنهيی';
const JOIN_RIGHT = 'آأؤإاةدذرزوىٱے';
const JOINS_FORWARD = new Set(JOIN_DUAL.split(''));
const JOINS_BACKWARD = new Set((JOIN_DUAL + JOIN_RIGHT).split(''));

// Ḥarakāt and the Quranic small marks never break a join, so joining is decided
// on the letters either side of them. An existing ZWJ is skipped likewise (and
// so this stays idempotent).
const TRANSPARENT_RE = /[\p{Mn}‍]/u;

function lastBase(s: string): string {
  for (let i = s.length - 1; i >= 0; i--) if (!TRANSPARENT_RE.test(s[i]!)) return s[i]!;
  return '';
}
function firstBase(s: string): string {
  for (let i = 0; i < s.length; i++) if (!TRANSPARENT_RE.test(s[i]!)) return s[i]!;
  return '';
}

/**
 * Weld the cursive joins that a tag would otherwise break. Returns the string
 * unchanged when it carries no markup, and is safe to apply twice.
 *
 * Applying this to a hemistich and to each of its word cells gives the same
 * answer either way round, so `cells.join(' ') === hemistich` still holds.
 */
export function weldJoins(html: unknown): string {
  const s = String(html == null ? '' : html);
  if (!s.includes('<')) return s;
  const parts = s.split(/(<[^>]*>)/); // even indices are text, odd ones tags
  let prev = -1;                      // index of the last text part with content
  for (let i = 0; i < parts.length; i += 2) {
    const cur = parts[i]!;
    if (!cur) continue;
    if (prev >= 0) {
      const before = parts[prev]!;
      if (JOINS_FORWARD.has(lastBase(before)) && JOINS_BACKWARD.has(firstBase(cur))) {
        if (!before.endsWith(ZWJ)) parts[prev] = before + ZWJ;
        if (!cur.startsWith(ZWJ)) parts[i] = ZWJ + cur;
      }
    }
    prev = i;
  }
  return parts.join('');
}

function weldVerseLike(v: Loose): void {
  for (const [f, wf] of HEMIS) {
    if (typeof v[f] === 'string') v[f] = weldJoins(v[f]);
    const cells = v[wf];
    if (!Array.isArray(cells)) continue;
    for (const c of cells) if (isObj(c) && typeof c.w === 'string') c.w = weldJoins(c.w);
  }
}

/** Weld every hemistich and word cell of a poem document (and its editions), IN PLACE. */
export function weldPoemDoc<D extends Pick<PoemDoc, 'chapters' | 'variants'>>(doc: D): D {
  if (!doc || !Array.isArray(doc.chapters)) return doc;
  for (const v of versesOf(doc.chapters)) weldVerseLike(v as unknown as Loose);
  for (const byBayt of Object.values(doc.variants ?? {})) {
    for (const o of Object.values(byBayt ?? {})) if (isObj(o)) weldVerseLike(o);
  }
  return doc;
}

/* ── LaTeX that came in with an import ─────────────────────────────────────
   Imported translations sometimes write Arabic letters as maths:
   `Hamzah ($\text{ء}$)`. The reading page prints text, not TeX. Unwrapping is
   lossless — \text{X} means exactly X — so it is done on the way out of
   storage, and the editors see the clean text, so the next save heals the
   stored copy. Only a $…$ span that actually contains \text{ is unwrapped: a
   lone $ in a translation is left exactly as written. */
const TEX_SPAN = /\$([^$]*\\text\{[^$]*)\$/g;
const TEX_WRAP = /\\text\{([^{}]*)\}/g;
const TEX_FIELDS = ['tr', 'ur', 'exp', 'expBy', 'en', 'desc', 'note'];

function stripTeX<T>(s: T): T {
  if (typeof s !== 'string' || !s.includes('\\text{')) return s;
  return s.replace(TEX_SPAN, '$1').replace(TEX_WRAP, '$1') as T;
}

/** Unwrap any LaTeX left in a document's prose, IN PLACE. */
export function stripPoemTeX<D extends { chapters: Chapter[] } | null>(doc: D): D {
  if (!doc || !Array.isArray(doc.chapters)) return doc;
  const clean = (o: Loose) => { for (const f of TEX_FIELDS) if (typeof o[f] === 'string') o[f] = stripTeX(o[f]); };
  for (const ch of doc.chapters) {
    clean(ch as unknown as Loose);
    for (const v of Array.isArray(ch.verses) ? ch.verses : []) clean(v as unknown as Loose);
  }
  return doc;
}

export function nowIso(): string { return new Date().toISOString(); }

/* ── qirāʾāt cards ─────────────────────────────────────────────────────────
   data/qiraat/<id>.json holds {id, version, updatedAt, examples:{<bayt>:[card]}}
   — the panels the mushaf button opens under a bayt. Two kinds:

     example card  {word, scope?, sura, ayah, ayahText, readings:[…]}
       one treated Qurʾānic word, the āyah it sits in, and who reads it how.
     rule card     {rule:{kind, title, statement, conditions?, caution?},
                    readings:[…], examples?:[{word, case?, sura, ayah, ayahText}]}
       a categorical uṣūl rule rather than a single word.

   Every text field is either a plain string or an {ar, en, ur} object — the
   panel has a language switcher and falls back to Arabic. The panel escapes
   all of them with one exception: `ayahText` is inserted as HTML so the
   treated word can be bolded. That is the only place markup is allowed, and
   only <b>. */
export const QX_TEXT_LANGS = ['ar', 'en', 'ur'] as const;
export const RULE_KINDS = ['rule', 'explain'];

/** A translatable field: a string, or {ar,en,ur} with at least one filled in. */
function checkText(v: unknown, where: string, problems: string[], { required = false } = {}): void {
  if (v == null || v === '') {
    if (required) problems.push(`${where}: required`);
    return;
  }
  if (typeof v === 'string') return;
  if (!isObj(v)) {
    problems.push(`${where}: must be a string or an {ar,en,ur} object`);
    return;
  }
  const unknownLangs = Object.keys(v).filter((k) => !(QX_TEXT_LANGS as readonly string[]).includes(k));
  if (unknownLangs.length) problems.push(`${where}: unknown language(s) ${JSON.stringify(unknownLangs)}`);
  for (const l of QX_TEXT_LANGS) {
    if (v[l] != null && typeof v[l] !== 'string') problems.push(`${where}.${l}: must be a string`);
  }
  /* Only a REQUIRED field has to say something. An optional one that is blank
     in every language is simply absent. */
  if (required && !QX_TEXT_LANGS.some((l) => typeof v[l] === 'string' && (v[l] as string).trim()))
    problems.push(`${where}: empty in every language`);
}

/** `ayahText` is the one field injected as HTML. Only balanced <b> is allowed. */
export function checkAyahText(s: unknown, where: string, problems: string[]): void {
  if (s == null || s === '') return;
  if (typeof s !== 'string') { problems.push(`${where}: must be a string`); return; }
  let depth = 0;
  const re = /<(\/?)([a-zA-Z0-9]+)([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const tag = m[2]!.toLowerCase();
    if (tag !== 'b') { problems.push(`${where}: only <b> is allowed, found <${tag}>`); continue; }
    if ((m[3] ?? '').trim()) { problems.push(`${where}: <b> takes no attributes`); continue; }
    depth += m[1] ? -1 : 1;
    if (depth < 0) { problems.push(`${where}: stray </b>`); return; }
  }
  if (depth !== 0) problems.push(`${where}: unbalanced <b>`);
}

/* An EMPTY readings list is legitimate (a card whose source does not say which
   reciters hold each view). What is checked is that the key is there and is
   an array — a card that lost its readings to a bad save would arrive without. */
function checkReadings(readings: unknown, where: string, problems: string[], { required = true } = {}): void {
  if (readings == null) {
    if (required) problems.push(`${where}: missing readings`);
    return;
  }
  if (!Array.isArray(readings)) { problems.push(`${where}: readings must be an array`); return; }
  readings.forEach((r: unknown, i) => {
    if (!isObj(r)) { problems.push(`${where}.readings[${i}]: not an object`); return; }
    checkText(r.who, `${where}.readings[${i}].who`, problems, { required: true });
    checkText(r.how, `${where}.readings[${i}].how`, problems, { required: true });
    checkText(r.note, `${where}.readings[${i}].note`, problems);
    if ('hafs' in r && typeof r.hafs !== 'boolean') problems.push(`${where}.readings[${i}].hafs: must be true or false`);
  });
}

/** Validate one card. Returns an array of problem strings (empty = OK). */
export function validateQiraatCard(card: unknown, where: string): string[] {
  const problems: string[] = [];
  if (!isObj(card)) return [`${where}: not an object`];

  if (card.rule) {
    const r = card.rule;
    if (!isObj(r)) return [`${where}.rule: not an object`];
    if (r.kind != null && !RULE_KINDS.includes(String(r.kind)))
      problems.push(`${where}.rule.kind: must be one of ${RULE_KINDS.join('/')}`);
    checkText(r.title, `${where}.rule.title`, problems, { required: true });
    checkText(r.statement, `${where}.rule.statement`, problems, { required: true });
    for (const list of ['conditions', 'caution']) {
      const items = r[list];
      if (items == null) continue;
      if (!Array.isArray(items)) { problems.push(`${where}.rule.${list}: must be an array`); continue; }
      items.forEach((c: unknown, i) => checkText(c, `${where}.rule.${list}[${i}]`, problems, { required: true }));
    }
    checkReadings(card.readings, where, problems, { required: false });
    if (card.examples != null) {
      if (!Array.isArray(card.examples)) problems.push(`${where}.examples: must be an array`);
      else card.examples.forEach((e: unknown, i) => {
        const w = `${where}.examples[${i}]`;
        if (!isObj(e)) { problems.push(`${w}: not an object`); return; }
        checkText(e.word, `${w}.word`, problems);
        checkText(e.case, `${w}.case`, problems);
        checkText(e.sura, `${w}.sura`, problems);
        if (e.ayah != null && !Number.isInteger(e.ayah)) problems.push(`${w}.ayah: must be a whole number`);
        checkAyahText(e.ayahText, `${w}.ayahText`, problems);
      });
    }
    return problems;
  }

  checkText(card.word, `${where}.word`, problems, { required: true });
  checkText(card.scope, `${where}.scope`, problems);
  checkText(card.sura, `${where}.sura`, problems);
  if (card.ayah != null && !Number.isInteger(card.ayah)) problems.push(`${where}.ayah: must be a whole number`);
  checkAyahText(card.ayahText, `${where}.ayahText`, problems);
  checkReadings(card.readings, where, problems);
  return problems;
}

export interface QiraatMergeResult extends MergeResult<QiraatDoc> { removed: number[] }

/**
 * Merge edited cards into a qirāʾāt document, on a copy.
 * `cards` is {<bayt>: [card] | null} — a partial map, so a save carries only
 * the bayts that were touched. null (or an empty array) removes that panel.
 */
export function mergeQiraatCards(doc: QiraatDoc, cards: Record<string, unknown>, maxBayt?: number): QiraatMergeResult {
  const next = structuredClone(doc);
  if (!isObj(next.examples)) next.examples = {};
  const problems: string[] = [], applied: number[] = [], skipped: number[] = [], removed: number[] = [];

  for (const key of Object.keys(cards)) {
    const n = parseInt(key, 10);
    if (!Number.isInteger(n) || n < 1 || String(n) !== key.trim() || (maxBayt && n > maxBayt)) {
      problems.push(`bayt ${JSON.stringify(key)}: not a bayt number`);
      continue;
    }
    const incoming = cards[key];

    if (incoming == null || (Array.isArray(incoming) && !incoming.length)) {
      if (next.examples[n] === undefined) { skipped.push(n); continue; }
      delete next.examples[n];
      removed.push(n);
      continue;
    }
    if (!Array.isArray(incoming)) { problems.push(`bayt ${n}: cards must be an array`); continue; }
    incoming.forEach((c: unknown, i) => problems.push(...validateQiraatCard(c, `bayt ${n} card ${i + 1}`)));
    if (problems.length) continue;
    if (JSON.stringify(next.examples[n]) === JSON.stringify(incoming)) { skipped.push(n); continue; }
    next.examples[n] = incoming;
    applied.push(n);
  }
  return { doc: next, applied, skipped, removed, problems };
}

/** Which bayts have a panel at all — lets the page place its buttons without
    pulling every card. */
export function qiraatIndexDoc(doc: QiraatDoc): QiraatIndex {
  const bayts = Object.keys(doc.examples || {})
    .map(Number).filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
  return { id: doc.id, version: doc.version, updatedAt: doc.updatedAt, bayts };
}
