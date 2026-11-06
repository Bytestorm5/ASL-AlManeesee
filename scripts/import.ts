/* Stores a finished matn document through the API — the terminal twin of
   loading a .json at /admin/import.

     node scripts/import.ts --file content/zad-al-huffaz.json                       # dry run: check it only
     node scripts/import.ts --file content/zad-al-huffaz.json --write               # create it on the live site
     node scripts/import.ts --file content/zad-al-huffaz.json --write --overwrite   # replace what is stored

   Options
     --file <path>    the document, {id, chapters, variants?} — what /admin/import
                      saves as <id>-seed.json, or a file kept under content/
     --poem <id>      the matn it is for (default: the file's "id")
     --write          actually send it — without this nothing is sent
     --overwrite      replace a document that is already stored (the stored copy
                      is backed up first, as every write does)
     --origin <url>   the site to write to (default: the live site, SITE.url)

   The password comes from ASL_PASSWORD, as for scripts/load.ts, and is sent
   as a bearer token. The document is checked here first against the rules
   the API applies (src/shared/poem-data.ts), so a refusal shows up before
   anything is sent.

   It does nothing without --write. */
import { readFile } from 'node:fs/promises';
import { ApiError, PASSWORD_HEADER, putPoemDocument } from '../src/client/api.ts';
import { SITE } from '../src/config/site.ts';
import { getPoem } from '../src/poems/index.ts';
import type { PoemDoc } from '../src/poems/types.ts';
import { validateBayt, validatePoemDoc, versesOf } from '../src/shared/poem-data.ts';

const argv = process.argv.slice(2);
const OPTS = ['file', 'poem', 'write', 'overwrite', 'origin', 'help'];
const TAKES_VALUE = ['file', 'poem', 'origin'];
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

const ORIGIN = (value('origin') || SITE.url).replace(/\/$/, '');
const FILE = value('file') ?? die('--file is required: the document to store.');

let doc: Partial<PoemDoc>;
try { doc = JSON.parse(await readFile(FILE, 'utf8')) as Partial<PoemDoc>; }
catch (e) { die(`Could not read ${FILE} as JSON.`, (e as Error).message); }
const ID = value('poem') ?? doc!.id ?? die('The file has no "id"; say which matn it is with --poem <id>.');
const poem = getPoem(ID) ?? die(`${ID} is not a registered matn (src/poems/registry.ts).`);

/* The same checks, in the same order, as PUT /api/poems/:id/document. */
const full = { ...doc!, id: ID, version: 1, updatedAt: null } as PoemDoc;
const problems = validatePoemDoc(full);
const verses = versesOf(full.chapters);
for (const v of verses) problems.push(...validateBayt(v));
if (problems.length) die(`${FILE} would be refused:`, problems.map((p) => '  · ' + p).join('\n'));

const withExp = verses.filter((v) => v.exp).length;
const withWords = verses.filter((v) => v.sadrW?.length || v.ajuzW?.length).length;
const withTr = verses.filter((v) => v.tr).length;
console.log(`${poem.titleEn} (${ID}): ${full.chapters.length} chapters, ${verses.length} abyāt — `
  + `${withWords} with word meanings, ${withTr} translated, ${withExp} with an explanation. It passes every check.`);

if (!flag('write')) {
  console.log(`\nDry run: nothing sent. Add --write to store it on ${ORIGIN}.`);
  process.exit(0);
}

const pw = process.env.ASL_PASSWORD ?? die('Set ASL_PASSWORD to the admin password.');

/* src/client/api.ts is the one place every route is spelled; it calls a
   same-origin path and sends the password in its own header, as a page does.
   Here the path is resolved against --origin and the password travels as a
   bearer token instead. */
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  const given = headers.get(PASSWORD_HEADER);
  if (given) { headers.delete(PASSWORD_HEADER); headers.set('authorization', `Bearer ${given}`); }
  return realFetch(typeof input === 'string' && input.startsWith('/') ? ORIGIN + input : input, { ...init, headers });
}) as typeof fetch;

try {
  const r = await putPoemDocument(pw, ID, { chapters: full.chapters, ...(full.variants ? { variants: full.variants } : {}) }, flag('overwrite'));
  console.log(`\nStored on ${ORIGIN}: version ${r.version}${r.replaced ? ' (replaced the previous copy, which was backed up)' : ''}.`);
  console.log(`Read it at ${ORIGIN}/${ID}`);
} catch (e) {
  if (e instanceof ApiError) {
    if (e.status === 409 && !flag('overwrite')) die(`${e.message}\nAdd --overwrite to replace it.`);
    die(`The site refused it (${e.status}): ${e.message}`, e.problems.map((p) => '  · ' + p).join('\n'));
  }
  die('Could not reach the site.', (e as Error).message);
}
