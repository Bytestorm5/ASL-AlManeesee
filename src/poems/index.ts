import { REGISTRY } from './registry.ts';
import { EXAMPLE_POEM } from './example.ts';
import type { PoemConfig } from './types.ts';

export type * from './types.ts';
export { ACCENTS } from './types.ts';

/* Replaced at build time: by Vite (astro.config.ts) for the pages, and by
   Wrangler (`--define`) for the worker. Where nothing defines it — a Node
   script such as `npm run pdf` — the same MUTUN_EXAMPLE=1 switch the build
   uses turns it on; otherwise it stays off. */
declare const __INCLUDE_EXAMPLE__: boolean | undefined;
const withExample = typeof __INCLUDE_EXAMPLE__ !== 'undefined'
  ? __INCLUDE_EXAMPLE__ === true
  : (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.MUTUN_EXAMPLE === '1';

/** Every registered matn, drafts included. */
export const ALL_POEMS: readonly PoemConfig[] = withExample ? [...REGISTRY, EXAMPLE_POEM] : REGISTRY;

/** The mutūn readers are offered: everything that is not a draft. */
export const POEMS: readonly PoemConfig[] = ALL_POEMS.filter((p) => !p.draft);

const BY_ID = new Map(ALL_POEMS.map((p) => [p.id, p]));

export function getPoem(id: string | null | undefined): PoemConfig | undefined {
  return id ? BY_ID.get(String(id)) : undefined;
}
export function isPoemId(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id);
}

/* ── recording sets ───────────────────────────────────────────────────────
   Each edition of a matn has its own set of recordings: edition 1 under the
   matn's own id, edition k under "<id>-n<k>", silent until someone uploads to
   it. A matn with a single edition has exactly one set. */
export interface AudioSet { id: string; poem: PoemConfig; nuskha: number; label: string }

export function audioSetsOf(p: PoemConfig): AudioSet[] {
  const names = p.nuskhas && p.nuskhas.length > 1 ? p.nuskhas : null;
  if (!names) return [{ id: p.id, poem: p, nuskha: 1, label: p.shortEn }];
  return names.map((name, i) => ({
    id: audioSetId(p.id, i + 1),
    poem: p,
    nuskha: i + 1,
    label: `${p.shortEn} — ${name}`,
  }));
}
export function audioSetId(poemId: string, nuskha: number): string {
  return nuskha <= 1 ? poemId : `${poemId}-n${nuskha}`;
}
export const ALL_AUDIO_SETS: readonly AudioSet[] = ALL_POEMS.flatMap(audioSetsOf);
const SET_BY_ID = new Map(ALL_AUDIO_SETS.map((s) => [s.id, s]));
export function getAudioSet(id: string | null | undefined): AudioSet | undefined {
  return id ? SET_BY_ID.get(String(id)) : undefined;
}

/** Which abyāt may carry an explanation card. */
export function explanationBayts(p: PoemConfig): number[] {
  return p.explanations?.bayts ?? Array.from({ length: p.verses }, (_, i) => i + 1);
}

/* ── registry sanity ──────────────────────────────────────────────────────
   Checked by the unit tests (tests/registry.test.ts), so a bad entry fails CI
   rather than producing a page that collides with a route. */
export const RESERVED_IDS = new Set([
  'admin', 'api', 'media', 'guide', 'privacy', 'fonts', 'brand', 'pdf', 'index',
  'sw', 'manifest', 'robots', 'sitemap', '404', '_astro', 'offline', 'audio',
]);
export function registryProblems(list: readonly PoemConfig[] = ALL_POEMS): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of list) {
    if (!/^[a-z][a-z0-9-]{0,40}$/.test(p.id)) out.push(`${p.id}: id must be lowercase latin letters, digits and dashes`);
    if (/-n\d+$/.test(p.id)) out.push(`${p.id}: ids ending in -n<digit> are reserved for edition recording sets`);
    if (RESERVED_IDS.has(p.id)) out.push(`${p.id}: id collides with a site route`);
    if (seen.has(p.id)) out.push(`${p.id}: registered twice`);
    seen.add(p.id);
    if (!Number.isInteger(p.verses) || p.verses < 1) out.push(`${p.id}: verses must be a positive whole number`);
    const an = p.audioNuskha ?? 1;
    if (an < 1 || an > Math.max(1, p.nuskhas?.length ?? 1)) out.push(`${p.id}: audioNuskha is out of range`);
    for (const n of p.explanations?.bayts ?? []) {
      if (!Number.isInteger(n) || n < 1 || n > p.verses) out.push(`${p.id}: explanation bayt ${n} is out of range`);
    }
  }
  return out;
}
