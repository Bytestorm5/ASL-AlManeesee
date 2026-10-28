/* The per-bayt visibility switches, applied.

   The content editor can turn three things off for a single bayt: its
   English translation, its Urdu translation, and its explanation panel. The
   switches are read publicly from /api/switches/<id>; this is what makes them
   show on the page.

   Defaults are deliberately not symmetric. An explanation stays hidden until
   it is switched ON (unless the matn registers its commentary as checked) —
   an unreachable store must never be what puts unverified text in front of a
   reader. A translation is the other way round: it shows unless a bayt is
   explicitly listed as hidden, and a failed fetch leaves every one alone.

   The last good answer is cached in localStorage and applied before the
   network is asked, so an installed app opening offline still hides what
   should be hidden — and the page does not flash a translation that is off. */
import type { AslSwitchMaps } from '../globals.d.ts';
import { getSwitches } from '../api.ts';
import { explanationBayts } from '../../poems/index.ts';
import type { PoemConfig } from '../../poems/types.ts';
import { lsGet, lsSet } from '../page.ts';

const MEM: Record<string, Promise<AslSwitchMaps>> = {};
const key = (poem: string) => 'asl-switches-' + poem;

function normalize(j: Partial<AslSwitchMaps> | null | undefined): AslSwitchMaps {
  return { enabled: j?.enabled || {}, trHidden: j?.trHidden || {}, urHidden: j?.urHidden || {} };
}
function cached(poem: string): AslSwitchMaps | null {
  try { const j = JSON.parse(lsGet(key(poem)) || 'null'); return j ? normalize(j) : null; } catch { return null; }
}
/** What applies before anything was ever fetched: the registered default. */
function defaults(p: PoemConfig | undefined): AslSwitchMaps {
  const enabled: Record<string, boolean> = {};
  if (p?.explanations?.defaultOn) for (const n of explanationBayts(p)) enabled[n] = true;
  return { enabled, trHidden: {}, urHidden: {} };
}

/** One request per matn per page; the cached copy, then the defaults, on failure. */
export function get(poem: string, p?: PoemConfig): Promise<AslSwitchMaps> {
  MEM[poem] ??= getSwitches(poem)
    .then((j) => { const maps = normalize(j); lsSet(key(poem), JSON.stringify(maps)); return maps; })
    .catch(() => cached(poem) || defaults(p));
  return MEM[poem]!;
}

/* Enforced with the idiom the page already uses for word-list abyāt: a class
   on the .verse and a rule that outranks the reader's own translation menu. */
function injectCSS(): void {
  if (document.getElementById('asl-switch-css')) return;
  const st = document.createElement('style');
  st.id = 'asl-switch-css';
  st.textContent = [
    '.verse.tr-off .translation{display:none !important}',
    '.verse.ur-off .translation-ur{display:none !important}',
    '.verse:not(.exp-on) .exp-toggle{display:none !important}',
    '.verse:not(.exp-on) .explanation{display:none !important}',
  ].join('');
  document.head.appendChild(st);
}

/* The medallion carries the verse number — the same way the data loader and
   the qirāʾāt panel find a verse without depending on chapter order. */
export function apply(maps: AslSwitchMaps): void {
  for (const v of document.querySelectorAll('#main .verse')) {
    const vn = v.querySelector('.medallion .vn') || v.querySelector('.vn');
    const n = parseInt((vn?.textContent || '').trim(), 10);
    if (!n) continue;
    const on = maps.enabled[n] === true;
    v.classList.toggle('exp-on', on);
    // A panel open when its switch went off must actually close.
    if (!on) v.classList.remove('showExp');
    v.classList.toggle('tr-off', maps.trHidden[n] === true);
    v.classList.toggle('ur-off', maps.urHidden[n] === true);
  }
}

export function init(): void {
  window.ASLSwitches = { get: (poem) => get(poem), apply };
  const ctx = window.ASL_POEM;
  if (!ctx) return; // not a reading page
  injectCSS();
  apply(cached(ctx.poem) || defaults(ctx.config)); // before the network, so nothing flashes
  void get(ctx.poem, ctx.config).then(apply);
}
