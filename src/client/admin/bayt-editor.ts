/* The Bayt Editor (/admin/editor): edit one bayt at a time — its hemistichs,
   the word cells the reading page renders them from, the word meanings and
   the translations — with a Word-style toolbar for colours, ḥarakāt, small
   (ṣaghīra) letters and above-word rumūz. Save publishes straight to the live
   app through PUT /api/poems/<id> (saveBayts), against the version that was
   loaded, so nobody's edit is ever silently overwritten.

   Runs as the page's module script, so it does its wiring at import time. */
import { ALL_POEMS, getPoem, isPoemId } from '../../poems/index.ts';
import type { Verse, WordCell } from '../../poems/types.ts';
import { pageTitle } from '../../config/site.ts';
import { ALLOWED_CLASSES, COLOR_CLASSES, validateBayt, versesOf } from '../../shared/poem-data.ts';
import { ApiError, getPoemDoc, saveBayts } from '../api.ts';
import { hemiHTML } from '../reading/render.ts';
import { signIn, storedPassword } from './auth.ts';

function $<T extends HTMLElement = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`${sel} is missing from the page`);
  return el;
}

type Hemi = 'sadr' | 'ajuz';
const HEMIS: readonly Hemi[] = ['sadr', 'ajuz'];

/** One word cell as the editor holds it. Only `w` and `g` are edited here; the
    Urdu meaning (`gu`) and a variant-reading footnote (`fn`) ride along
    untouched, so saving a bayt can never strip them. */
interface ECell { w: string; g?: string | undefined; gu?: string | undefined; fn?: string | undefined }

/** The bayt on screen — a deep copy of the stored one. */
interface EditState {
  n: number;
  cells: Record<Hemi, ECell[]>;
  hasCells: Record<Hemi, boolean>;
  tr: string;
  ur: string;
  /** Baseline for autoStage(): the entry as it was when the bayt was opened. */
  _snapshot?: string;
}

/** What is sent for one bayt (the merge route's shape). */
interface Entry { n: number; sadr: string; ajuz: string; tr: string; sadrW?: WordCell[]; ajuzW?: WordCell[]; ur?: string }

main();

