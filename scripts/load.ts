/* Loads explanations, word meanings, or translations & sharḥ into a matn's
   stored document, from a JSON file — the terminal twin of /admin/loader.

     node scripts/load.ts --poem <id> --kind words --file meanings.json             # dry run, all of it
     node scripts/load.ts --poem <id> --kind words --file meanings.json --show      # …and print every cell
     node scripts/load.ts --poem <id> --kind words --file meanings.json --bayts 1-22 --write
     node scripts/load.ts --poem <id> --kind explanations --file exp.json --bayts 2-14 --write
     node scripts/load.ts --poem <id> --kind explanations --file exp.json --bayts 2-14 --write --enable
     node scripts/load.ts --poem <id> --kind translations --file urdu.json --write

   Options
     --poem <id>      the matn, as registered (src/poems/registry.ts)
     --kind <kind>    explanations | words | translations
     --file <path>    the JSON file; docs/data-formats.md describes all three
     --bayts <list>   "1-16", "1,5,9-12"; default: every bayt in the file
     --show           print what each bayt would get (every cell, every text)
     --write          actually send it — without this nothing is sent
     --enable         explanations only: also switch those bayts on for readers
     --disable        explanations only: also switch them off
     --origin <url>   the site to write to (default: the live site, SITE.url)

   It does nothing without --write.

   /admin/loader does the same job from a browser, with each bayt readable
   before anything is sent; it is the easier way in, and this script is here
   for a checkout and a terminal. Both apply the same rules, from
   src/shared/bulk.ts, and talk to the API through src/client/api.ts:

     · The Arabic is never retyped. A words file says only how many of a
       hemistich's words each cell takes and what that cell means; the cells
       are cut here out of the hemistich as the store has it. The API refuses
       a verse whose cells, joined by single spaces, do not come back to the
       hemistich exactly, and a hand-copied Arabic word with one diacritic
       adrift is impossible to spot by eye. Built this way the join holds by
       construction, and the run stops if a bayt's counts do not add up to its
       word count — so a miscount is a refusal before anything is sent, not a
       corrupt verse afterwards.
     · Sending `exp` REPLACES the whole object, so an English-only patch would
       delete the Urdu sitting beside it. Every explanation and sharḥ is
       merged onto what is stored.
     · Sending `enabled` REPLACES the whole map, so a partial one would switch
       off every bayt it omitted. The full map is read, merged, and sent back.
     · Loading an explanation and switching it on are separate steps on
       purpose: the switch is an accuracy gate, so text can go in first and be
       read on the page before anyone else can see it (the Content Editor
       previews a switched-off card). A translations file's sharḥ is the
       exception, as on the page: saving it switches its bayt on, or the note
       would be written but unreachable.

   Re-running is safe: a bayt whose stored text already matches is skipped,
   and the API skips anything unchanged as well. A long list goes up in
   ordered batches, each on the version the last one returned, so a failure
   leaves a prefix stored that the next run sees as current.

   The password is read from ASL_PASSWORD, or prompted for with the echo off.
   Never pass it as an argument — it would sit in your shell history.

   --origin exists for local work (a `wrangler dev`), not for rehearsal: a
   preview deployment of this worker reads the same R2 bucket as the live
   site, so a write aimed at one lands on the live data just the same. The
   dry run is the rehearsal.                                                  */

import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { ApiError, checkPassword, getPoemDoc, getSwitches, saveBayts, saveSwitches } from '../src/client/api.ts';
import { SITE } from '../src/config/site.ts';
import { getPoem } from '../src/poems/index.ts';
import type { PoemDoc, Verse } from '../src/poems/types.ts';
import { stripTags } from '../src/shared/poem-data.ts';
import {
  BATCH, BULK_KINDS, BatchFailure, buildWords, describeBayts, detectKind, explanationPatch, indexDoc, isBulkKind,
  isFlagged, parseBaytSpec, proseText, parseBulk, readJsonText, saveInBatches, sortedBayts, storedIsPlaceholder,
  translationPatch, withSwitches, wordsOf, wordsPatch, wordsState,
  type BuiltWords, type BulkKind, type ExplanationEntry, type TranslationEntry, type WordsEntry,
} from '../src/shared/bulk.ts';

// ------------------------------------------------------------------ args

