/* Orthography (/admin/orthography): normalises how a matn is written, without
   touching what it says. Previews every change against the stored text, and
   only writes when Apply is pressed. The rules themselves are pure functions
   in src/shared/orthography.ts, so a script can apply exactly the same ones.

   Runs as the page's module script, so it does its wiring at import time. */
import { ALL_POEMS, getPoem } from '../../poems/index.ts';
import type { PoemDoc } from '../../poems/types.ts';
import { ORTHOGRAPHY_RULES, applyOrthography, planOrthography, type PlannedBayt } from '../../shared/orthography.ts';
import { ApiError, getPoemDoc, putPoemDocument } from '../api.ts';
import { signIn, storedPassword } from './auth.ts';

function $<T extends HTMLElement = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`${sel} is missing from the page`);
  return el;
}

main();

function main(): void {
  /* No matn registered: the page says so in place of the tool. */
  if (!ALL_POEMS.length) return;

  let PW = '', POEM = ALL_POEMS[0]!.id;
  let doc: PoemDoc | null = null;
  let pending: PlannedBayt[] = [], heads: { i: number; now: string }[] = [];
  const nameOf = (id: string) => getPoem(id)?.shortEn ?? id;

  function say(t: string, k?: 'ok' | 'err' | 'warn'): void { const m = $('#msg'); m.className = 'msg ' + (k || 'ok'); m.textContent = t; }
  function quiet(): void { $('#msg').className = 'msg'; $('#msg').textContent = ''; }
  function log(t: string): void {
    const l = $('#log'); l.classList.add('on');
    const d = document.createElement('div'); d.textContent = t; l.appendChild(d); l.scrollTop = l.scrollHeight;
  }

  /* Every registered matn, drafts too. */
  const sel = $<HTMLSelectElement>('#poem');
  for (const p of ALL_POEMS) {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.shortEn + (p.draft ? ' (draft)' : '');
    sel.appendChild(o);
  }
  sel.value = POEM;
  sel.addEventListener('change', () => { POEM = sel.value; quiet(); void load(); });
  $('#refresh').addEventListener('click', () => { void load(); });

  /* What each rule does, above the preview — one panel per rule, in the order
     they run. */
  $('#passes').innerHTML = ORTHOGRAPHY_RULES
    .map((r) => '<div class="pass"><span class="why">' + r.why + '</span></div>').join('');

  async function unlock(): Promise<void> {
    const pwIn = $<HTMLInputElement>('#pw'), btn = $<HTMLButtonElement>('#unlock');
    const v = pwIn.value.trim(); if (!v) return;
    btn.disabled = true; $('#gateMsg').textContent = '';
    let ok: boolean;
    try { ok = await signIn(v); }
    catch { btn.disabled = false; $('#gateMsg').textContent = 'Could not reach the server.'; return; }
    btn.disabled = false;
    if (!ok) { $('#gateMsg').textContent = 'Wrong password.'; return; }
    PW = v;
    $('#gate').classList.add('hidden'); $('#main').classList.remove('hidden');
    void load();
  }
  $('#unlock').addEventListener('click', () => { void unlock(); });
  $('#pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') void unlock(); });

  async function load(): Promise<void> {
    $('#rows').textContent = ''; $('#prevWrap').classList.add('hidden');
    try {
      doc = await getPoemDoc(POEM);
    } catch (e) {
      doc = null;
      pending = []; heads = [];
      $('#count').textContent = ''; $('#leftAlone').classList.add('hidden');
      $<HTMLButtonElement>('#apply').disabled = true;
      say(e instanceof ApiError && e.status === 404
        ? `${nameOf(POEM)} has not been imported yet — there is no stored text to normalise. Import it at /admin/import first.`
        : `Could not read ${nameOf(POEM)}.`, 'err');
      return;
    }
    render();
  }

  function render(): void {
    if (!doc) return;
    const plan = planOrthography(doc);
    pending = plan.bayts;
    heads = plan.headings;

    const out: string[] = [];
    if (plan.broken.length)
      out.push('Bayt ' + plan.broken.join(', ') + ' would stop matching its word cells, so it is left out.');
    if (plan.altered.length)
      out.push(plan.altered.join(', ').replace(/^./, (c) => c.toUpperCase())
        + ' would have a letter changed by a rule that may only move marks, so ' + (plan.altered.length === 1 ? 'it is' : 'they are') + ' left out.');
    if (out.length) say(out.join(' '), 'warn');

    const tallies = plan.tallies.map((t) => ' · ' + t.count + ' ' + t.label).join('');
    $('#count').innerHTML = '<b>' + pending.length + '</b> of ' + plan.total + ' abyāt'
      + (heads.length ? ' and ' + heads.length + ' heading' + (heads.length === 1 ? '' : 's') : '')
      + ' would change' + tallies + ' · version ' + doc.version;
    const any = pending.length + heads.length;
    const apply = $<HTMLButtonElement>('#apply');
    apply.disabled = !any;
    apply.textContent = any ? 'Apply to ' + pending.length + ' bayt' + (pending.length === 1 ? '' : 's') : 'Nothing to change';

    const rows = $('#rows'); rows.textContent = '';
    pending.slice(0, 400).forEach((e) => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="n">' + e.n + '</td><td class="was"></td><td class="now"></td>';
      tr.children[1]!.textContent = e.was; tr.children[2]!.textContent = e.now;
      rows.appendChild(tr);
    });
    $('#prevWrap').classList.toggle('hidden', !pending.length);

    const box = $('#leftAlone');
    box.classList.toggle('hidden', !heads.length);
    if (heads.length) {
      box.innerHTML = '<b>' + heads.length + ' chapter heading(s) change too.</b> They are written the same '
        + 'way the verses are, and are saved in the same pass.<div class="heads"></div>';
      const list = box.querySelector('.heads')!;
      for (const h of heads) {
        const w = document.createElement('span'); w.className = 'w'; w.textContent = h.now;
        list.appendChild(w);
      }
    }
  }

  /* The whole document goes back in one request, because a chapter heading is
     written the same way its verses are and the bayt-at-a-time route cannot
     reach one — it merges verses and nothing else. The server validates every
     verse exactly as the merge route does, keeps the copy it replaces as a
     backup, and carries the version on climbing. What that route has no notion
     of is baseVersion, so the check it would have done is done here instead:
     read the document again, refuse if it moved under us since the preview,
     and only then write. */
  async function send(): Promise<void> {
    if (!doc) return;
    const apply = $<HTMLButtonElement>('#apply');
    log('re-reading ' + POEM + '…');
    let fresh: PoemDoc;
    try { fresh = await getPoemDoc(POEM); }
    catch { apply.disabled = false; say('Could not re-read the matn — nothing was sent.', 'err'); return; }
    if ((fresh.version || 1) !== (doc.version || 1)) {
      apply.disabled = false;
      const was = doc.version;
      await load();
      say('Somebody saved while this was open (version ' + was + ' → ' + fresh.version
        + '), so nothing was sent. The preview above is fresh — press Apply again.', 'warn');
      return;
    }
    const next = applyOrthography(fresh);
    const nb = pending.length, nh = heads.length;    // load() below clears both
    log('writing ' + nb + ' bayt(s) and ' + nh + ' heading(s)…');
    try {
      const w = await putPoemDocument(PW, POEM, next, true);
      log('  stored as version ' + (w.version || '?'));
    } catch (e) {
      apply.disabled = false;
      if (e instanceof ApiError) {
        say('Save failed (' + e.status + '). ' + (e.message || '') + ' Nothing was changed.', 'err');
        log(JSON.stringify(e.body ?? {}).slice(0, 400));
      } else {
        say('Could not reach the server.', 'err');
      }
      return;
    }
    await load();
    say('Done — ' + nb + ' bayt(s) and ' + nh + ' heading(s) rewritten. '
      + 'The reading page shows it at once; an installed app after it is fully closed and reopened.', 'ok');
  }

  $('#apply').addEventListener('click', () => {
    if ((!pending.length && !heads.length) || !doc) return;
    if (!confirm('Rewrite ' + pending.length + ' bayt(s) and ' + heads.length + ' heading(s) of '
      + nameOf(POEM) + '?\n\nThe whole matn is stored again as version ' + ((doc.version || 1) + 1)
      + ', and version ' + (doc.version || 1) + ' is kept as a backup. What the verses say does not '
      + 'change, only how they are written. It goes live for readers straight away.')) return;
    $<HTMLButtonElement>('#apply').disabled = true; quiet();
    send().catch(() => {
      $<HTMLButtonElement>('#apply').disabled = false; say('Could not reach the server.', 'err');
    });
  });

  /* Signed in from another admin tool this session: carry straight on. */
  const s = storedPassword();
  if (s) { $<HTMLInputElement>('#pw').value = s; void unlock(); }
}
