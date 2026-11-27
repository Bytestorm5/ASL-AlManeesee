/* The sections of the site: what the Shaykh composed, what he explained, his
   khuṭbahs, his books and what he taught aloud. The home page shows one
   section at a time (a switch, not lists one after another), the app's
   Collection sheet the same, and a matn's own pages stay within its section.

   A matn joins a text section through `section` in its registry entry
   (default 'mutun'). The other sections are lists from the lecture registry
   (src/lectures/registry.ts): an entry goes to the section whose `list.kinds`
   holds its kind, and each list has its own page (`list.path`). Rename or
   reword a section here and every page follows. A section marked `hidden` is
   left out of every switch, menu and page (SHOWN_SECTIONS) until the line is
   removed; the tests refuse an entry in one, and a hidden list's page
   forwards to the first shown list. */
import type { LectureKind } from '../lectures/types.ts';

export type TextSectionId = 'mutun' | 'shuruh';
export type ListSectionId = 'khutab' | 'kutub' | 'lectures';
export type SectionId = TextSectionId | ListSectionId;

export interface Section {
  id: SectionId;
  /** Arabic name, vowelled. */
  ar: string;
  /** A shorter Arabic name, for a tab on a narrow phone. */
  arShort: string;
  /** English name, short enough for a tab. */
  en: string;
  /** One word, for the app's narrow sheet switch. */
  short: string;
  /** One sentence under the section's heading. */
  lead: string;
  /** What an empty section says while it is being prepared. */
  empty: { title: string; text: string };
  /** Kept out of sight for now: no tab, no menu link, no guide entry. */
  hidden?: boolean;
  /** A list from the lecture registry: the kinds it holds, its page, and
      what one and several of them are called ("khuṭbah", "khuṭbahs"). */
  list?: { kinds: readonly LectureKind[]; path: string; one: string; many: string };
}

export const SECTIONS: readonly Section[] = [
  {
    id: 'mutun',
    ar: 'الْمَنْظُومَاتُ',
    arShort: 'الْمَنْظُومَاتُ',
    en: 'His Poems',
    short: 'Poems',
    lead: 'Mutūn the Shaykh composed himself, bayt by bayt, with their translation and explanation.',
    empty: {
      title: 'His poems are being prepared',
      text: 'The first of the Shaykh’s poems are being edited and checked. Each will appear here, ready to read and to memorize, as soon as it is published.',
    },
  },
  {
    id: 'shuruh',
    ar: 'الشُّرُوحُ',
    arShort: 'الشُّرُوحُ',
    en: 'His Explanations',
    short: 'Explanations',
    hidden: true, // not shown for now; remove this line to bring the section back
    lead: 'The Shaykh’s explanations of the classical mutūn, bayt by bayt.',
    empty: {
      title: 'His explanations are being prepared',
      text: 'The Shaykh has explained many of the classical mutūn. Each explanation will appear here with its matn, ready to read and to memorize, as soon as it is published.',
    },
  },
  {
    id: 'khutab',
    ar: 'الْخُطَبُ',
    arShort: 'الْخُطَبُ',
    en: 'Khuṭbahs',
    short: 'Khuṭbahs',
    lead: 'The Shaykh’s khuṭbahs, to read, listen to or watch.',
    empty: {
      title: 'His khuṭbahs are being gathered',
      text: 'The Shaykh’s khuṭbahs are being gathered and checked. Each will appear here, in his Arabic with the English under it, as it is published.',
    },
    list: { kinds: ['khutbah'], path: '/khutbahs', one: 'khuṭbah', many: 'khuṭbahs' },
  },
  {
    id: 'kutub',
    ar: 'الْكُتُبُ',
    arShort: 'الْكُتُبُ',
    en: 'Books',
    short: 'Books',
    lead: 'The Shaykh’s books, in his Arabic with the English under every paragraph.',
    empty: {
      title: 'His books are being prepared',
      text: 'The Shaykh’s books are being typeset and translated. Each will appear here, ready to read, as it is published.',
    },
    list: { kinds: ['book'], path: '/books', one: 'book', many: 'books' },
  },
  {
    id: 'lectures',
    ar: 'الدُّرُوسُ وَالْمُحَاضَرَاتُ',
    arShort: 'الدُّرُوسُ',
    en: 'Lectures',
    short: 'Lectures',
    hidden: true, // until the first lesson or lecture is added; remove this line then
    lead: 'The Shaykh’s lessons and lectures, to read, listen to or watch.',
    empty: {
      title: 'His lectures are being gathered',
      text: 'The Shaykh’s lessons and lectures are being gathered and checked. They will appear here, to listen to or watch, as they are published.',
    },
    list: { kinds: ['lesson', 'lecture'], path: '/lectures', one: 'lecture', many: 'lectures' },
  },
];

/** The sections readers see, in order: every one not marked `hidden`. */
export const SHOWN_SECTIONS: readonly Section[] = SECTIONS.filter((s) => !s.hidden);

/** Where a written khuṭbah, book or lecture is read: /lectures/<id>, whatever its section. */
export const LECTURES_PATH = '/lectures';

/** A section that lists entries of the lecture registry (Khuṭbahs, Books, Lectures). */
export type ListSection = Section & { id: ListSectionId; list: NonNullable<Section['list']> };
export function isListSection(s: Section): s is ListSection {
  return !!s.list;
}
/** The shown list sections, in order. */
export const SHOWN_LISTS: readonly ListSection[] = SHOWN_SECTIONS.filter(isListSection);

export function sectionById(id: SectionId): Section {
  return SECTIONS.find((s) => s.id === id)!;
}