const argv = process.argv.slice(2);
const OPTS = ['poem', 'kind', 'file', 'bayts', 'show', 'write', 'enable', 'disable', 'origin', 'help'];
const TAKES_VALUE = ['poem', 'kind', 'file', 'bayts', 'origin'];
const flag = (name: string) => argv.includes('--' + name);
const value = (name: string): string | null => {
  const i = argv.indexOf('--' + name);
  return i === -1 ? null : (argv[i + 1] ?? null);
};

const die = (msg: string, detail?: string): never => {
  console.error('\n' + msg);
  if (detail) console.error(detail);
  process.exit(1);
};
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

if (flag('help')) {
  const src = await readFile(new URL(import.meta.url), 'utf8');
  console.log(/\/\*([\s\S]*?)\n\n {3}It does nothing/.exec(src)?.[1]?.replace(/^ {3}/gm, '') ?? '');
  process.exit(0);
}
const unknown = argv.filter((a) => a.startsWith('--') && !OPTS.includes(a.slice(2)));
if (unknown.length) die(`unknown option ${unknown.join(' ')}. Valid: ${OPTS.map((o) => '--' + o).join(' ')}`);
for (const o of TAKES_VALUE) {
  if (flag(o) && (!value(o) || value(o)!.startsWith('--'))) die(`--${o} needs a value`);
}

const WRITE = flag('write');
const SHOW = flag('show');
const ENABLE = flag('enable');
const DISABLE = flag('disable');
const ORIGIN = (value('origin') || SITE.url).replace(/\/$/, '');
const POEM = value('poem') ?? die('--poem is required: the id of a registered matn.');
const KIND_ARG = value('kind');
if (!isBulkKind(KIND_ARG)) die(`--kind is required. One of: ${BULK_KINDS.map((k) => k.id).join(', ')}`);
const KIND = KIND_ARG as BulkKind;
const FILE = value('file') ?? die('--file is required: the JSON to load (docs/data-formats.md).');
if (ENABLE && DISABLE) die('--enable and --disable are opposites; pick one.');
if ((ENABLE || DISABLE) && KIND !== 'explanations') {
  die('--enable and --disable switch explanations on or off; they go with --kind explanations.'
    + (KIND === 'translations' ? '\nA translations file switches on the bayts whose sharḥ it saves by itself.' : ''));
}

/* src/client/api.ts is the one place every route is spelled, and it calls
   fetch('/api/…') with a same-origin path, as a page does. There is no page
   here, so those paths are resolved against --origin. */
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  realFetch(typeof input === 'string' && input.startsWith('/') ? ORIGIN + input : input, init)) as typeof fetch;

// -------------------------------------------------------------- password

async function password(): Promise<string> {
  if (process.env.ASL_PASSWORD) return process.env.ASL_PASSWORD;
  if (!process.stdin.isTTY) return die('No ASL_PASSWORD set and no terminal to ask on.');
  process.stdout.write('Password: ');
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const onData = (ch: Buffer | string) => {
    // keep the prompt visible, swallow everything typed after it
    if (!/[\r\n]/.test(String(ch))) process.stdout.write('\u001b[2K\u001b[200DPassword: ');
  };
  process.stdin.on('data', onData);
  const answer = await new Promise<string>((r) => rl.question('', r));
  process.stdin.off('data', onData);
  rl.close();
  process.stdout.write('\n');
  return answer;
}

// ------------------------------------------------------------------ file

const config = getPoem(POEM);
const text = await readFile(FILE, 'utf8').catch((e: Error) => die(`Cannot read ${FILE}: ${e.message}`));
const read = readJsonText(text);
if ('error' in read) die(`${FILE}: ${read.error}`);
const json = (read as { json: unknown }).json;
const parsed = parseBulk(KIND, json, config?.verses);
const seems = detectKind(json);
const hint = seems && seems !== KIND ? `\nIt looks like a file of ${seems} — try --kind ${seems}.` : '';
if (parsed.problems.length) die(`${FILE} cannot be read as ${KIND}:${hint}`, '  ' + parsed.problems.join('\n  '));