function main(): void {
  /* No matn registered: the page says so in place of the editor (built in
     the .astro), and there is nothing here to wire. */
  if (!ALL_POEMS.length) return;

  /* Which matn is being edited. Comes from ?poem= so a link can point straight
     at one, and is switchable from the picker. A matn may have no word cells
     and no translations at all, and some of a matn's verses may have no cells
     while the rest do, so the editor adapts per verse rather than assuming one
     shape. */
  const poemFromUrl = (): string => {
    const p = new URLSearchParams(location.search).get('poem');
    return isPoemId(p) ? p : ALL_POEMS[0]!.id;
  };
  const nameOf = (id: string): string => getPoem(id)?.shortEn ?? id;

  let POEM = poemFromUrl();
  let HAS_URDU = false;                        // matn carries an Urdu translation
  let BYNUM = new Map<number, Verse>();        // n -> bayt (as stored)
  const PATCH = new Map<number, Entry>();      // n -> full staged bayt {n,sadr,ajuz,sadrW,ajuzW,tr}
  let PW = '';                                 // kept after unlock so saving can authenticate
  let POEM_VERSION: number | null = null;      // version of the document loaded from storage
  const VERSION_SEEN = new Map<string, number>(); // poem id -> highest version seen for THAT matn
  /** 'store' → saving enabled | 'missing' → registered but never imported | 'none' → unreachable */
  let SOURCE: 'store' | 'missing' | 'none' = 'none';

  const poemSel = $<HTMLSelectElement>('#poemSel');
  const inum = $<HTMLInputElement>('#inum');
  const trBox = $<HTMLTextAreaElement>('#trBox');
  const urBox = $<HTMLTextAreaElement>('#urBox');

  /* The picker lists every registered matn, drafts too (they are proofed here
     before they are listed for readers). */
  for (const p of ALL_POEMS) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.shortEn + (p.draft ? ' (draft)' : '');
    poemSel.appendChild(o);
  }

  function showSource(): void {
    const el = $('#srcNote');
    const name = nameOf(POEM);
    el.textContent = SOURCE === 'store'
      ? `Editing the live ${name} copy (v${POEM_VERSION}) — Save publishes straight to the app.`
      : SOURCE === 'missing'
        ? `${name} is registered but its text has not been imported yet. Import it at /admin/import first — until then there is nothing to edit.`
        : `${name} could not be loaded from storage. Saving is off — reload once you are online.`;
    el.style.color = SOURCE === 'store' ? 'var(--ok)' : 'var(--warn)';
    syncButtons();
  }

  // ---------- gate ----------
  async function unlock(): Promise<void> {
    const pw = $<HTMLInputElement>('#pw').value;
    const m = $('#gateMsg'); m.className = 'msg'; m.textContent = '';
    try {
      if (!(await signIn(pw))) { m.className = 'msg err'; m.textContent = 'Wrong password.'; return; }
    } catch { m.className = 'msg err'; m.textContent = 'Could not reach the server.'; return; }
    PW = pw;
    $('#gate').classList.add('hidden');
    $('#editor').classList.remove('hidden');
    poemSel.value = POEM;
    await loadCH();
    loadInline(firstBayt());
  }
  $('#unlock').onclick = () => { void unlock(); };
  $('#pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') void unlock(); });

  /* Switching matn reloads everything and drops this matn's edits, so warn first.

     The warning counts what is on screen and unstaged as well, because that is
     work too — and because gating this on PATCH.size alone was carrying it across
     the switch. loadInline() auto-stages whatever is still in EDIT, and the
     switch calls it after POEM and BYNUM are already the new matn's, so a verse
     you had been editing in one matn was staged against the OTHER one under the
     same bayt number. Saving then either met "sadr no longer matches the stored
     sadrW", or — if the two matns' verses happened to agree — quietly replaced
     the wrong poem's bayt. EDIT is therefore dropped before the load. */
  poemSel.onchange = async () => {
    if (EDIT) { try { syncStateFromDOM(); } catch { /* the editor is being torn down */ } }
    const pending = pendingCount();
    if (pending && !confirm(`You have ${pending} unsaved bayt(s) for ${nameOf(POEM)}. Switching will discard them. Continue?`)) {
      poemSel.value = POEM; return;
    }
    EDIT = null;                      // nothing of the matn we are leaving may follow
    PATCH.clear(); refreshPatch();
    POEM = poemSel.value;
    history.replaceState(null, '', location.pathname + '?poem=' + encodeURIComponent(POEM));
    await loadCH();
    loadInline(firstBayt());
  };
  function firstBayt(): number { return BYNUM.size ? Math.min(...BYNUM.keys()) : 1; }

  // ---------- load poem data ----------
  /* Storage (R2) is the source of truth, so the editor reads the live document
     and saves straight back to it. The reading pages carry no copy to fall back
     on, so if the store cannot be reached the editor says so and keeps saving
     off rather than silently editing something stale. */
  async function loadCH(): Promise<void> {
    let verses: Verse[] | null = null;
    SOURCE = 'none';
    try {
      /* The plain document, not the welded one the reading page gets: the
         stored text is what is edited and saved back. The route is no-store,
         so it can never hand back a copy from before your last save (which
         would leave a stale version number here, and every save refused as
         "someone else saved first" — against its own earlier save). */
      const doc = await getPoemDoc(POEM);
      if (doc && Array.isArray(doc.chapters)) {
        verses = versesOf(doc.chapters);
        /* The version only ever goes up, so a lower one means we caught the
           store mid-write. Keep the higher number rather than sending a stale
           baseVersion into the next save.

           It only ever goes up WITHIN ONE MATN, though: one matn may be on v130
           while another is on v2. This used to be a single number carried across
           a switch, so it kept the version of the matn we had LEFT and every
           save of the new one was refused as stale — and the re-read the
           refusal triggers did the same thing again, so it never recovered.
           Hence one remembered version per matn. */
        /* `?? 1`, never `|| 1`: a version of 0 is a real version, and `0 || 1`
           would announce v1 and have every save refused as stale. The API uses
           `?? 1` on the same number for the same reason; the two have to agree. */
        const v = doc.version ?? 1;
        const seen = VERSION_SEEN.get(POEM);
        POEM_VERSION = (seen != null && v < seen) ? seen : v;
        VERSION_SEEN.set(POEM, POEM_VERSION);
        SOURCE = 'store';
      }
    } catch (e) {
      SOURCE = e instanceof ApiError && e.status === 404 ? 'missing' : 'none';
    }
    if (!verses) { verses = []; POEM_VERSION = null; }

    BYNUM = new Map();
    for (const v of verses) BYNUM.set(v.n, v);
    HAS_URDU = verses.some((v) => v.ur != null);
    $('#urBlock').classList.toggle('hidden', !HAS_URDU);
    const max = verses.length ? Math.max(...BYNUM.keys()) : 1;
    inum.max = String(max);
    inum.placeholder = '1';
    document.title = pageTitle(`Bayt Editor · ${nameOf(POEM)}`);
    $('#h1').textContent = `Bayt Editor — ${nameOf(POEM)}`;
    fillRamzList(verses);
    $('#inlineBody').classList.toggle('hidden', !verses.length);
    showSource();
  }

  /* The group-word rumūz (سما, حق, صحبة …) mean different qurrāʾ in different
     qirāʾāt mutūn, so no fixed set of them can be offered to every matn. What
     this matn already uses is a safe list, though: offer those as suggestions
     in the free-text ramz box, most used first. */
  function fillRamzList(verses: Verse[]): void {
    const counts = new Map<string, number>();
    const re = /data-tp="([^"]*)"/g;
    for (const v of verses) {
      for (const s of [v.sadr, v.ajuz]) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(s || '')) !== null) {
          const tp = m[1]!.trim();
          if (tp) counts.set(tp, (counts.get(tp) ?? 0) + 1);
        }
      }
    }
    const list = $('#annList');
    list.textContent = '';
    [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 200).forEach(([tp, c]) => {
      const o = document.createElement('option');
      o.value = tp; o.label = `${tp} — used ${c}×`;
      list.appendChild(o);
    });
  }

  /* =======================================================================
     INLINE WYSIWYG EDITOR
     State: EDIT = { n, cells:{sadr:[{w,g}], ajuz:[{w,g}]}, tr }  (deep copy of the stored bayt)
     Word cells are the source of truth — the app renders the verse from them.
     ======================================================================= */
  let EDIT: EditState | null = null;
  let savedSel: { box: HTMLElement; range: Range } | null = null; // last caret/selection inside a .cbox
  let focusBox: HTMLElement | null = null;                         // last focused .cbox element

  const deepCells = (arr: WordCell[] | null | undefined): ECell[] =>
    (arr || []).map((c) => ({ w: c.w, g: c.g ?? undefined, gu: c.gu ?? undefined, fn: c.fn ?? undefined }));

  function loadInline(n: number): void {
    const v = BYNUM.get(n);
    if (!v) { $('#inlineMsg').textContent = 'No bayt ' + n; return; }
    const carried = autoStage();          // keep unstaged work on the bayt we are leaving
    const staged = PATCH.get(n);
    const src: Pick<Verse, 'sadr' | 'ajuz' | 'sadrW' | 'ajuzW' | 'tr' | 'ur'> = staged || v; // resume a staged edit if present

    /* A verse may have no word cells at all — it renders straight from the
       hemistich string. Those are edited as a single box, and `hasCells:false`
       makes sure we save the string alone instead of inventing cells the matn
       never had. */
    const mk = (cells: WordCell[] | null | undefined, plain: string) => (Array.isArray(cells) && cells.length)
      ? { cells: deepCells(cells), hasCells: true }
      : { cells: [{ w: plain || '', g: undefined }] as ECell[], hasCells: false };
    const s = mk(src.sadrW, src.sadr), a = mk(src.ajuzW, src.ajuz);

    EDIT = { n, cells: { sadr: s.cells, ajuz: a.cells }, hasCells: { sadr: s.hasCells, ajuz: a.hasCells },
             tr: src.tr || '', ur: src.ur || '' };
    inum.value = String(n);
    $('#ipos').textContent = `bayt ${n} of ${BYNUM.size}` + (staged ? ' · staged' : '');
    trBox.value = EDIT.tr;
    urBox.value = EDIT.ur;
    /* Guarded too: moving to another bayt while a box still has focus tears that
       box down, and an unguarded blur would sync the bayt you just left onto the
       one you just opened, cell by cell. */
    rebuildCells();
    syncStateFromDOM();
    EDIT._snapshot = JSON.stringify(buildEntry());   // baseline for autoStage()
    const m = $('#inlineMsg');
    if (carried) {
      m.textContent = 'Kept your unstaged edit ✓'; m.style.color = 'var(--ok)';
      setTimeout(() => { m.textContent = ''; m.style.color = ''; }, 2500);
    } else { m.textContent = ''; }
  }

  // ----- serialize a contenteditable box to canonical app markup -----
  /* The markup vocabulary is the one the API enforces (ALLOWED_CLASSES in
     src/shared/poem-data.ts). The old page kept its own copy of that list,
     which had fallen behind: it lacked `dot`, so the circle inserted from the
     toolbar was unwrapped back to a bare space on the very next read-back. */
  function serNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';     // text
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') return ' ';
    const kids = Array.from(el.childNodes).map(serNode).join('');
    if (tag === 'span') {
      const cls = Array.from(el.classList).filter((c) => ALLOWED_CLASSES.includes(c));
      if (cls.length && kids !== '') {          // drop empty allowed spans (editing cruft)
        // canonical order: colour/small first, ann last  ->  e.g. "rmz ann"
        cls.sort((a, b) => (a === 'ann' ? 1 : 0) - (b === 'ann' ? 1 : 0));
        let out = '<span class="' + cls.join(' ') + '"';
        if (cls.includes('ann')) {
          let tp = el.getAttribute('data-tp');
          if (tp == null || tp === '') tp = el.textContent;
          out += ' data-tp="' + String(tp).replace(/"/g, '').trim() + '"';
        }
        return out + '>' + kids + '</span>';
      }
    }
    return kids;   // unwrap disallowed elements, keep their text
  }
  function serializeBox(box: HTMLElement): string {
    let s = Array.from(box.childNodes).map(serNode).join('');
    /* contenteditable turns a typed space into a NBSP, so those go back to plain
       spaces — except two that have to survive. One is carrying a mark: that is
       the bearer for a small alif with nothing under it, and a plain space there
       would let the line break between the mark and its word. The other closes a
       <span class="dot">, where it is the bearer the circle is drawn over and any
       ḥaraka hangs from — flatten it and the circle's seat becomes an ordinary
       space the line may break at. */
    s = s.normalize('NFC').replace(/ (?!(?:[ً-ٰٟۖ-ۭ]|<\/span>))/g, ' ');
    s = s.replace(/ {2,}/g, ' ');                     // collapse ASCII doubles (keep U+202F etc.)
    s = s.replace(/^ +| +$/g, '');                    // trim ASCII only (preserve boundary U+202F)
    return s;
  }

  // ----- read every editor box back into EDIT state -----
  /* While a cell is being added, deleted, merged or split, EDIT and the cells on
     screen disagree: the array has already changed and the old cells are still up.
     syncStateFromDOM() maps cells onto the array BY INDEX, so running it in that
     window writes the stale cells back over the new array — and because the old
     DOM is one longer, the last word falls off the end. That is how deleting one
     word used to delete a different one. Tearing the cells down blurs whichever
     box had focus, and the blur handler syncs, so the window is not theoretical. */
  let CELLS_SETTLING = false;

  /** Mutate the cell array and redraw, with syncing held off in between.
      Call it with no mutation to redraw alone — the teardown is the dangerous
      half, so even a redraw that changes nothing has to be inside the guard. */
  function rebuildCells(mutate?: () => void): void {
    CELLS_SETTLING = true;
    try { if (mutate) mutate(); renderCellEditors(); }
    finally { CELLS_SETTLING = false; }
    renderLivePreview();
  }

  const wrapOf = (hemi: Hemi) => (hemi === 'sadr' ? $('#cellsSadr') : $('#cellsAjuz'));

  function syncStateFromDOM(): void {
    if (!EDIT || CELLS_SETTLING) return;
    for (const hemi of HEMIS) {
      wrapOf(hemi).querySelectorAll<HTMLElement>('.cell').forEach((cell) => {
        const idx = +(cell.dataset.idx ?? -1);
        const box = cell.querySelector<HTMLElement>('.cbox');
        const gi = cell.querySelector<HTMLInputElement>('.cg');   // absent on a whole-hemistich box
        const c = EDIT!.cells[hemi][idx];
        if (c && box) {
          c.w = serializeBox(box);
          if (gi) c.g = (gi.value === '' ? undefined : gi.value);
        }
      });
    }
    EDIT.tr = trBox.value;
    EDIT.ur = urBox.value;
  }

  // ----- build the cell editor cards -----
  function renderCellEditors(): void {
    if (!EDIT) return;
    const ed = EDIT;
    for (const hemi of HEMIS) {
      const wrap = wrapOf(hemi);
      const hasCells = ed.hasCells[hemi];
      wrap.innerHTML = '';
      ed.cells[hemi].forEach((c, idx) => wrap.appendChild(buildCell(hemi, c, idx, hasCells)));

      if (hasCells) {
        const add = document.createElement('button');
        add.className = 'addcell'; add.textContent = '＋ word';
        add.onmousedown = (e) => e.preventDefault();
        add.onclick = () => { syncStateFromDOM(); rebuildCells(() => ed.cells[hemi].push({ w: '', g: undefined })); };
        wrap.appendChild(add);
      } else {
        /* This hemistich has no word-by-word breakdown. Offer to create one by
           splitting on spaces — that is how a matn without glosses gains
           tappable word meanings later. */
        const split = document.createElement('button');
        split.className = 'addcell'; split.textContent = 'split into words ⇥';
        split.title = 'Break this hemistich into word cells so each word can carry a meaning';
        split.onmousedown = (e) => e.preventDefault();
        split.onclick = () => {
          syncStateFromDOM();
          const whole = ed.cells[hemi][0]?.w || '';
          const parts = whole.split(' ').filter((x) => x !== '');
          if (parts.length < 2) { flashFocus('Nothing to split — the hemistich is one word.'); return; }
          /* Through rebuildCells, not renderCellEditors: tearing the old
             whole-hemistich box down blurs it, and its blur handler syncs the DOM
             onto the array by index. Unguarded, that wrote the whole hemistich
             back over cell 0 — so the first card kept the entire line and the
             first word was lost. */
          rebuildCells(() => {
            ed.cells[hemi] = parts.map((w) => ({ w, g: undefined }));
            ed.hasCells[hemi] = true;
          });
        };
        wrap.appendChild(split);
      }
    }
  }
  function buildCell(hemi: Hemi, c: ECell, idx: number, hasCells: boolean): HTMLElement {
    const cell = document.createElement('div');
    cell.className = 'cell'; cell.dataset.hemi = hemi; cell.dataset.idx = String(idx);
    // A whole-hemistich box (no word cells) gets the full width and wraps.
    if (!hasCells) cell.style.cssText = 'flex:1 1 100%';
    const box = document.createElement('div');
    box.className = 'cbox'; box.contentEditable = 'true'; box.dir = 'rtl'; box.spellcheck = false;
    if (!hasCells) box.style.whiteSpace = 'normal';
    box.innerHTML = c.w || '';
    box.addEventListener('focus', () => { focusBox = box; cell.classList.add('foc'); });
    // NB: don't rebuild box.innerHTML on blur — that would invalidate a saved
    // selection range (e.g. when the user tabs to the ramz input then clicks
    // "above"). syncStateFromDOM() already reads canonical markup out of the DOM.
    box.addEventListener('blur', () => { cell.classList.remove('foc'); syncStateFromDOM(); renderLivePreview(); });
    box.addEventListener('keyup', saveSelection);
    box.addEventListener('mouseup', saveSelection);
    box.addEventListener('input', () => { renderLivePreview(); });
    box.addEventListener('paste', (e) => {                       // paste as plain text only
      e.preventDefault();
      const txt = (e.clipboardData || window.clipboardData)?.getData('text') ?? '';
      insertTextAtCaret(txt.replace(/\s+/g, ' '));
    });
    cell.appendChild(box);

    // Per-word meaning and the split/merge controls only make sense once the
    // hemistich actually has word cells.
    if (hasCells) {
      const gi = document.createElement('input');
      gi.type = 'text'; gi.className = 'cg'; gi.placeholder = 'meaning (optional)';
      gi.value = c.g == null ? '' : c.g;
      gi.addEventListener('input', () => {
        const cur = EDIT?.cells[hemi][idx];
        if (cur) cur.g = (gi.value === '' ? undefined : gi.value);
        syncButtons();
      });
      cell.appendChild(gi);

      const ctl = document.createElement('div'); ctl.className = 'cctl';
      ctl.innerHTML = '<button data-a="split">split</button><button data-a="mergeR">＋←</button>'
                    + '<button data-a="add">＋→</button><button data-a="del" class="danger">✕</button>';
      ctl.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
        b.onmousedown = (e) => e.preventDefault();
        b.onclick = () => cellAction(b.dataset.a ?? '', hemi, idx);
      });
      cell.appendChild(ctl);
    }
    return cell;
  }

  function cellAction(a: string, hemi: Hemi, idx: number): void {
    if (!EDIT) return;
    syncStateFromDOM();
    const arr = EDIT.cells[hemi];
    // the split reads the live caret, so it has to happen before the guard goes up
    const parts = a === 'split' ? splitBoxAtCaret(hemi, idx) : null;
    rebuildCells(() => {
      const cur = arr[idx];
      if (!cur) return;
      if (a === 'del') { if (arr.length > 1) arr.splice(idx, 1); }
      else if (a === 'add') { arr.splice(idx + 1, 0, { w: '', g: undefined }); }
      else if (a === 'mergeR') {                     // merge into the cell to its RIGHT (idx-1 in the array, RTL)
        const prev = arr[idx - 1];
        if (prev) {
          prev.w = (prev.w + ' ' + cur.w).trim();
          if (prev.g == null && cur.g != null) prev.g = cur.g;
          if (prev.gu == null && cur.gu != null) prev.gu = cur.gu;
          if (prev.fn == null && cur.fn != null) prev.fn = cur.fn;
          arr.splice(idx, 1);
        }
      } else if (a === 'split') {
        if (parts) arr.splice(idx, 1, { w: parts[0], g: cur.g, gu: cur.gu, fn: cur.fn }, { w: parts[1], g: undefined });
      }
    });
  }

  // split the focused box's serialized content at the caret into [left,right]
  function splitBoxAtCaret(hemi: Hemi, idx: number): [string, string] | null {
    const cell = document.querySelector(`.cell[data-hemi="${hemi}"][data-idx="${idx}"]`);
    const box = cell?.querySelector<HTMLElement>('.cbox');
    const sel = window.getSelection();
    if (!box || !sel || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!box.contains(r.startContainer)) return null;
    const left = r.cloneRange(); left.selectNodeContents(box); left.setEnd(r.startContainer, r.startOffset);
    const right = r.cloneRange(); right.selectNodeContents(box); right.setStart(r.startContainer, r.startOffset);
    const tmpL = document.createElement('div'); tmpL.appendChild(left.cloneContents());
    const tmpR = document.createElement('div'); tmpR.appendChild(right.cloneContents());
    return [serializeBox(tmpL), serializeBox(tmpR)];
  }

  // ----- live preview (the reading page's own hemiHTML) -----
  /* Built by the same function the reading page uses, with the stored
     red-ink word positions, so what is shown is what readers will get. */
  function previewHemi(hemi: Hemi): string {
    if (!EDIT) return '';
    const v = BYNUM.get(EDIT.n);
    const reds = hemi === 'sadr' ? v?.sr : v?.jr;
    const cells = EDIT.cells[hemi];
    const plain = cells.map((c) => c.w).join(' ');
    return hemiHTML(EDIT.hasCells[hemi] ? cells : null, plain, reds);
  }
  function renderLivePreview(): void {
    if (!EDIT) return;
    syncStateFromDOM();
    $('#pvSadr').innerHTML = previewHemi('sadr') || '&nbsp;';
    $('#pvAjuz').innerHTML = previewHemi('ajuz') || '&nbsp;';
    $('#pvN').textContent = String(EDIT.n);
    $('#pvTr').textContent = EDIT.tr || '';
    $('#pcount').textContent = String(pendingCount());
    syncButtons();
  }

  /* -------- selection + toolbar actions -------- */
  function saveSelection(): void {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && focusBox && focusBox.contains(sel.anchorNode)) {
      savedSel = { box: focusBox, range: sel.getRangeAt(0).cloneRange() };
    }
  }
  function restoreSelection(): boolean {
    if (!savedSel) return false;
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges(); sel.addRange(savedSel.range);
    savedSel.box.focus();
    return true;
  }
  function afterEdit(box: HTMLElement): void {  // re-normalise + push to state + preview, keep caret sane
    box.normalize();
    syncStateFromDOM(); renderLivePreview();
  }

  /* Ḥarakāt, the dagger alif and the muṣḥaf signs are combining marks: the font
     draws them on the letter in front of them, and only when the two sit in the
     same run of text. Dropped where there is no letter — at the start of a word —
     or on the far side of an element boundary, as happens just outside a coloured
     span, there is nothing to attach to and the mark is drawn floating beside the
     word instead of above its letter. So a mark always goes INTO the preceding
     letter's own text node, and is refused when no letter precedes the cursor. */
  /* Everything that cannot stand on its own and has to sit in the same run of
     text as the letter in front of it: the ḥarakāt and the marks around them,
     the dagger alif, the muṣḥaf signs (U+06E1 sukūn, U+06E5 small wāw, U+06E6
     small yāʾ), the kashida (U+0640) that can carry a mark on a stretch of its
     own, the dotless-yāʾ seat (U+0649) that carries one on an empty bearer, and
     the no-break space (U+00A0) that carries one on no bearer at all — it has to
     be a space with width, since a zero-width one lets the mark fall back onto
     the previous letter. Nothing else, so a pasted word still goes in at the
     cursor. */
  const MARK_ONLY = /^[ ـىً-ٰٟۖ-ۭ]+$/;

  /** Where a combining mark must land: the letter immediately before the caret. */
  function markTarget(box: HTMLElement, r: Range): { node: Text; off: number } | null {
    if (r.startContainer.nodeType === Node.TEXT_NODE && r.startOffset > 0)
      return { node: r.startContainer as Text, off: r.startOffset };
    // Caret at the start of a text node, or between elements — walk back to the
    // last text that ends at or before it, and append there.
    const walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    let best: Text | null = null;
    let t: Node | null;
    while ((t = walk.nextNode())) {
      const text = t as Text;
      if (!text.nodeValue?.length) continue;
      try { if (r.comparePoint(text, text.nodeValue.length) <= 0) best = text; } catch { /* not comparable */ }
    }
    return best ? { node: best, off: best.nodeValue?.length ?? 0 } : null;
  }

  function insertTextAtCaret(text: string): void {
    const box = savedSel?.box || focusBox; if (!box) { flashFocus(); return; }
    restoreSelection();
    const sel = window.getSelection(); if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (!box.contains(r.startContainer)) { flashFocus('Tap into the word you want to change first.'); return; }
    r.deleteContents();

    if (MARK_ONLY.test(text)) {
      const t = markTarget(box, r);
      /* Two of these carry their own seat, so they can open a hemistich — or go
         anywhere else — with nothing in front of them.

         A kashida is one: when a word is split across the two halves of a bayt
         for the metre, the ʿajuz starts with one to show it carries on
         (…الۡـ ‖ ـقِتَالُ).

         The other is anything that begins with the no-break-space bearer — the
         small alif over a gap, and the round dot that stands in the word. There
         the bearer IS the seat, so demanding a letter to attach to would be
         demanding something the mark does not want.

         Everything else genuinely needs a letter in front of it. */
      if (!t && (text === 'ـ' || text.charCodeAt(0) === 0x00A0)) {
        const node = document.createTextNode(text);
        r.insertNode(node); r.setStartAfter(node); r.collapse(true);
        sel.removeAllRanges(); sel.addRange(r); saveSelection();
        afterEdit(box);
        return;
      }
      if (!t) { flashFocus('Put the cursor just after the letter this mark belongs on.'); return; }
      t.node.insertData(t.off, text);
      const nr = document.createRange();
      nr.setStart(t.node, t.off + text.length); nr.collapse(true);
      sel.removeAllRanges(); sel.addRange(nr); saveSelection();
      afterEdit(box);
      return;
    }

    const node = document.createTextNode(text);
    r.insertNode(node); r.setStartAfter(node); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r); saveSelection();
    afterEdit(box);
  }

  // wrap the current selection in a span of class `cls`
  function wrapSelection(cls: string, opts: { dtp?: string } = {}): void {
    const box = savedSel?.box || focusBox;
    if (!box) { flashFocus(); return; }
    restoreSelection();
    const sel = window.getSelection(); if (!sel || !sel.rangeCount) { flashFocus(); return; }
    const r = sel.getRangeAt(0);
    if (r.collapsed) {
      /* Nothing is selected. Never invent text here: a ramz belongs ABOVE a
         letter that is already in the verse, so silently inserting the ramz
         character as a new letter corrupts the matn (it is how one bayt ended
         up reading ككَمۡ). Ask for a selection instead. */
      flashFocus('Select the letter(s) the ramz should sit above.');
      return;
    }
    const classes = cls.split(' ');
    // if the selection exactly wraps a single allowed span, augment its classes instead of nesting
    const exact = exactWrappedSpan(r);
    if (exact) {
      classes.forEach((k) => {
        if (COLOR_CLASSES.includes(k)) {                       // a colour replaces any existing colour
          COLOR_CLASSES.forEach((c) => exact.classList.remove(c)); exact.classList.add(k);
        } else if (!exact.classList.contains(k)) exact.classList.add(k);
      });
      if (classes.includes('ann')) exact.setAttribute('data-tp', opts.dtp || (exact.textContent ?? '').replace(/"/g, '').trim());
      const nr = document.createRange(); nr.selectNodeContents(exact);
      sel.removeAllRanges(); sel.addRange(nr); saveSelection();
    } else {
      const span = document.createElement('span'); span.className = cls;
      const frag = r.extractContents();
      if (classes.includes('ann')) span.setAttribute('data-tp', opts.dtp || (frag.textContent ?? '').replace(/"/g, '').trim());
      span.appendChild(frag);
      r.insertNode(span);
      const nr = document.createRange(); nr.selectNodeContents(span);
      sel.removeAllRanges(); sel.addRange(nr); saveSelection();
    }
    afterEdit(box);
  }
  const isAllowedSpan = (n: Node | null | undefined): n is HTMLSpanElement =>
    !!n && n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === 'SPAN'
    && Array.from((n as Element).classList).some((c) => ALLOWED_CLASSES.includes(c));
  function exactWrappedSpan(r: Range): HTMLSpanElement | null {
    // case A: the caret/selection sits inside a single allowed span
    let node: Node | null = r.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    if (isAllowedSpan(node) && r.toString() === node.textContent) return node;
    // case B: the selection encloses exactly one child that is an allowed span
    // (e.g. selecting a whole word-box whose only content is one span)
    const cac = r.commonAncestorContainer;
    if (cac.nodeType === Node.ELEMENT_NODE) {
      const within = Array.from(cac.childNodes).filter((k) =>
        !(k.nodeType === Node.TEXT_NODE && (k.nodeValue ?? '').trim() === '') && r.intersectsNode(k));
      const only = within.length === 1 ? within[0] : null;
      if (isAllowedSpan(only) && only.textContent === r.toString()) return only;
    }
    return null;
  }

  // remove colour/ann/small formatting from the selection (unwrap allowed spans it touches)
  function clearFormatting(): void {
    const box = savedSel?.box || focusBox; if (!box) { flashFocus(); return; }
    restoreSelection();
    const sel = window.getSelection(); if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    const spans = Array.from(box.querySelectorAll('span')).filter((sp) => isAllowedSpan(sp) && r.intersectsNode(sp));
    spans.forEach((sp) => {
      const p = sp.parentNode;
      if (!p) return;
      while (sp.firstChild) p.insertBefore(sp.firstChild, sp);
      p.removeChild(sp);
    });
    box.normalize(); afterEdit(box);
  }

  const FOCUS_NOTE = 'Tap into a word box, select letters, then use the toolbar.';
  function flashFocus(msg?: string): void {
    const n = $('#focusNote'); n.textContent = msg || 'Tap into a word box first.';
    n.style.color = '#8a2a2a';
    setTimeout(() => { n.style.color = ''; n.textContent = FOCUS_NOTE; }, 2200);
  }

  /* The circle that stands in the word (see the .dot rule). The no-break space
     inside it is the bearer: it gives the span something to be, and it is what a
     ḥaraka clicked afterwards attaches to, so the vowel hangs over the circle the
     way it would over a letter. */
  function insertDot(): void {
    insertSpanAtCaret('dot', ' ');
  }
  // insert a small-noon span (raised connecting letter) at the caret
  function insertSmallNoon(inner: string): void {
    insertSpanAtCaret('small-noon', inner);
  }
  function insertSpanAtCaret(cls: string, inner: string): void {
    const box = savedSel?.box || focusBox; if (!box) { flashFocus(); return; }
    restoreSelection();
    const sel = window.getSelection(); if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0); r.deleteContents();
    const span = document.createElement('span'); span.className = cls; span.textContent = inner;
    r.insertNode(span); r.setStartAfter(span); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r); saveSelection();
    afterEdit(box);
  }

  // ----- wire the toolbar -----
  const toolbar = $('#toolbar');
  toolbar.querySelectorAll('button').forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));
  toolbar.addEventListener('click', (e) => {
    const b = (e.target as Element | null)?.closest<HTMLButtonElement>('button'); if (!b) return;
    const d = b.dataset;
    if (d.ins != null) insertTextAtCaret(d.ins);
    else if (d.snoon) insertSmallNoon(d.snoon);
    else if (d.dot) insertDot();
    else if (d.wrapsmall) wrapSelection('small-noon');
    else if (d.ann) wrapSelection('ann', { dtp: d.ann });
    else if (d.color) wrapSelection(d.color);
    else if (d.clearfmt) clearFormatting();
  });
  const annApply = $('#annApply');
  annApply.onmousedown = (e) => e.preventDefault();
  annApply.onclick = () => {
    const tp = $<HTMLInputElement>('#annText').value.trim();
    if (!tp) { flashFocus('Type the ramz first.'); return; }
    wrapSelection('ann', { dtp: tp });
  };

  // ----- navigation -----
  $('#goB').onclick = () => loadInline(+inum.value);
  inum.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadInline(+inum.value); });
  $('#prevB').onclick = () => { if (EDIT && BYNUM.has(EDIT.n - 1)) loadInline(EDIT.n - 1); };
  $('#nextB').onclick = () => { if (EDIT && BYNUM.has(EDIT.n + 1)) loadInline(EDIT.n + 1); };
  trBox.addEventListener('input', () => { if (EDIT) { EDIT.tr = trBox.value; renderLivePreview(); } });
  urBox.addEventListener('input', () => { if (EDIT) { EDIT.ur = urBox.value; syncButtons(); } });

  // ----- stage / revert -----
  /* Build the patch entry for whatever is currently in the editor.
     The hemistich string is always the exact space-join of its boxes — that is
     what the app renders from. A hemistich with no word cells stays that way: its
     single box IS the string, and no sadrW/ajuzW is sent, so a matn does not
     silently acquire cells it never had. */
  function buildEntry(): Entry {
    const ed = EDIT!;
    const cellsOf = (hemi: Hemi): WordCell[] => ed.cells[hemi].map((c) => ({
      w: c.w,
      ...(c.g != null ? { g: c.g } : {}),
      ...(c.gu != null ? { gu: c.gu } : {}),
      ...(c.fn != null ? { fn: c.fn } : {}),
    }));
    const sadrW = cellsOf('sadr'), ajuzW = cellsOf('ajuz');
    const entry: Entry = { n: ed.n, sadr: sadrW.map((c) => c.w).join(' '), ajuz: ajuzW.map((c) => c.w).join(' '), tr: ed.tr };
    if (ed.hasCells.sadr) entry.sadrW = sadrW;
    if (ed.hasCells.ajuz) entry.ajuzW = ajuzW;
    if (HAS_URDU) entry.ur = ed.ur;
    return entry;
  }

  /* Anything typed but not staged used to be thrown away the moment you moved to
     another bayt — easy to lose a whole run of edits without noticing. Now any
     real change is staged automatically before the editor moves on. */
  function autoStage(): boolean {
    if (!EDIT || !EDIT._snapshot) return false;
    syncStateFromDOM();
    const entry = buildEntry();
    if (JSON.stringify(entry) === EDIT._snapshot) return false;
    PATCH.set(EDIT.n, entry); refreshPatch();
    return true;
  }

  $('#stageInline').onclick = () => {
    if (!EDIT) return;
    syncStateFromDOM();
    const entry = buildEntry();
    PATCH.set(EDIT.n, entry); refreshPatch();
    EDIT._snapshot = JSON.stringify(entry);
    $('#ipos').textContent = `bayt ${EDIT.n} of ${BYNUM.size} · staged`;
    const m = $('#inlineMsg'); m.textContent = `Staged bayt ${EDIT.n} ✓`; m.style.color = 'var(--ok)';
    setTimeout(() => { m.textContent = ''; m.style.color = ''; }, 2500);
  };
  $('#revertInline').onclick = () => {
    if (!EDIT) return;
    syncStateFromDOM();
    const unstaged = !!EDIT._snapshot && JSON.stringify(buildEntry()) !== EDIT._snapshot;
    if ((PATCH.has(EDIT.n) || unstaged) && !confirm('Discard staged edits for bayt ' + EDIT.n + ' and reload from the app?')) return;
    const n = EDIT.n;
    PATCH.delete(n); refreshPatch();
    /* Drop the on-screen edit too. loadInline() auto-stages whatever differs
       from the snapshot, so an edit that had never been staged used to come
       straight back ("Kept your unstaged edit") instead of being reverted. */
    EDIT._snapshot = undefined;
    loadInline(n);
  };

  // ---------- patch panel (shared) ----------
  /* The counter also counts the bayt you are editing right now, as soon as
     it differs from what is stored — otherwise a run of edits looks like it is
     being dropped when in fact it is carried on navigation and on save. */
  function pendingCount(): number {
    let n = PATCH.size;
    try {
      if (EDIT && EDIT._snapshot && !PATCH.has(EDIT.n)
          && JSON.stringify(buildEntry()) !== EDIT._snapshot) n++;
    } catch { /* nothing on screen yet */ }
    return n;
  }
  /* The buttons must follow pendingCount(), NOT PATCH.size: a bayt you have just
     typed into is real work even though you never pressed "Stage this bayt", and
     every one of these actions auto-stages it first. Gating them on PATCH.size
     left Save greyed out next to a counter reading "1", so the click never
     reached its handler and the edit was quietly never sent anywhere. */
  function syncButtons(): void {
    const pending = pendingCount() > 0;
    $<HTMLButtonElement>('#clear').disabled = PATCH.size === 0;
    $<HTMLButtonElement>('#save').disabled = !pending || SOURCE !== 'store';
  }
  function refreshPatch(): void {
    $('#pcount').textContent = String(pendingCount());
    syncButtons();
  }
  $('#clear').onclick = () => {
    if (confirm('Clear all staged bayts?')) { PATCH.clear(); refreshPatch(); $('#pmsg').className = 'msg'; }
  };

  /* ---------- save straight to the app ----------
     Sends only the staged bayts plus the version they were edited from. The API
     re-validates every one of them, merges them into the stored document and
     bumps its version; if someone else saved in the meantime it answers 409 and
     nothing is written, so no edit is ever silently overwritten. The same rules
     are checked here first (validateBayt, shared with the worker), so a bayt
     the server would refuse is caught before anything is sent. */
  $('#save').onclick = async () => {
    autoStage();                       // include work that was never staged
    const m = $('#pmsg'), btn = $<HTMLButtonElement>('#save');
    // Never fail quietly: if there is nothing to publish, say so.
    if (SOURCE !== 'store') {
      m.className = 'msg err';
      m.textContent = SOURCE === 'missing'
        ? `${nameOf(POEM)} has not been imported yet, so there is nothing to save to. Import it at /admin/import first.`
        : `${nameOf(POEM)} could not be loaded from storage, so saving is off. Reload the page once you are online.`;
      return;
    }
    if (!PATCH.size) {
      m.className = 'msg';
      m.textContent = 'Nothing to save — this bayt is already identical to the live copy.';
      return;
    }
    const bayts = [...PATCH.values()].sort((a, b) => a.n - b.n);
    const problems = bayts.flatMap((b) => validateBayt(b));
    if (problems.length) {
      m.className = 'msg err';
      m.textContent = 'Rejected — ' + problems.slice(0, 4).join(' · ');
      return;
    }
    if (!confirm(`Publish ${bayts.length} bayt(s) to the live app?`)) return;
    btn.disabled = true; m.className = 'msg'; m.textContent = '';
    try {
      const out = await saveBayts(PW, POEM, POEM_VERSION, bayts);
      POEM_VERSION = out.version; VERSION_SEEN.set(POEM, out.version);
      /* Fold what we just sent into the loaded copy rather than re-reading it:
         we already know exactly what was stored — it is what we sent, and the
         version came back with it. */
      for (const b of bayts) {
        const v = BYNUM.get(b.n);
        if (!v) continue;
        v.sadr = b.sadr; v.ajuz = b.ajuz; v.tr = b.tr;
        if (b.sadrW) v.sadrW = b.sadrW;
        if (b.ajuzW) v.ajuzW = b.ajuzW;
        if (b.ur != null) v.ur = b.ur;
      }
      PATCH.clear();
      // what is on screen is now exactly what is stored — re-baseline it so the
      // counter does not keep reporting it as unsaved work
      if (EDIT) { syncStateFromDOM(); EDIT._snapshot = JSON.stringify(buildEntry()); }
      refreshPatch(); showSource();
      m.className = 'msg ok';
      m.textContent = `Saved ${(out.applied || []).length} bayt(s) — now live as v${out.version}.`
        + ((out.skipped || []).length ? ` ${out.skipped!.length} were already up to date.` : '');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        /* Your edits are still staged and loadInline() puts them straight back on
           screen, so re-reading the live version is all that is needed — press
           Save again. */
        const body = e.body ?? {};
        m.className = 'msg err';
        m.textContent = `The live copy moved on (it is v${String(body.version ?? '?')}, you were editing v${String(body.yours ?? POEM_VERSION)}).`
                      + ' Re-reading it now — your edits are kept, just press Save again.';
        setTimeout(async () => {
          await loadCH();
          loadInline(EDIT ? EDIT.n : firstBayt());
          showSource();
          m.className = 'msg';
          m.textContent = `Now on v${POEM_VERSION} with your ${PATCH.size} edited bayt(s) still here — press Save.`;
        }, 1500);
        return;
      }
      if (e instanceof ApiError && e.status === 422) {
        m.className = 'msg err';
        m.textContent = 'Rejected — ' + (e.problems.length ? e.problems : ['validation failed']).slice(0, 4).join(' · ');
        btn.disabled = false;
        return;
      }
      m.className = 'msg err';
      m.textContent = 'Could not save: ' + (e instanceof Error && e.message ? e.message : 'unknown error') + ' — your edits are still here, so you can try again.';
      btn.disabled = false;
    }
  };

  /* Signed in from another admin tool this session: carry straight on. */
  const remembered = storedPassword();
  if (remembered) { $<HTMLInputElement>('#pw').value = remembered; void unlock(); }
}

