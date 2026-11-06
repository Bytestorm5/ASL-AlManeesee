/* The lectures, newest first, and the checks the tests run on the registry. */
import { LECTURE_REGISTRY } from './registry.ts';
import type { Lecture } from './types.ts';

export type { Lecture } from './types.ts';

export const LECTURES: readonly Lecture[] = [...LECTURE_REGISTRY]
  .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

/** A lecture's date as the pages show it: "6 Nov 2026" (month 'short') or "6 November 2026". */
export function lectureDate(d: string | undefined, month: 'short' | 'long' = 'short'): string {
  return d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month, year: 'numeric', timeZone: 'UTC' }) : '';
}

export function lectureProblems(list: readonly Lecture[] = LECTURE_REGISTRY): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const l of list) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(l.id)) out.push(`${l.id}: id must be lowercase letters, digits and dashes`);
    if (seen.has(l.id)) out.push(`${l.id}: listed twice`);
    seen.add(l.id);
    if (!l.title?.trim()) out.push(`${l.id}: needs a title`);
    if (l.date && !/^\d{4}-\d{2}-\d{2}$/.test(l.date)) out.push(`${l.id}: date must be yyyy-mm-dd`);
    const u = l.media?.url ?? '';
    if (!['youtube', 'audio', 'video'].includes(l.media?.kind)) out.push(`${l.id}: media.kind must be youtube, audio or video`);
    if (!(u.startsWith('https://') || u.startsWith('/media/'))) out.push(`${l.id}: media.url must be https:// or /media/…`);
    if (l.media?.kind === 'youtube' && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(u)) out.push(`${l.id}: a youtube lecture needs a YouTube link`);
  }
  return out;
}