const ALL = sortedBayts([...parsed.entries.keys(), ...parsed.invalid.keys()]);
const LAST = ALL[ALL.length - 1] ?? 0;
let BAYTS: number[] = ALL;
const spec = value('bayts');
if (spec) {
  try { BAYTS = parseBaytSpec(spec, LAST); }
  catch (e) { die((e as Error).message); }
}
const NOUN: Record<BulkKind, string> = { words: 'word meanings', explanations: 'explanation', translations: 'translation' };
const missing = BAYTS.filter((n) => !parsed.entries.has(n) && !parsed.invalid.has(n));
if (missing.length) die(`no ${NOUN[KIND]} written for bayt ${describeBayts(missing)} in ${FILE}`);
/* Stop on the first unusable entry: a partial load is worse than none,
   because the next run would have to work out which half went in. */
const unusable = BAYTS.filter((n) => parsed.invalid.has(n));
if (unusable.length) {
  die(`${FILE}: bayt ${describeBayts(unusable)} cannot be loaded as written —${hint}`,
    '  ' + unusable.flatMap((n) => parsed.invalid.get(n)!).join('\n  '));
}

// ---------------------------------------------------------------- header

const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(ORIGIN);
console.log(`origin ${ORIGIN}`);
if (local) console.log('       a local worker — its own R2 bucket under .wrangler/');
else if (ORIGIN !== SITE.url) {
  console.log('       note: a deployment of this worker reads the same R2 bucket as the live site,');
  console.log('       so writing through it changes the live data.');
}
console.log(`matn   ${config ? `${config.titleEn} (${POEM})` : POEM}`);
console.log(`kind   ${BULK_KINDS.find((k) => k.id === KIND)!.label.toLowerCase()} · ${FILE}`);
console.log(`bayts  ${BAYTS.length} selected (${describeBayts(BAYTS)})`);
console.log(`mode   ${WRITE ? 'WRITE' : 'dry run — nothing will be sent'}`
  + (KIND !== 'explanations' ? '' : ENABLE ? ' · switching on' : DISABLE ? ' · switching off' : ' · switches untouched'));
console.log();

const pw = WRITE ? await password() : '';
if (WRITE) {
  let ok = false;
  try { ok = await checkPassword(pw); }
  catch (e) { die(`Password check failed: ${e instanceof Error ? e.message : String(e)}.`); }
  if (!ok) die('Wrong password — nothing was sent.');
}

// ---------------------------------------------------------- stored state

let doc!: PoemDoc;
try { doc = await getPoemDoc(POEM); }
catch (e) {
  if (e instanceof ApiError && e.status === 400) die(`${POEM} is not a registered matn on ${ORIGIN}.`);
  if (e instanceof ApiError && e.status === 404) die(`${POEM} is not stored yet on ${ORIGIN} — import its text first (/admin/import).`);
  die(`Could not read the stored poem (${e instanceof ApiError ? 'HTTP ' + e.status : (e as Error).message}).`);
}
const stored = indexDoc(doc);

/* The explanation switches: which bayts can carry an explanation at all (the
   server lists every one of them), and which are on. */
let enabled: Record<string, boolean> = {};
if (KIND !== 'words') {
  try { enabled = { ...(await getSwitches(POEM)).enabled }; }
  catch (e) { die(`Could not read the switches (${e instanceof ApiError ? 'HTTP ' + e.status : (e as Error).message}).`); }
}
const expSet = new Set(Object.keys(enabled).map(Number));

const verseOf = (n: number): Verse => stored.get(n)?.v ?? die(`bayt ${n} is not in the stored document`);
const entryOf = <T>(n: number) => parsed.entries.get(n) as T;
const show = (label: string, s: string | undefined, max = 300) => {
  if (!s) return;
  const t = proseText(s);
  console.log(`   ${label.padEnd(6)} ${t.length > max ? t.slice(0, max) + '…' : t}`);
};

// ------------------------------------------------------------- the build

type Patch = { n: number };
const bayts: Patch[] = [];
const same: number[] = [];

