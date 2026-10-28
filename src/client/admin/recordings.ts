/* Recitation Manager (/admin/recordings): browse, listen to and delete
   uploaded recordings, manage the reciter list, and bulk-upload a ZIP of one
   reciter's abyāt. Runs as the page's module script.

   Recordings live in R2 under mutun/<set>/<bayt>/<reciter>/<timestamp>.<ext>
   (src/shared/media.ts); they are listed, played (/media/…) and deleted by
   their R2 key. */
import { ALL_AUDIO_SETS } from '../../poems/index.ts';
import type { Reciter } from '../../poems/types.ts';
import { AUDIO_MIME, RECORDINGS_PREFIX, extOk, parseRecordingKey, slug } from '../../shared/media.ts';
import {
  ApiError, PASSWORD_HEADER, deleteFiles, getReciters, listFiles, recordingUploadUrl, saveReciters,
  type StoredFile,
} from '../api.ts';
import { esc } from '../page.ts';
import { signIn, storedPassword } from './auth.ts';

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from the page`);
  return el as T;
}
const all = <T extends Element = HTMLElement>(root: ParentNode, sel: string): T[] => Array.from(root.querySelectorAll<T>(sel));

const pwInput = $<HTMLInputElement>('pw');
const unlockBtn = $<HTMLButtonElement>('unlock');
const poemSel = $<HTMLSelectElement>('poem');
const baytInput = $<HTMLInputElement>('bayt');
const loadBtn = $<HTMLButtonElement>('load');
const recList = $('recList');
const recSelAll = $<HTMLInputElement>('recSelAll');
const recDelSel = $<HTMLButtonElement>('recDelSel');
const reciList = $('reciList');
const bulkPoem = $<HTMLSelectElement>('bulkPoem');
const bulkReciter = $<HTMLSelectElement>('bulkReciter');
const bulkZip = $<HTMLInputElement>('bulkZip');
const bulkUpload = $<HTMLButtonElement>('bulkUpload');

let pw = '';
let reciterNames: Record<string, string> = {};   // id -> display name, for labelling recordings

function fmtSize(n: number): string { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB'; }
function fmtWhen(s: string): string { try { return new Date(s).toLocaleString(); } catch { return s || ''; } }
function errText(e: unknown, fallback: string): string {
  return e instanceof ApiError && typeof e.body?.error === 'string' ? e.message : fallback;
}
type MsgKind = '' | 'ok' | 'err';
function showMsg(id: string, k: MsgKind, t: string): void { const m = $(id); m.className = 'msg' + (k ? ' ' + k : ''); m.textContent = t; }

/* The recording sets come from the registry: one per matn, or one per edition
   for a matn with several (labelled "<matn> — <edition>"). */
for (const sel of [poemSel, bulkPoem]) {
  for (const s of ALL_AUDIO_SETS) {
    const o = document.createElement('option');
    o.value = s.id; o.textContent = s.label;
    sel.appendChild(o);
  }
}
const NO_SETS = '<div class="empty">No matn is registered yet, so there is nothing to record — add one in <code>src/poems/registry.ts</code> first.</div>';
if (!ALL_AUDIO_SETS.length) { loadBtn.disabled = true; poemSel.disabled = true; bulkPoem.disabled = true; bulkZip.disabled = true; }

// ---------- gate ----------
function unlock(): void {
  const v = pwInput.value; if (!v) return;
  unlockBtn.disabled = true;
  signIn(v)
    .then((ok) => {
      if (ok) {
        pw = v;
        $('gate').classList.add('hidden'); $('app').classList.remove('hidden');
        void loadReciters().then(loadRecordings);
      } else showMsg('gateMsg', 'err', 'Wrong password.');
    })
    .catch(() => showMsg('gateMsg', 'err', 'Could not reach the server.'))
    .finally(() => { unlockBtn.disabled = false; });
}
unlockBtn.addEventListener('click', unlock);
pwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') unlock(); });
const saved = storedPassword();
if (saved) { pwInput.value = saved; unlock(); }

// ---------- tabs ----------
type Tab = 'rec' | 'reci' | 'bulk';
$('tabRec').addEventListener('click', () => swap('rec'));
$('tabReci').addEventListener('click', () => swap('reci'));
$('tabBulk').addEventListener('click', () => swap('bulk'));
function swap(w: Tab): void {
  $('tabRec').classList.toggle('active', w === 'rec');
  $('tabReci').classList.toggle('active', w === 'reci');
  $('tabBulk').classList.toggle('active', w === 'bulk');
  $('secRec').classList.toggle('hidden', w !== 'rec');
  $('secReci').classList.toggle('hidden', w !== 'reci');
  $('secBulk').classList.toggle('hidden', w !== 'bulk');
}

// ---------- recordings ----------
loadBtn.addEventListener('click', loadRecordings);
poemSel.addEventListener('change', loadRecordings);
function loadRecordings(): void {
  $('recBulkBar').classList.add('hidden');
  showMsg('recMsg', '', '');
  if (!poemSel.value) { recList.innerHTML = NO_SETS; return; }
  const bayt = (baytInput.value || '').trim();
  const prefix = RECORDINGS_PREFIX + poemSel.value + '/' + (bayt ? bayt + '/' : '');
  recList.innerHTML = '<div class="empty">Loading…</div>';
  listFiles(pw, prefix)
    .then((j) => renderRecordings(j.files || []))
    .catch((e: unknown) => { showMsg('recMsg', 'err', errText(e, 'Could not load.')); recList.innerHTML = ''; });
}
function renderRecordings(files: StoredFile[]): void {
  if (!files.length) { recList.innerHTML = '<div class="empty">No recordings here yet.</div>'; $('recBulkBar').classList.add('hidden'); return; }
  // group by bayt
  const byBayt: Record<string, { f: StoredFile; reciter: string }[]> = {};
  for (const f of files) {
    const p = parseRecordingKey(f.key);
    const bayt = p ? String(p.bayt) : '?', reciter = p ? p.reciter : '?';
    (byBayt[bayt] ??= []).push({ f, reciter });
  }
  const bayts = Object.keys(byBayt).sort((a, b) => Number(a) - Number(b));
  recList.innerHTML = bayts.map((bayt) => {
    const rows = (byBayt[bayt] ?? []).map(({ f, reciter }) => {
      const name = reciterNames[reciter] || reciter;
      return '<div class="rec">' +
        '<input type="checkbox" class="chk rec-chk" data-key="' + esc(f.key) + '">' +
        '<span class="who">' + esc(name) + '</span>' +
        '<audio controls preload="none" src="' + esc(f.url) + '"></audio>' +
        '<span class="meta">' + fmtSize(f.size) + ' · ' + esc(fmtWhen(f.uploadedAt)) + '</span>' +
        '<button class="btn-del" data-key="' + esc(f.key) + '" data-name="bayt ' + esc(bayt) + ' — ' + esc(name) + '">Delete</button>' +
        '</div>';
    }).join('');
    return '<div class="grp"><h3>Bayt ' + esc(bayt) + '</h3>' + rows + '</div>';
  }).join('');
  for (const btn of all<HTMLButtonElement>(recList, '.btn-del')) {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key ?? '';
      if (!confirm('Delete ' + (btn.dataset.name ?? '') + '? This cannot be undone.')) return;
      btn.disabled = true;
      deleteFiles(pw, [key])
        .then(() => { removeRecRows([key]); showMsg('recMsg', 'ok', 'Deleted.'); })
        .catch((e: unknown) => { showMsg('recMsg', 'err', errText(e, 'Delete failed.')); btn.disabled = false; });
    });
  }
  recSelAll.checked = false; recSelAll.indeterminate = false;
  for (const chk of all<HTMLInputElement>(recList, '.rec-chk')) chk.addEventListener('change', updateRecSelState);
  $('recBulkBar').classList.remove('hidden');
  updateRecSelState();
}
// Removes rows for the given keys (after a successful delete) and drops any
// bayt group left empty, then refreshes the select-all / count state.
function removeRecRows(keys: string[]): void {
  const gone = new Set(keys);
  for (const chk of all<HTMLInputElement>(recList, '.rec-chk')) {
    if (gone.has(chk.dataset.key ?? '')) chk.closest('.rec')?.remove();
  }
  for (const grp of all(recList, '.grp')) if (!grp.querySelector('.rec')) grp.remove();
  if (!recList.querySelector('.rec')) { recList.innerHTML = '<div class="empty">No recordings here yet.</div>'; $('recBulkBar').classList.add('hidden'); }
  else updateRecSelState();
}
function updateRecSelState(): void {
  const boxes = all<HTMLInputElement>(recList, '.rec-chk');
  const checked = boxes.filter((c) => c.checked);
  $('recSelCount').textContent = checked.length ? checked.length + ' selected' : '';
  recDelSel.disabled = !checked.length;
  recSelAll.checked = boxes.length > 0 && checked.length === boxes.length;
  recSelAll.indeterminate = checked.length > 0 && checked.length < boxes.length;
}
recSelAll.addEventListener('change', () => {
  const on = recSelAll.checked;
  for (const c of all<HTMLInputElement>(recList, '.rec-chk')) c.checked = on;
  updateRecSelState();
});
recDelSel.addEventListener('click', () => {
  const boxes = all<HTMLInputElement>(recList, '.rec-chk').filter((c) => c.checked);
  if (!boxes.length) return;
  if (!confirm('Delete ' + boxes.length + ' selected recording' + (boxes.length === 1 ? '' : 's') + '? This cannot be undone.')) return;
  const keys = boxes.map((c) => c.dataset.key ?? '');
  recDelSel.disabled = true;
  deleteFiles(pw, keys)
    .then((j) => { removeRecRows(keys); showMsg('recMsg', 'ok', 'Deleted ' + j.deleted + '.'); })
    .catch((e: unknown) => { showMsg('recMsg', 'err', errText(e, 'Delete failed.')); recDelSel.disabled = false; });
});

// ---------- reciters ----------
/* The list starts out empty on a new site; the first reciter is added below
   and saved like any other change. */
function loadReciters(): Promise<void> {
  return getReciters(pw)
    .then((j) => renderReciters(j.reciters || []))
    .catch(() => { /* the list stays as it was; recordings show reciter ids */ });
}
function renderReciters(list: Reciter[]): void {
  reciterNames = {};
  for (const r of list) reciterNames[r.id] = r.name;
  reciList.innerHTML = list.map((r) => reciterRow(r.id, r.name)).join('') ||
    '<div class="empty">No reciters yet — add one below.</div>';
  wireReciterRows();
  const prev = bulkReciter.value;
  bulkReciter.innerHTML = list.length ? list.map((r) => '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>').join('')
    : '<option value="">— add a reciter first —</option>';
  if (list.some((r) => r.id === prev)) bulkReciter.value = prev;
}
function reciterRow(id: string, name: string): string {
  return '<div class="rrow">' +
    '<input class="id" value="' + esc(id) + '" readonly>' +
    '<input class="nm" value="' + esc(name) + '">' +
    '<button class="btn-del rm">Remove</button></div>';
}
function wireReciterRows(): void {
  for (const btn of all(reciList, '.rm')) {
    btn.onclick = () => btn.closest('.rrow')?.remove();
  }
}
$('addReci').addEventListener('click', () => {
  const idInput = $<HTMLInputElement>('newId'), nameInput = $<HTMLInputElement>('newName');
  const id = slug(idInput.value);
  const nm = (nameInput.value || '').trim();
  if (!id) { showMsg('reciMsg', 'err', 'Enter an id.'); return; }
  const exists = all<HTMLInputElement>(reciList, '.rrow .id').some((i) => i.value === id);
  if (exists) { showMsg('reciMsg', 'err', 'That id already exists.'); return; }
  if (reciList.querySelector('.empty')) reciList.innerHTML = '';
  reciList.insertAdjacentHTML('beforeend', reciterRow(id, nm || id));
  wireReciterRows();
  idInput.value = ''; nameInput.value = ''; showMsg('reciMsg', '', '');
});
$('saveReci').addEventListener('click', () => {
  const saveBtn = $<HTMLButtonElement>('saveReci');
  const rows: Reciter[] = all(reciList, '.rrow').map((row) => ({
    id: row.querySelector<HTMLInputElement>('.id')?.value ?? '',
    name: row.querySelector<HTMLInputElement>('.nm')?.value ?? '',
  }));
  if (!rows.length) { showMsg('reciMsg', 'err', 'Add at least one reciter.'); return; }
  saveBtn.disabled = true; showMsg('reciMsg', 'ok', 'Saving…');
  saveReciters(pw, rows)
    .then((j) => { renderReciters(j.reciters); showMsg('reciMsg', 'ok', 'Saved.'); })
    .catch((e: unknown) => showMsg('reciMsg', 'err', errText(e, 'Save failed.')))
    .finally(() => { saveBtn.disabled = false; });
});

// ---------- bulk upload ----------
interface BulkRow { bayt: number; ext: string; name: string; bytes: Uint8Array<ArrayBuffer>; size: number }
interface Skipped { name: string; reason: string }
let bulkEntries: BulkRow[] | null = null;   // matched, ready to upload

// Minimal ZIP reader (central directory + local headers), inflate via the
// browser's native DecompressionStream — no bundler, no external library.
// Doesn't handle ZIP64, which is fine for the file sizes this tool sees.
async function readZipEntries(file: File): Promise<{ name: string; bytes: Uint8Array<ArrayBuffer> }[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  const maxBack = Math.min(buf.length, 65557);
  for (let i = buf.length - 22; i >= buf.length - maxBack && i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid ZIP file');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const central: { name: string; method: number; compSize: number; localOffset: number }[] = [];
  for (let e = 0; e < count; e++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const compSize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const localOffset = dv.getUint32(off + 42, true);
    const name = new TextDecoder('utf-8').decode(buf.subarray(off + 46, off + 46 + nameLen));
    central.push({ name, method, compSize, localOffset });
    off += 46 + nameLen + extraLen + commentLen;
  }
  const out: { name: string; bytes: Uint8Array<ArrayBuffer> }[] = [];
  for (const ent of central) {
    if (/[/\\]$/.test(ent.name)) continue; // directory entry
    const lf = ent.localOffset;
    if (dv.getUint32(lf, true) !== 0x04034b50) continue;
    const lfNameLen = dv.getUint16(lf + 26, true);
    const lfExtraLen = dv.getUint16(lf + 28, true);
    const dataStart = lf + 30 + lfNameLen + lfExtraLen;
    const compData = buf.subarray(dataStart, dataStart + ent.compSize);
    let bytes: Uint8Array<ArrayBuffer>;
    if (ent.method === 0) bytes = compData;
    else if (ent.method === 8) bytes = await inflateRaw(compData);
    else continue; // unsupported compression method
    out.push({ name: ent.name, bytes });
  }
  return out;
}
async function inflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function matchBaytName(rawName: string): { bayt: number; ext: string } | null {
  const base = rawName.split(/[/\\]/).pop() || '';
  const m = /^0*(\d+)\.([A-Za-z0-9]+)$/.exec(base);
  if (!m) return null;
  return { bayt: parseInt(m[1]!, 10), ext: m[2]!.toLowerCase() };
}

bulkZip.addEventListener('change', () => {
  const file = bulkZip.files?.[0];
  bulkUpload.classList.add('hidden');
  bulkEntries = null;
  if (!file) { $('bulkPreview').innerHTML = ''; showMsg('bulkMsg', '', ''); return; }
  $('bulkPreview').innerHTML = '<div class="empty">Reading ZIP…</div>';
  showMsg('bulkMsg', '', '');
  readZipEntries(file).then((files) => {
    const matched: BulkRow[] = [], skipped: Skipped[] = [];
    const byBayt: Record<number, string[]> = {};
    for (const f of files) {
      const m = matchBaytName(f.name);
      if (!m) { skipped.push({ name: f.name, reason: "doesn't match a bayt number" }); continue; }
      matched.push({ bayt: m.bayt, ext: m.ext, name: f.name, bytes: f.bytes, size: f.bytes.length });
      (byBayt[m.bayt] ??= []).push(f.name);
    }
    matched.sort((a, b) => a.bayt - b.bayt);
    bulkEntries = matched;
    const dupes = Object.keys(byBayt).filter((b) => (byBayt[Number(b)]?.length ?? 0) > 1);
    renderBulkPreview(matched, skipped, dupes);
    if (matched.length) bulkUpload.classList.remove('hidden');
  }).catch((err: unknown) => {
    $('bulkPreview').innerHTML = '';
    showMsg('bulkMsg', 'err', 'Could not read that ZIP: ' + (err instanceof Error ? err.message : String(err)));
  });
});

function renderBulkPreview(matched: BulkRow[], skipped: Skipped[], dupes: string[]): void {
  let html = '<div class="bsum">' + matched.length + ' file' + (matched.length === 1 ? '' : 's') + ' matched' +
    (skipped.length ? ', ' + skipped.length + ' skipped' : '') + '.</div>';
  if (dupes.length) {
    html += '<div class="msg err" style="display:block">More than one file matches bayt ' + esc(dupes.join(', ')) +
      ' — all of them will be uploaded as separate recordings for that bayt.</div>';
  }
  html += matched.map((row) =>
    '<div class="brow" data-bayt="' + row.bayt + '" data-name="' + esc(row.name) + '">' +
      '<span class="bayt">Bayt ' + row.bayt + '</span>' +
      '<span class="fname" title="' + esc(row.name) + '">' + esc(row.name) + '</span>' +
      '<span class="fsize">' + fmtSize(row.size) + '</span>' +
      '<span class="bstat" data-s="pending">Pending</span></div>').join('');
  if (skipped.length) {
    html += '<details class="bskipped"><summary>' + skipped.length + ' skipped file' + (skipped.length === 1 ? '' : 's') + '</summary>' +
      skipped.map((s) =>
        '<div class="brow bskip"><span class="bayt">—</span>' +
        '<span class="fname" title="' + esc(s.name) + '">' + esc(s.name) + '</span>' +
        '<span class="fsize"></span><span class="bstat">' + esc(s.reason) + '</span></div>').join('') +
      '</details>';
  }
  $('bulkPreview').innerHTML = html;
}

bulkUpload.addEventListener('click', () => {
  const entries = bulkEntries;
  if (!entries || !entries.length) return;
  const set = bulkPoem.value, reciter = bulkReciter.value;
  if (!set) { showMsg('bulkMsg', 'err', 'No matn is registered yet.'); return; }
  if (!reciter) { showMsg('bulkMsg', 'err', 'Add and pick a reciter first.'); return; }
  bulkUpload.disabled = true; bulkZip.disabled = true;
  showMsg('bulkMsg', 'ok', 'Uploading…');
  const rows: Record<string, HTMLElement> = {}; // zip entry name -> its row element (names are unique — full in-zip paths)
  for (const el of all($('bulkPreview'), '.brow[data-name]')) rows[el.dataset.name ?? ''] = el;
  function setStatus(row: BulkRow, s: string, text: string): void {
    const stat = rows[row.name]?.querySelector('.bstat');
    if (!stat) return;
    stat.setAttribute('data-s', s); stat.textContent = text;
  }
  const queue = entries.slice();
  let ok = 0, fail = 0;
  const CONCURRENCY = 3;
  async function next(): Promise<void> {
    const row = queue.shift();
    if (!row) return;
    setStatus(row, 'up', 'Uploading…');
    // the server normalises the extension; send the matching type with it
    const mime = AUDIO_MIME[extOk(row.ext) ?? ''] ?? 'application/octet-stream';
    try {
      const r = await fetch(recordingUploadUrl(set, row.bayt, reciter, row.ext, mime), {
        method: 'POST', headers: { [PASSWORD_HEADER]: pw }, body: row.bytes,
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (r.ok && j?.ok) { ok++; setStatus(row, 'ok', 'Uploaded'); }
      else { fail++; setStatus(row, 'err', j?.error || 'Failed'); }
    } catch {
      fail++; setStatus(row, 'err', 'Failed');
    }
    return next();
  }
  void Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, () => next())).then(() => {
    showMsg('bulkMsg', fail ? 'err' : 'ok', ok + ' uploaded' + (fail ? ', ' + fail + ' failed.' : '.'));
    bulkUpload.disabled = false; bulkZip.disabled = false;
    if (!$('secRec').classList.contains('hidden')) loadRecordings();
  });
});
