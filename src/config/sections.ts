/* The sections of the site: what the Shaykh composed, what he explained, and
   what he taught aloud. The home page shows one section at a time (a switch,
   not three lists one after another), the app's Collection sheet the same,
   and a matn's own pages stay within its section.

   A matn joins a section through `section` in its registry entry (default
   'mutun'); lectures live in their own registry (src/lectures/registry.ts).
   Rename or reword a section here and every page follows. */

export type TextSectionId = 'mutun' | 'shuruh';
export type SectionId = TextSectionId | 'lectures';

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
    lead: 'The Shaykh’s explanations of the classical mutūn, bayt by bayt.',
    empty: {
      title: 'His explanations are being prepared',
      text: 'The Shaykh has explained many of the classical mutūn. Each explanation will appear here with its matn, ready to read and to memorize, as soon as it is published.',
    },
  },
  {
    id: 'lectures',
    ar: 'الدُّرُوسُ وَالْمُحَاضَرَاتُ',
    arShort: 'الدُّرُوسُ',
    en: 'Lectures',
    short: 'Lectures',
    lead: 'The Shaykh’s lessons, lectures and khuṭbahs, to read, listen to or watch.',
    empty: {
      title: 'His lectures are being gathered',
      text: 'The Shaykh’s lessons and lectures are being gathered and checked. They will appear here, to listen to or watch, as they are published.',
    },
  },
];

export const LECTURES_PATH = '/lectures';

export function sectionById(id: SectionId): Section {
  return SECTIONS.find((s) => s.id === id)!;
}
