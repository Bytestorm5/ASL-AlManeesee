/* Import a matn (/admin/import). Reads a Word file — or a finished .json
   document — in this browser, shows what came out of it, and stores it as the
   whole document of a registered matn (PUT /api/poems/<id>/document).

   Runs as the page's module script. */
import { ALL_POEMS, getPoem } from '../../poems/index.ts';
import type { Chapter, PoemDoc, Verse } from '../../poems/types.ts';
import { validateBayt, validatePoemDoc, versesOf } from '../../shared/poem-data.ts';
import { ApiError, putPoemDocument } from '../api.ts';
import { esc } from '../page.ts';
import { signIn, storedPassword } from './auth.ts';

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from the page`);
  return el as T;
}
const pwInput = $<HTMLInputElement>('pw');
const unlockBtn = $<HTMLButtonElement>('unlock');
const poemSel = $<HTMLSelectElement>('poem');
const sepInput = $<HTMLInputElement>('sep');
const fileInput = $<HTMLInputElement>('file');
const dropzone = $('dropzone');
const storeBtn = $<HTMLButtonElement>('store');
const replaceBtn = $<HTMLButtonElement>('replace');

let pw = '';
let doc: PoemDoc | null = null;   // the parsed document, ready to PUT
let fatal = true;                 // …unless the parse is unusable; see rebuild()

/* The matn must already be registered in src/poems/registry.ts — that is
   what declares its verse count, and the API checks the upload against it.
   Drafts are listed too: a new matn is imported before it is published. */
for (const p of ALL_POEMS) {
  const o = document.createElement('option');
  o.value = p.id;
  o.textContent = p.shortEn + ' — ' + p.verses + ' abyāt';
  poemSel.appendChild(o);
}
function expected(): number {
  return getPoem(poemSel.value)?.verses ?? 0;
}

// ---------- password gate ----------
function tryUnlock(): void {
  const val = pwInput.value;
  if (!val) return;
  unlockBtn.disabled = true;
  signIn(val)
    .then((ok) => {
      if (ok) {
        pw = val;
        $('gate').classList.add('hidden');
        $('work').classList.remove('hidden');
        if (!ALL_POEMS.length) {
          // nothing to import into — say how to get there instead of an empty picker
          $('noPoems').classList.remove('hidden');
          poemSel.disabled = true; sepInput.disabled = true; fileInput.disabled = true;
        }
      } else {
        $('gateMsg').textContent = 'Wrong password.';
      }
    })
    .catch(() => { $('gateMsg').textContent = 'Could not reach the server — check your connection.'; })
    .finally(() => { unlockBtn.disabled = false; });
}
unlockBtn.addEventListener('click', tryUnlock);
pwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
const saved = storedPassword();
if (saved) { pwInput.value = saved; tryUnlock(); }

/* ---------- .docx → word/document.xml ----------
   A .docx is a ZIP. Rather than pull in a zip library, walk the central
   directory and inflate the one entry we want with DecompressionStream —
   which every browser this admin page is opened in has. */
function findEntry(buf: ArrayBuffer, want: string): { method: number; bytes: Uint8Array<ArrayBuffer> } {
  const dv = new DataView(buf);
  let eocd = -1;
  const floor = Math.max(0, buf.byteLength - 22 - 65535);
  for (let i = buf.byteLength - 22; i >= floor; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('That is not a .docx — no ZIP directory in the file.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (p === 0xffffffff) throw new Error('That .docx uses ZIP64, which this page cannot read.');
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('The .docx directory is damaged.');
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const cmtLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buf, p + 46, nameLen));
    if (name === want) {
      if (compSize === 0xffffffff || localOff === 0xffffffff) throw new Error('That .docx uses ZIP64, which this page cannot read.');
      const lnLen = dv.getUint16(localOff + 26, true), leLen = dv.getUint16(localOff + 28, true);
      return { method, bytes: new Uint8Array(buf, localOff + 30 + lnLen + leLen, compSize) };
    }
    p += 46 + nameLen + extraLen + cmtLen;
  }
  throw new Error('No word/document.xml inside — is this really a Word file?');
}

async function readDocumentXml(buf: ArrayBuffer): Promise<string> {
  const e = findEntry(buf, 'word/document.xml');
  if (e.method === 0) return new TextDecoder('utf-8').decode(e.bytes);
  if (e.method !== 8) throw new Error('Unsupported compression inside the .docx.');
  const ds = new DecompressionStream('deflate-raw');
  const ab = await new Response(new Blob([e.bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new TextDecoder('utf-8').decode(ab);
}

/* ---------- document.xml → lines ----------
   <w:p> ends a line, <w:br/> breaks one inside a paragraph, text is <w:t>.
   The same reading the old site's command-line importer used, so a file
   reads the same way whichever tool it went through. */
function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
function xmlLines(xml: string): string[] {
  const out: string[] = [];
  const paras = xml.split(/<w:p[ >]/).slice(1);
  for (const para of paras) {
    let line = '';
    const push = () => { const t = line.replace(/\s+/g, ' ').trim(); if (t) out.push(t); line = ''; };
    const toks = para.match(/<w:t[^>]*>[^<]*<\/w:t>|<w:br\s*\/?>|<w:cr\s*\/?>/g) ?? [];
    for (const tok of toks) {
      if (tok.indexOf('<w:br') === 0 || tok.indexOf('<w:cr') === 0) push();
      else line += tok.replace(/^<w:t[^>]*>/, '').replace(/<\/w:t>$/, '');
    }
    push();
  }
  return out.map(decodeEntities);
}

// ---------- lines → the poem document ----------
function isArabic(s: string): boolean { return (s.match(/[؀-ۿ]/g) ?? []).length > s.length * 0.3; }

function build(lines: string[], id: string, sep: string): PoemDoc {
  /* The poem is the LONGEST unbroken run of Arabic lines. These files also
     carry an Arabic title up top and often quote a bayt again inside the
     English essay; both are isolated, so the longest run is the matn. */
  const runs: string[][] = [];
  let cur: string[] | null = null;
  for (const l of lines) {
    if (isArabic(l)) { if (!cur) { cur = []; runs.push(cur); } cur.push(l); }
    else cur = null;
  }
  runs.sort((a, b) => b.length - a.length);
  const block = runs[0] ?? [];

  const chapters: Chapter[] = [];
  let n = 0;
  for (const l of block) {
    if (l.indexOf(sep) !== -1) {
      const last = chapters[chapters.length - 1];
      if (!last) continue;                                // stray bayt before any heading
      const parts = l.split(sep);
      /* No `kind: ''` placeholder: the API reads a present `kind` as a word-list
         label and refuses an empty one (validateBayt). */
      last.verses.push({ n: ++n, sadr: (parts[0] ?? '').trim(), ajuz: (parts[1] ?? '').trim(), tr: '' });
    } else {
      chapters.push({ i: chapters.length + 1, ar: l, tr: '', en: '', desc: '', verses: [] });
    }
  }

  // English: numbered lines carry the translation, headings the chapter names
  let startAt = -1;
  for (let i = 0; i < lines.length; i++) if (/^English Translation/i.test(lines[i]!)) { startAt = i; break; }
  const en = lines.slice(startAt + 1);
  const trByN: Record<number, string> = {};
  const chapNames: { en: string; tr: string }[] = [];
  let last: number | null = null;
  for (const l of en) {
    if (isArabic(l)) continue;
    const m = l.match(/^(\d+)\.\s*(.+)$/);
    if (m) { last = +m[1]!; trByN[last] = m[2]!.trim(); continue; }
    const h = l.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (h && !/^[(*]/.test(l)) { chapNames.push({ en: h[1]!.trim(), tr: h[2]!.trim() }); last = null; continue; }
    // an unnumbered line right after a numbered one is a gloss on that bayt
    if (last && trByN[last]) trByN[last] += ' ' + l.trim();
  }
  chapters.forEach((c, ix) => {
    const name = chapNames[ix];
    if (name) { c.en = name.en; c.tr = name.tr; }
    for (const v of c.verses) v.tr = trByN[v.n] || '';
  });

  return { id, version: 1, updatedAt: new Date().toISOString(), chapters };
}

/* ---------- what the API will object to, said here first ----------
   The structural and per-bayt checks are the API's own (validatePoemDoc and
   validateBayt, src/shared/poem-data.ts), so the preview and the server cannot
   disagree; the server stays the authority and its complaints are shown
   verbatim on a rejected save. The rest are the mistakes a bad parse
   actually makes, worth seeing before upload. */
interface Flag { err: boolean; t: string }
interface Inspection { verses: Verse[]; flags: Flag[]; fatal: boolean }

const chapterVerses = (c: Chapter): Verse[] => (Array.isArray(c.verses) ? c.verses : []);

function inspect(d: PoemDoc): Inspection {
  const flags: Flag[] = [];
  const verses = versesOf(d.chapters);
  if (!d.chapters.length) flags.push({ err: true, t: 'No chapters found — check the separator.' });
  else {
    const problems = validatePoemDoc(d);
    for (const v of verses) problems.push(...validateBayt(v));
    for (const t of problems) flags.push({ err: true, t });
  }
  for (const v of verses) {
    if (!v.ajuz) flags.push({ err: true, t: 'Bayt ' + v.n + ' has no ʿajuz — the separator may be wrong on that line.' });
  }
  const noTr = verses.filter((v) => !v.tr).map((v) => v.n);
  if (noTr.length)
    flags.push({ err: false, t: noTr.length + ' abyāt have no translation: ' + noTr.slice(0, 20).join(', ') + (noTr.length > 20 ? '…' : '') });
  const noName = d.chapters.filter((c) => !c.en).length;
  if (noName) flags.push({ err: false, t: noName + ' chapters have no English name — the English block may be laid out differently.' });
  return { verses, flags, fatal: flags.some((f) => f.err) };
}

/* A badly read file can raise a problem on every bayt. Show the first few and
   fold the rest away, so the list never pushes the preview off the page. */
const FLAGS_SHOWN = 8;
function flagItems(list: Flag[]): string {
  return list.map((f) => '<li' + (f.err ? ' class="err"' : '') + '>' + esc(f.t) + '</li>').join('');
}

function render(d: PoemDoc, info: Inspection): void {
  const exp = expected();
  $('stats').innerHTML =
    '<div class="stat"><b>' + d.chapters.length + '</b>chapters</div>' +
    '<div class="stat' + (exp && info.verses.length !== exp ? ' bad' : '') + '"><b>' +
      info.verses.length + '</b>abyāt' + (exp ? ' of ' + exp : '') + '</div>' +
    '<div class="stat"><b>' + info.verses.filter((v) => v.tr).length + '</b>translated</div>';

  const shown = info.flags.slice(0, FLAGS_SHOWN), rest = info.flags.slice(FLAGS_SHOWN);
  $('flags').innerHTML = flagItems(shown) + (rest.length
    ? '<li class="more"><details><summary>…and ' + rest.length + ' more</summary><ul class="flags">' + flagItems(rest) + '</ul></details></li>'
    : '');

  const rows = ['<tr><th>#</th><th>Bayt</th><th>Translation</th></tr>'];
  for (const c of d.chapters) {
    const vs = chapterVerses(c);
    rows.push('<tr class="chap"><td colspan="3">' + esc(c.i) + '. ' + esc(c.ar) +
      (c.en ? ' — ' + esc(c.en) : '') + (c.tr ? ' <span style="font-weight:400;color:#7a6a6b">(' + esc(c.tr) + ')</span>' : '') +
      ' · ' + vs.length + '</td></tr>');
    for (const v of vs) {
      rows.push('<tr><td class="n">' + esc(v.n) + '</td><td class="ar">' + esc(v.sadr) +
        ' <span style="color:#c0973c">۞</span> ' + esc(v.ajuz) + '</td><td class="tr">' +
        (v.tr ? esc(v.tr) : '<em>— none —</em>') + '</td></tr>');
    }
  }
  $('tbl').innerHTML = rows.join('');

  $('preview').classList.remove('hidden');
  storeBtn.disabled = info.fatal;
  replaceBtn.classList.add('hidden');
  setMsg('saveMsg', '', '');
}

function setMsg(id: string, kind: '' | 'ok' | 'err' | 'warn', text: string): void {
  const m = $(id);
  m.className = 'msg' + (kind ? ' ' + kind : '');
  m.textContent = text;
}

// ---------- file handling ----------
let lines: string[] | null = null;   // the file's text, kept so a settings change need not re-unzip
/* A .json is a finished document — the seed a previous import produced, or a
   copy pulled back out of storage. There is nothing to read out of it, so it
   skips the parser entirely and the reading settings are switched off: they
   describe how to find abyāt in a Word file and have no bearing here. It is
   stored exactly as it is, edition wording (`variants`) included. */
let preset: PoemDoc | null = null;

function rebuild(): void {
  let d: PoemDoc;
  /* A document that names no matn is stored as the one picked above (the
     picker stays switched on for it) — otherwise it would have nowhere to go. */
  if (preset) d = preset.id ? preset : { ...preset, id: poemSel.value };
  else { if (!lines) return; d = build(lines, poemSel.value, sepInput.value || ' ... '); }
  const info = inspect(d);
  doc = d; fatal = info.fatal;
  setMsg('parseMsg', info.fatal ? 'err' : 'ok', info.fatal
    ? 'Read the file, but something is off — see below.'
    : 'Read the file. Check the preview, then store it.');
  render(d, info);
}

function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function handle(file: File | undefined): void {
  if (!file) return;
  setMsg('parseMsg', '', 'Reading ' + file.name + '…');
  $('preview').classList.add('hidden');
  doc = null; lines = null; preset = null; fatal = true;
  poemSel.disabled = false; sepInput.disabled = false;

  if (/\.json$/i.test(file.name) || file.type === 'application/json') {
    file.text().then((t) => {
      const parsed: unknown = JSON.parse(t);
      const d = isObject(parsed) && isObject(parsed.doc) ? parsed.doc : parsed;   // {doc:…} or a bare document
      if (!isObject(d) || !Array.isArray(d.chapters) || !d.chapters.length)
        throw new Error('That JSON has no "chapters" array — it does not look like a stored matn.');
      if (d.id) {
        if (typeof d.id !== 'string' || !getPoem(d.id))
          throw new Error('This document is for "' + String(d.id) + '", which is not a matn this app knows.');
        poemSel.value = d.id;
        poemSel.disabled = true;
      }
      sepInput.disabled = true;
      preset = d as unknown as PoemDoc;
      $('dzTitle').textContent = file.name;
      $('dzSub').textContent = 'A finished document — stored exactly as it is. Drop another file to start over.';
      rebuild();
    }).catch((e: unknown) => {
      setMsg('parseMsg', 'err', (e instanceof Error && e.message) || 'Could not read that JSON.');
    });
    return;
  }

  file.arrayBuffer()
    .then(readDocumentXml)
    .then((xml) => {
      const ls = xmlLines(xml);
      if (!ls.length) throw new Error('No text found in the document.');
      lines = ls;
      $('dzTitle').textContent = file.name;
      $('dzSub').textContent = ls.length + ' lines read — drop another file to start over.';
      rebuild();
    })
    .catch((e: unknown) => {
      setMsg('parseMsg', 'err', (e instanceof Error && e.message) || 'Could not read that file.');
    });
}
fileInput.addEventListener('change', () => handle(fileInput.files?.[0]));
for (const ev of ['dragenter', 'dragover']) {
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
}
for (const ev of ['dragleave', 'drop']) {
  dropzone.addEventListener(ev, () => dropzone.classList.remove('drag'));
}
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  if (fileInput.disabled) return;
  const f = e.dataTransfer?.files?.[0];
  if (f) handle(f);
});
/* Re-read whenever a setting changes, so the preview always matches the
   fields above it. The separator listens on `input`, not `change`: `change`
   on a text box only fires on blur, so a separator typed and then committed
   by clicking Store would have uploaded the previous parse. `save` flushes a
   pending re-read for the same reason. */
let reparse: ReturnType<typeof setTimeout> | null = null;
sepInput.addEventListener('input', () => {
  if (reparse) clearTimeout(reparse);
  reparse = setTimeout(() => { reparse = null; rebuild(); }, 150);
});
poemSel.addEventListener('change', rebuild);

// ---------- store ----------
async function save(overwrite: boolean): Promise<void> {
  /* Flush a pending re-read first, then judge THAT parse — the disabled
     state of the button is a hint to the eye, not the gate. Without this a
     click landing in the debounce window would upload the previous parse. */
  if (reparse) { clearTimeout(reparse); reparse = null; rebuild(); }
  if (!doc || fatal) return;
  const btn = overwrite ? replaceBtn : storeBtn;
  btn.disabled = true;
  setMsg('saveMsg', '', 'Storing…');
  try {
    const res = await putPoemDocument(pw, doc.id, doc, overwrite);
    setMsg('saveMsg', 'ok', (res.created ? 'Stored' : 'Replaced') + ' — ' + res.poem +
      ' version ' + res.version + ', ' + res.verses + ' abyāt in ' + res.chapters + ' chapters.\n' +
      'It is live now. Installed apps pick it up when they are next opened.');
    replaceBtn.classList.add('hidden');
  } catch (e) {
    if (!(e instanceof ApiError)) {
      setMsg('saveMsg', 'err', 'Could not reach the server — check your connection.');
    } else if (e.status === 409) {
      setMsg('saveMsg', 'err', e.message + '\nStoring again will keep a backup of the version being replaced.');
      replaceBtn.classList.remove('hidden');
    } else if (e.status === 422 && e.problems.length) {
      const count = Number(e.body?.problemCount) || 0;
      setMsg('saveMsg', 'err', 'The API refused it:\n· ' + e.problems.join('\n· ') +
        (count > e.problems.length ? '\n…and ' + (count - e.problems.length) + ' more.' : ''));
    } else {
      setMsg('saveMsg', 'err', typeof e.body?.error === 'string' ? e.message : 'Failed (' + e.status + ').');
    }
  } finally {
    btn.disabled = false;
  }
}
storeBtn.addEventListener('click', () => { void save(false); });
replaceBtn.addEventListener('click', () => { void save(true); });

// keep a copy on disk — the same shape as the dev fixture's document in fixtures/
$('dl').addEventListener('click', () => {
  if (!doc) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
  a.download = doc.id + '-seed.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