if (KIND === 'words') {
  /* Build every selected bayt first and stop on the first miscount. */
  const built: { n: number; v: Verse; b: BuiltWords }[] = [];
  for (const n of BAYTS) {
    const v = verseOf(n);
    const b = buildWords(v, entryOf<WordsEntry>(n));
    if ('error' in b) die(`bayt ${n}: ${b.error}`, b.detail ? `       ${b.detail}` : undefined);
    built.push({ n, v, b: b as BuiltWords });
  }
  for (const { n, v, b } of built) {
    const st = wordsState(v, b);
    if (st === 'loaded') same.push(n); else bayts.push(wordsPatch(n, v, b));
  }
  const cellCount = built.reduce((k, { b }) => k + b.sadrW.length + b.ajuzW.length, 0);
  const wordCount = built.reduce((k, { v, b }) => k + wordsOf(b.sadr ?? v.sadr).length + wordsOf(b.ajuz ?? v.ajuz).length, 0);
  console.log(`words  ${wordCount} grouped into ${cellCount} cells, every one with a meaning`);
  console.log(`cells  ${plural(bayts.length, 'bayt')} to update, ${same.length} already current`);
  const recoloured = built.filter(({ b }) => b.sadr != null).length;
  if (recoloured) console.log(`       ${recoloured} carry colour-coded hemistichs, sent with their cells`);
  if (SHOW) {
    for (const { n, b } of built) {
      console.log(`\n── bayt ${n}`);
      for (const [label, cells] of [['sadr', b.sadrW], ['ʿajuz', b.ajuzW]] as const) {
        for (const c of cells) {
          console.log(`   ${label.padEnd(5)} ${stripTags(c.w)}   →  ${[c.g, c.gu].filter(Boolean).join('  ·  ')}`
            + (c.fn ? `   [footnote kept: ${c.fn}]` : ''));
        }
      }
    }
    console.log();
  }
} else if (KIND === 'explanations') {
  for (const n of BAYTS) {
    const v = verseOf(n);
    if (!expSet.has(n)) die(`bayt ${n} takes no explanation in ${POEM} (explanations.bayts in the registry)`);
    const p = explanationPatch(n, v, entryOf<ExplanationEntry>(n));
    if (p) bayts.push(p); else same.push(n);
  }
  const kept = (bayts as { n: number; exp: ExplanationEntry }[])
    .filter((b) => Object.keys(b.exp).some((l) => entryOf<ExplanationEntry>(b.n)[l as keyof ExplanationEntry] == null)).length;
  console.log(`text   ${bayts.length} to update, ${same.length} already current`);
  if (kept) console.log(`       ${kept} of them carry another language, which is preserved`);
  if (SHOW) {
    for (const n of BAYTS) {
      const e = entryOf<ExplanationEntry>(n);
      console.log(`\n── bayt ${n}${same.includes(n) ? ' (already current)' : ''}`);
      show('en', e.en); show('ur', e.ur); show('ar', e.ar);
    }
    console.log();
  }
} else {
  const flagged: number[] = [];
  for (const n of BAYTS) {
    const v = verseOf(n);
    const w = entryOf<TranslationEntry>(n);
    if (w.sharh && !expSet.has(n)) die(`bayt ${n} takes no explanation in ${POEM}, so it cannot carry a sharḥ (explanations.bayts in the registry)`);
    if (isFlagged(w)) flagged.push(n);
    const p = translationPatch(n, v, w);
    if (p) bayts.push(p); else same.push(n);
  }
  console.log(`text   ${bayts.length} to update, ${same.length} already current`);
  if (flagged.length) console.log(`       ⟨?⟩ flagged for review: bayt ${describeBayts(flagged)}`);
  if (SHOW) {
    for (const n of BAYTS) {
      const w = entryOf<TranslationEntry>(n);
      console.log(`\n── bayt ${n}${same.includes(n) ? ' (already current)' : ''}`);
      show('tr', w.tr); show('ur', w.ur); show('sharḥ', w.sharh);
    }
    console.log();
  }
}

// ------------------------------------------------------------- the write

