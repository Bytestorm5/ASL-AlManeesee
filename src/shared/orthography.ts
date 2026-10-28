/* Orthography rules: how a matn is WRITTEN, never what it says.

   Each rule is a pure string → string function over one hemistich, word cell
   or chapter heading, as stored — markup included, so a rule must leave the
   `<span …>` tags alone. /admin/orthography previews every change a document
   would get and only then writes it back; a script can import the same rules,
   so the two can never disagree about what the orthography is.

   A rule must be idempotent (running the tool twice does nothing the second
   time) and must never touch a space, so a hemistich keeps its words and its
   word cells still rejoin to it — a bayt where they would not is left out.

   To add a rule: write it below and append it to ORTHOGRAPHY_RULES. Rules run
   in that order. Mark it `marksOnly` when it only moves or swaps marks: the
   tool then also checks that no letter changed (the consonant skeleton before
   and after) and leaves out any hemistich where one did.

   The old site also carried the printed rasm of al-Durrah al-Muḍiyyah —
   hamzat al-waṣl, a long vowel's stray sukūn, marks drifted onto an alif, and
   two hand-checked word lists. Those rules were read off one printed edition
   of one matn, so they went with it; only the rule that carries no editorial
   judgement at all is kept. */
import type { Chapter, PoemDoc, Verse, WordCell } from '../poems/types.ts';
import { skeleton } from './poem-data.ts';

export const SUKUN_RING = 'ْ';   // ARABIC SUKUN — the ring
export const SUKUN_MUSHAF = 'ۡ'; // SMALL HIGH DOTLESS HEAD OF KHAH — the muṣḥaf sukūn

export interface OrthographyRule {
  id: string;
  /** What it changes and why that cannot change a reading. Trusted HTML,
      written here — the tool shows it above the preview. */
  why: string;
  /** Moves or swaps marks only: no base letter may change. */
  marksOnly: boolean;
  apply(s: string): string;
  /** Optional tally for the summary line, e.g. "12 sukūn". */
  tally?: { label: string; count(before: string): number };
}

/** Sukūn → ۡ. The same mark in a different codepoint; every other matn in
    the collection already writes U+06E1, and the search box expects it. */
export const sukunRule: OrthographyRule = {
  id: 'sukun',
  why: '<b>Sukūn → <span class="ar">ۡ</span>.</b> Replaces U+0652 with U+06E1, the mark the rest of '
    + 'the collection uses. The same mark in a different codepoint — it cannot change a reading.',
  marksOnly: true,
  apply: (s) => s.split(SUKUN_RING).join(SUKUN_MUSHAF),
  tally: { label: 'sukūn', count: (s) => s.split(SUKUN_RING).length - 1 },
};

export const ORTHOGRAPHY_RULES: readonly OrthographyRule[] = [sukunRule];

/** Run the rules, in order, over one string. */
export function normalise(s: string, rules: readonly OrthographyRule[] = ORTHOGRAPHY_RULES): string {
  return rules.reduce((t, r) => r.apply(t), s);
}

/** One bayt the rules would change: the merge-route entry plus its preview. */
export interface PlannedBayt {
  n: number;
  sadr: string;
  ajuz: string;
  sadrW?: WordCell[];
  ajuzW?: WordCell[];
  was: string;
  now: string;
}

export interface OrthographyPlan {
  /** Bayts that would change and can be saved. */
  bayts: PlannedBayt[];
  /** Chapter headings that would change. */
  headings: { i: number; was: string; now: string }[];
  /** Bayts left out: their word cells would no longer rejoin to the hemistich. */
  broken: number[];
  /** Bayts or headings left out: a marks-only rule would have changed a letter. */
  altered: string[];
  /** Every bayt in the document. */
  total: number;
  /** Per rule with a tally, over the bayts that change. */
  tallies: { label: string; count: number }[];
}

const convertCells = (cells: WordCell[], rules: readonly OrthographyRule[]): WordCell[] =>
  cells.map((c) => ({ ...c, w: normalise(c.w, rules) }));

/** What the rules would do to a document, without changing it. */
export function planOrthography(doc: Pick<PoemDoc, 'chapters'>, rules: readonly OrthographyRule[] = ORTHOGRAPHY_RULES): OrthographyPlan {
  const plan: OrthographyPlan = { bayts: [], headings: [], broken: [], altered: [], total: 0, tallies: [] };
  const counted = rules.filter((r) => r.tally);
  const counts = counted.map(() => 0);
  /* The marks-only rules, run on their own, must leave every letter where it
     was; a rule that may change letters is not held to that. */
  const marksOnly = rules.filter((r) => r.marksOnly);
  const safe = (was: string) => !marksOnly.length || skeleton(normalise(was, marksOnly)) === skeleton(was);

  for (const ch of doc.chapters ?? []) {
    const ar = ch.ar || '';
    const now = normalise(ar, rules);
    if (now === ar) continue;
    if (safe(ar)) plan.headings.push({ i: ch.i, was: ar, now });
    else plan.altered.push(`chapter ${ch.i}`);
  }
  for (const ch of doc.chapters ?? []) {
    for (const v of ch.verses ?? []) {
      plan.total++;
      const sadr = normalise(v.sadr, rules), ajuz = normalise(v.ajuz, rules);
      if (sadr === v.sadr && ajuz === v.ajuz) continue;
      if (!safe(v.sadr) || !safe(v.ajuz)) { plan.altered.push(`bayt ${v.n}`); continue; }
      const e: PlannedBayt = { n: v.n, sadr, ajuz, was: v.sadr + '  ✽  ' + v.ajuz, now: sadr + '  ✽  ' + ajuz };
      /* cells travel with the text, through the same rules, or the save is refused */
      let broken = false;
      for (const [f, text] of [['sadrW', sadr], ['ajuzW', ajuz]] as const) {
        const cells = v[f];
        if (!Array.isArray(cells) || !cells.length) continue;
        const out = convertCells(cells, rules);
        e[f] = out;
        if (out.map((c) => c.w).join(' ') !== text) broken = true;
      }
      if (broken) { plan.broken.push(v.n); continue; }
      counted.forEach((r, k) => { counts[k]! += r.tally!.count(v.sadr + v.ajuz); });
      plan.bayts.push(e);
    }
  }
  plan.tallies = counted.map((r, k) => ({ label: r.tally!.label, count: counts[k]! }));
  return plan;
}

/** The whole document with the rules applied — a copy; `doc` is untouched.
    Bayts and headings the plan leaves out stay exactly as they were. */
export function applyOrthography<D extends Pick<PoemDoc, 'chapters'>>(doc: D, rules: readonly OrthographyRule[] = ORTHOGRAPHY_RULES): D {
  const plan = planOrthography(doc, rules);
  const heads = new Map(plan.headings.map((h) => [h.i, h.now]));
  const bayts = new Map(plan.bayts.map((b) => [b.n, b]));
  const next = structuredClone(doc);
  next.chapters.forEach((ch: Chapter) => {
    const h = heads.get(ch.i);
    if (h != null) ch.ar = h;
    (ch.verses ?? []).forEach((v: Verse) => {
      const b = bayts.get(v.n);
      if (!b) return;
      v.sadr = b.sadr; v.ajuz = b.ajuz;
      if (b.sadrW) v.sadrW = b.sadrW;
      if (b.ajuzW) v.ajuzW = b.ajuzW;
    });
  });
  return next;
}
