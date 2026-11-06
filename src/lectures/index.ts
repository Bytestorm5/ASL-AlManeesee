/* The lectures, newest first, how each is labelled and linked, and the
   checks the tests run on the registry and on the written texts. Nothing
   here imports a written text, so the app's menus can use it cheaply. */
import { LECTURES_PATH } from '../config/sections.ts';
import { LECTURE_REGISTRY } from './registry.ts';
import type { Lecture, LectureText } from './types.ts';

export type { Bilingual, Lecture, LectureBlock, LectureText } from './types.ts';

export const LECTURES: readonly Lecture[] = [...LECTURE_REGISTRY]
  .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

/** A lecture's date as the pages show it (US style): "Nov 6, 2026" (month 'short') or "November 6, 2026". */
export function lectureDate(d: string | undefined, month: 'short' | 'long' = 'short'): string {
  return d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { day: 'numeric', month, year: 'numeric', timeZone: 'UTC' }) : '';
}

const KIND_LABEL = { khutbah: 'Khuṭbah', lesson: 'Lesson', lecture: 'Lecture' } as const;
/** "Khuṭbah", "Lesson", "Lecture", or '' when the entry does not say. */
export function lectureKind(l: Lecture): string {
  return l.kind ? KIND_LABEL[l.kind] : '';
}
/** Where a lecture opens: its own page when it is written, else its card on /lectures. */
export function lectureHref(l: Lecture): string {
  return l.written ? `${LECTURES_PATH}/${l.id}` : `${LECTURES_PATH}#${l.id}`;
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
    if (l.kind && !(l.kind in KIND_LABEL)) out.push(`${l.id}: kind must be khutbah, lesson or lecture`);
    if (!l.media && !l.written) out.push(`${l.id}: needs media, or written: true with a text in content/lectures/`);
    if (l.media) {
      const u = l.media.url ?? '';
      if (!['youtube', 'audio', 'video'].includes(l.media.kind)) out.push(`${l.id}: media.kind must be youtube, audio or video`);
      if (!(u.startsWith('https://') || u.startsWith('/media/'))) out.push(`${l.id}: media.url must be https:// or /media/…`);
      if (l.media.kind === 'youtube' && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(u)) out.push(`${l.id}: a youtube lecture needs a YouTube link`);
    }
  }
  return out;
}

const ARABIC = /[\u0600-\u06EF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDF9\uFE70-\uFEFF]/;
const BLOCKS = ['part', 'head', 'p', 'ayah', 'quote'];
/** What is wrong with a written lecture's text: every block has Arabic and,
    under it, English (no Arabic letters in it, ﷺ aside); an āyah sits in
    ﴿ ﴾; the text opens with a heading or a part. */
export function lectureTextProblems(id: string, doc: LectureText): string[] {
  const out: string[] = [];
  const pair = (where: string, b: { ar?: unknown; en?: unknown } | undefined) => {
    if (typeof b?.ar !== 'string' || !ARABIC.test(b.ar)) out.push(`${id} ${where}: needs its Arabic`);
    if (typeof b?.en !== 'string' || !b.en.trim()) out.push(`${id} ${where}: needs its English`);
    else if (ARABIC.test(b.en)) out.push(`${id} ${where}: Arabic letters in the English`);
  };
  pair('title', doc.title);
  if (doc.kicker) pair('kicker', doc.kicker);
  (doc.byline ?? []).forEach((b, i) => pair(`byline ${i + 1}`, b));
  if (!doc.blocks?.length) out.push(`${id}: has no blocks`);
  (doc.blocks ?? []).forEach((b, i) => {
    const where = `block ${i + 1} (${b.t})`;
    if (!BLOCKS.includes(b.t)) { out.push(`${id} ${where}: unknown block type`); return; }
    pair(where, b);
    if (b.t === 'ayah') {
      if (!/^﴿[^]*﴾$/.test(b.ar.trim())) out.push(`${id} ${where}: an āyah is written in ﴿ ﴾`);
      if (b.ref) pair(where + ' ref', b.ref);
    }
  });
  if (doc.blocks?.[0] && !['part', 'head'].includes(doc.blocks[0].t)) out.push(`${id}: should open with a part or a heading`);
  return out;
}