const size = BATCH[KIND];
if (bayts.length && WRITE) {
  try {
    const r = await saveInBatches(bayts, size, doc.version,
      (version, chunk) => saveBayts(pw, POEM, version, chunk),
      undefined,
      (_chunk, before, a) => console.log(`       version ${before} → ${a.version} · ${a.applied.length} applied`));
    console.log(`       saved. ${plural(r.applied, 'bayt')} in all`);
  } catch (e) {
    const f = e instanceof BatchFailure ? e : null;
    const err = f ? f.error : e;
    const chunk = f ? describeBayts(f.chunk) : '?';
    const later = f && f.chunk[0] !== bayts[0]!.n;
    if (err instanceof ApiError && err.status === 409) {
      die(`Someone else saved while this was running, so bayt ${chunk} ${later ? 'and everything after it ' : ''}was not written.\n`
        + 'Run it again — it will pick up their version and re-apply only what is still needed.');
    }
    if (err instanceof ApiError && err.status === 401) die('The password was not accepted — nothing more was sent.');
    const note = f && f.applied ? `\n${plural(f.applied, 'bayt')} before it were stored; run again to finish.` : '';
    if (err instanceof ApiError && err.status === 422) {
      die(`Save refused at bayt ${chunk}: ${err.message}.${note}`, '  ' + err.problems.slice(0, 40).join('\n  '));
    }
    if (err instanceof ApiError) die(`Save failed at bayt ${chunk} (HTTP ${err.status}): ${err.message}.${note}`);
    die(`Could not reach ${ORIGIN} (${(err as Error)?.message}).${note}`);
  }
} else if (bayts.length) {
  const batches = Math.ceil(bayts.length / size);
  console.log(`       would send ${plural(bayts.length, 'bayt')} in ${plural(batches, 'request')} (base version ${doc.version})`);
}

// ------------------------------------------------------------ the switch

async function sendSwitches(next: Record<string, boolean>): Promise<void> {
  try {
    const r = await saveSwitches(pw, POEM, { enabled: next });
    console.log(`       saved. ${r.on} of ${Object.keys(next).length} now on`);
  } catch (e) {
    die(`Switch save failed (${e instanceof ApiError ? 'HTTP ' + e.status + ': ' + e.message : (e as Error).message}).`);
  }
}

if (ENABLE || DISABLE) {
  // the WHOLE map goes back, or every bayt left out would be switched off
  const next = withSwitches(enabled, BAYTS, ENABLE);
  const changing = BAYTS.filter((n) => (enabled[n] === true) !== ENABLE);
  const onBefore = Object.values(enabled).filter(Boolean).length;
  const onAfter = Object.values(next).filter(Boolean).length;
  console.log(`switch ${changing.length} to ${ENABLE ? 'turn on' : 'turn off'} · ${onBefore} on now → ${onAfter} after`);

  /* Turning a bayt on while it still holds the placeholder would publish
     "being prepared" to every reader, which is the one thing this whole gate
     exists to prevent.

     On a --write run the text above has already been saved, so the check is
     against what is now stored. On a dry run nothing was saved, so a bayt
     whose text this run WOULD have loaded is treated as loaded — and the
     summary says so, rather than quietly reporting a state that does not
     exist yet. */
  if (ENABLE) {
    const assumed: number[] = [];
    const placeholder = changing.filter((n) => {
      const patched = (bayts as { n: number; exp: ExplanationEntry }[]).find((b) => b.n === n);
      if (patched && !WRITE) assumed.push(n);
      return storedIsPlaceholder(patched ? { exp: patched.exp } : stored.get(n)?.v);
    });
    if (placeholder.length) {
      die(`Refusing to switch on bayt ${describeBayts(placeholder)}: still holding the placeholder.\n`
        + 'Load the text first (drop --enable), then run again with --enable.');
    }
    if (assumed.length) console.log(`       (bayt ${describeBayts(assumed)} counted as loaded — this run would load them first)`);
  }

  if (changing.length && WRITE) await sendSwitches(next);
  else if (changing.length) console.log('       would send the full map with those changed');
  else console.log('       nothing to change');
}

/* A sharḥ sits behind its bayt's explanation button, which stays hidden until
   the bayt is switched on — so, as on the page, the bayts whose sharḥ this
   run saves are switched on in the same pass. */
if (KIND === 'translations') {
  const withSharh = (bayts as { n: number; exp?: ExplanationEntry }[]).filter((b) => b.exp).map((b) => b.n);
  const off = withSharh.filter((n) => enabled[n] !== true);
  if (off.length) {
    console.log(`switch ${off.length} to turn on, so the explanation button shows the sharḥ (bayt ${describeBayts(off)})`);
    if (WRITE) await sendSwitches(withSwitches(enabled, off, true));
    else console.log('       would send the full map with those changed');
  }
}

console.log();
console.log(WRITE ? 'Done.' : 'Dry run only. Add --write to send it.');
