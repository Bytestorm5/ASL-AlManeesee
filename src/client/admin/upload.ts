/* Reciter Upload (/admin/upload): upload or record a recitation for a single
   bayt of one recording set (a matn, or one edition of it). The reciter and
   the set are remembered on this device (asl-reciter-id, asl-reciter-poem),
   and the bayt is suggested: the first one this reciter has not recorded yet.

   Runs as the page's module script. */
import { ALL_AUDIO_SETS, getAudioSet } from '../../poems/index.ts';
import { MAX_UPLOAD_BYTES, extOk } from '../../shared/media.ts';
import { PASSWORD_HEADER, getReciters, nextRecording, recordingUploadUrl } from '../api.ts';
import { esc, lsGet, lsSet } from '../page.ts';
import { signIn, storedPassword } from './auth.ts';

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from the page`);
  return el as T;
}
const pwInput = $<HTMLInputElement>('pw');
const unlockBtn = $<HTMLButtonElement>('unlock');
const reciterSel = $<HTMLSelectElement>('reciter');
const poemSel = $<HTMLSelectElement>('poem');
const baytInput = $<HTMLInputElement>('bayt');
const fileInput = $<HTMLInputElement>('file');
const dropzone = $('dropzone');
const recBtn = $<HTMLButtonElement>('recBtn');
const sendBtn = $<HTMLButtonElement>('send');
const previewEl = $<HTMLAudioElement>('preview');

interface Take { blob: Blob; ext: string; mime: string }
let pw = '';
let chosen: Take | null = null;
let mediaRec: MediaRecorder | null = null, recChunks: Blob[] = [];
let recTimerIv: ReturnType<typeof setInterval> | undefined, recStart = 0;
let audioCtx: AudioContext | null = null, meterRAF = 0;

/** Highest bayt of a recording set — the matn's verse count, from the registry. */
function maxBayt(set: string): number {
  return getAudioSet(set)?.poem.verses ?? 0;
}

/* The recording sets come from the registry: one per matn, or one per edition
   for a matn with several. */
for (const s of ALL_AUDIO_SETS) {
  const o = document.createElement('option');
  o.value = s.id; o.textContent = s.label;
  poemSel.appendChild(o);
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
        $('form').classList.remove('hidden');
        void loadReciters().then(fetchNextBayt);
      } else {
        $('gateMsg').textContent = 'Wrong password.';
        $('gateMsg').className = 'msg err';
      }
    })
    .catch(() => {
      $('gateMsg').textContent = 'Could not reach the server — check your connection.';
      $('gateMsg').className = 'msg err';
    })
    .finally(() => { unlockBtn.disabled = false; });
}
unlockBtn.addEventListener('click', tryUnlock);
pwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
const saved = storedPassword();
if (saved) { pwInput.value = saved; tryUnlock(); }

// ---------- reciter list (from the registry in storage, edited in the Recitation Manager) ----------
function loadReciters(): Promise<void> {
  return getReciters(pw)
    .then((j) => {
      const recs = j.reciters || [];
      reciterSel.innerHTML = recs.map((r) => '<option value="' + esc(r.id) + '">' + esc(r.name || r.id) + '</option>').join('')
        || '<option value="">(no reciters — add one in “manage list”)</option>';
      const pref = lsGet('asl-reciter-id') || '';
      if (pref && recs.some((r) => r.id === pref)) reciterSel.value = pref;
      refreshSend();
    })
    .catch(() => { /* the select stays empty; Upload stays disabled */ });
}
// Reciter is intentionally NOT reset after an upload — one voice usually does
// a whole run of bayts. Persist the choice across sessions too.
reciterSel.addEventListener('change', () => {
  lsSet('asl-reciter-id', reciterSel.value);
  fetchNextBayt();
});

// ---------- poem / bayt ----------
const savedPoem = lsGet('asl-reciter-poem');
if (savedPoem && getAudioSet(savedPoem)) poemSel.value = savedPoem;
function baytHint(extra?: string): void {
  if (!poemSel.value) {
    $('baytHint').textContent = 'No matn is registered yet — add one in src/poems/registry.ts first.';
    return;
  }
  const max = maxBayt(poemSel.value);
  baytInput.max = String(max);
  $('baytHint').textContent = '1–' + max + ' for this matn.' + (extra ? ' ' + extra : '');
}
let nextSeq = 0;
function fetchNextBayt(): void {
  if (!pw || !poemSel.value) return;
  const seq = ++nextSeq, set = poemSel.value, reciter = reciterSel.value;
  baytHint('Checking for the next bayt…');
  nextRecording(pw, set, reciter)
    .then((j) => {
      if (seq !== nextSeq || poemSel.value !== set || reciterSel.value !== reciter) return;
      if (j && j.next) {
        baytInput.value = String(j.next);
        baytHint('Auto-filled with bayt ' + j.next + ' — the next one this reciter hasn’t recorded.');
      } else { baytHint(); }
      refreshSend();
    })
    .catch(() => { if (seq === nextSeq) baytHint(); });
}
poemSel.addEventListener('change', () => {
  lsSet('asl-reciter-poem', poemSel.value);
  baytHint(); fetchNextBayt();
});
baytInput.addEventListener('input', refreshSend);
baytHint();

function refreshSend(): void {
  const n = parseInt(baytInput.value, 10);
  sendBtn.disabled = !(chosen && reciterSel.value && n >= 1 && n <= maxBayt(poemSel.value));
}

function setChosen(c: Take | null): void {
  chosen = c;
  if (previewEl.src.startsWith('blob:')) URL.revokeObjectURL(previewEl.src);
  if (c) { previewEl.src = URL.createObjectURL(c.blob); previewEl.classList.remove('hidden'); }
  else { previewEl.removeAttribute('src'); previewEl.classList.add('hidden'); }
  refreshSend();
}

// ---------- source tabs ----------
function showPane(which: 'file' | 'rec'): void {
  $('tabFile').classList.toggle('active', which === 'file');
  $('tabRec').classList.toggle('active', which === 'rec');
  $('paneFile').classList.toggle('hidden', which !== 'file');
  $('paneRec').classList.toggle('hidden', which !== 'rec');
}
$('tabFile').addEventListener('click', () => showPane('file'));
$('tabRec').addEventListener('click', () => showPane('rec'));

// ---------- file upload ----------
// Formats the app accepts (and browsers can play back), with aliases, are
// extOk() in src/shared/media.ts — the same table the server checks against.
// Audacity exports audio-only .mp4 — accepted and treated as audio.
const MIME_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav',
  'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/opus': 'opus', 'audio/webm': 'webm', 'audio/flac': 'flac',
};
function showFormatModal(name: string): void {
  $('fmodalName').textContent = name;
  $('fmodal').classList.add('show');
}
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement | null;
  if (t && (t.id === 'fmodalOk' || t.id === 'fmodal')) $('fmodal').classList.remove('show');
});
function clearFile(): void { fileInput.value = ''; setChosen(null); $('dzFile').textContent = ''; }
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (!f) { setChosen(null); $('dzFile').textContent = ''; return; }
  if (f.size > MAX_UPLOAD_BYTES) { showMsg('err', 'That file is over 25 MB.'); clearFile(); return; }
  const rawExt = (f.name.split('.').pop() || '').toLowerCase();
  let ext = extOk(rawExt);
  let mime = f.type || '';
  if (!ext && /^audio\//.test(mime)) ext = MIME_EXT[mime.split(';')[0]!] ?? null;
  if (!ext) {
    showFormatModal(f.name);
    clearFile();
    return;
  }
  // OSes report .mp4 as video/* — it is audio to us either way
  if (!mime || /^video\//.test(mime)) mime = ext === 'mp4' || ext === 'm4a' ? 'audio/mp4' : 'application/octet-stream';
  setChosen({ blob: f, ext, mime });
  $('dzFile').textContent = '✓ ' + f.name;
  showMsg('', '');
});
// drag highlight (the drop itself lands on the file input covering the zone)
for (const ev of ['dragenter', 'dragover']) {
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
}
for (const ev of ['dragleave', 'drop']) {
  dropzone.addEventListener(ev, () => dropzone.classList.remove('drag'));
}

// ---------- recording + live level meter ----------
function pickMime(): string | null {
  const l = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of l) if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}
function extFor(mime: string): string {
  if (/mp4/.test(mime)) return 'm4a';
  if (/webm/.test(mime)) return 'webm';
  if (/ogg/.test(mime)) return 'ogg';
  return 'bin';
}
function startMeter(stream: MediaStream): void {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    audioCtx = ctx;
    if (ctx.state === 'suspended') void ctx.resume();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser(); an.fftSize = 512;
    src.connect(an);
    const data = new Uint8Array(an.fftSize);
    const tick = () => {
      an.getByteTimeDomainData(data);
      let sum = 0;
      for (const d of data) { const v = (d - 128) / 128; sum += v * v; }
      const pct = Math.min(100, Math.round(Math.sqrt(sum / data.length) * 190));
      $('meterBar').style.width = pct + '%';
      meterRAF = requestAnimationFrame(tick);
    };
    tick();
  } catch { /* no meter — recording still works */ }
}
function stopMeter(): void {
  if (meterRAF) { cancelAnimationFrame(meterRAF); meterRAF = 0; }
  $('meterBar').style.width = '0%';
  if (audioCtx) { try { void audioCtx.close(); } catch { /* ignore */ } audioCtx = null; }
}
recBtn.addEventListener('click', () => {
  if (mediaRec && mediaRec.state === 'recording') { mediaRec.stop(); return; }
  const mime = pickMime();
  if (mime === null || !navigator.mediaDevices?.getUserMedia) { showMsg('err', 'Recording is not supported in this browser — upload a file instead.'); return; }
  navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    recChunks = [];
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    mediaRec = rec;
    const usedMime = rec.mimeType || mime || 'audio/webm';
    rec.addEventListener('dataavailable', (e) => { if (e.data && e.data.size) recChunks.push(e.data); });
    rec.addEventListener('stop', () => {
      for (const t of stream.getTracks()) t.stop();
      stopMeter();
      clearInterval(recTimerIv); $('recTimer').textContent = '';
      recBtn.classList.remove('recording'); recBtn.textContent = '● Record again';
      const blob = new Blob(recChunks, { type: usedMime });
      if (!blob.size) { showMsg('err', 'Nothing was recorded — try again.'); return; }
      setChosen({ blob, ext: extFor(usedMime), mime: usedMime });
      showMsg('', '');
    });
    rec.start();
    startMeter(stream);
    recStart = Date.now();
    recBtn.classList.add('recording'); recBtn.textContent = '■ Stop';
    recTimerIv = setInterval(() => {
      const s = Math.floor((Date.now() - recStart) / 1000);
      $('recTimer').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }, 250);
  }).catch(() => {
    showMsg('err', 'Microphone access was blocked — allow it in your browser settings, or upload a file.');
  });
});

// ---------- submit ----------
/** `html` is trusted markup built here; anything from the server is escaped first. */
function showMsg(kind: '' | 'ok' | 'err', html: string): void {
  const m = $('msg'); m.className = 'msg' + (kind ? ' ' + kind : ''); m.innerHTML = html;
}
let uploading = false;
function setBusy(on: boolean): void {
  uploading = on;
  for (const id of ['send', 'recBtn', 'file', 'poem', 'bayt', 'reciter']) {
    const el = document.getElementById(id) as HTMLButtonElement | HTMLInputElement | HTMLSelectElement | null;
    if (el) el.disabled = on;
  }
  if (!on) refreshSend();
}
function setProgress(pct: number | null): void {
  $('progress').classList.toggle('hidden', pct === null);
  $('progressBar').style.width = (pct ?? 0) + '%';
}
// leaving mid-upload is how takes get silently lost — warn first
window.addEventListener('beforeunload', (e) => {
  if (uploading) { e.preventDefault(); e.returnValue = 'An upload is still in progress.'; }
});
function logSession(ok: boolean, set: string, bayt: number, note?: string): void {
  $('sessionLog').classList.remove('hidden');
  const li = document.createElement('li');
  li.style.cssText = 'padding:3px 0;color:' + (ok ? 'var(--ok,#2f6b46)' : '#8a2a2a');
  li.textContent = (ok ? '✓ ' : '✗ ') + set + ' · bayt ' + bayt + (note ? ' — ' + note : '');
  const list = $('sessionList');
  list.insertBefore(li, list.firstChild);
}

interface UploadReply { ok?: boolean; key?: string; url?: string; size?: number; error?: string }
/* XHR rather than fetch: it is the only way to see how much of the body has
   been sent, which is worth showing for a 20 MB take on a phone connection. */
function sendTake(url: string, take: Take, onProgress: (pct: number) => void): Promise<{ ok: boolean; j: UploadReply | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.setRequestHeader(PASSWORD_HEADER, pw);
    xhr.upload.addEventListener('progress', (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); });
    xhr.addEventListener('load', () => {
      let j: UploadReply | null = null;
      try { j = JSON.parse(xhr.responseText) as UploadReply; } catch { /* not JSON */ }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, j });
    });
    xhr.addEventListener('error', () => reject(new Error('network')));
    xhr.addEventListener('abort', () => reject(new Error('aborted')));
    xhr.send(take.blob);
  });
}

sendBtn.addEventListener('click', () => {
  if (!chosen || uploading) return;
  // snapshot everything about this take now — a new recording started later
  // must not be able to touch this upload or its result message
  const take = chosen;
  const set = poemSel.value, bayt = parseInt(baytInput.value, 10), reciter = reciterSel.value;
  if (!reciter) { showMsg('err', 'Pick a reciter first.'); return; }
  lsSet('asl-reciter-poem', set); lsSet('asl-reciter-id', reciter);
  setBusy(true);
  setProgress(0);
  showMsg('ok', 'Uploading bayt ' + bayt + '… keep this page open.');
  sendTake(recordingUploadUrl(set, bayt, reciter, take.ext, take.mime), take, (pct) => {
    setProgress(pct);
    showMsg('ok', 'Uploading bayt ' + bayt + '… ' + pct + '% — keep this page open.');
  })
    .then((res) => {
      setBusy(false);
      setProgress(null);
      const stored = res.ok && res.j?.size === take.blob.size;
      const kb = Math.round(take.blob.size / 1024);
      if (stored) {
        showMsg('ok', 'Bayt ' + bayt + ' uploaded and verified (' + kb + ' KB), jazākum Allāhu khayran!<br><span class="done-path">' +
          esc(res.j?.key || '') + '</span><br>Ready for the next bayt — reciter kept.');
        logSession(true, set, bayt, kb + ' KB');
        // keep reciter + poem; clear only the per-bayt bits, then advance
        clearFile();
        recBtn.textContent = '● Start recording';
        fetchNextBayt();
      } else if (res.ok) {
        // stored size differs from what we sent — treat as failed
        showMsg('err', 'Upload arrived incomplete — please send bayt ' + bayt + ' again.');
        logSession(false, set, bayt, 'incomplete');
      } else {
        const err = res.j?.error;
        showMsg('err', err ? esc(err) : 'Upload failed — try again.');
        logSession(false, set, bayt, err || 'failed');
      }
    })
    .catch(() => {
      setBusy(false);
      setProgress(null);
      showMsg('err', 'Upload of bayt ' + bayt + ' failed — check your connection and try again.');
      logSession(false, set, bayt, 'network error');
    });
});
