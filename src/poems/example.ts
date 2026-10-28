import type { PoemConfig } from './types.ts';

/* A development fixture, not content: a short matn that exercises every
   feature of the reading page (word glosses, red ink, a ramz, both
   translations, an explanation, two editions, a word-list bayt, a qirāʾāt
   panel, PDFs).

   It is registered only when the build is asked for it — `npm run dev:example`
   and the end-to-end tests — and never in a production build. Its text is in
   fixtures/example-poem.json and is loaded into the local R2 bucket by
   `npm run seed:example`. */
export const EXAMPLE_POEM: PoemConfig = {
  id: 'example',
  titleAr: 'المَنْظُومَةُ المِثَالِيَّة',
  shortAr: 'المِثَالِيَّة',
  titleEn: 'The Example Matn',
  shortEn: 'Example',
  description: 'A short development fixture that exercises every feature of the reading page.',
  subject: 'Development fixture',
  author: { name: 'Fixture author', died: '—' },
  metre: 'Rajaz',
  verses: 8,
  accent: 'lapis',
  closing: { ar: 'وَالۡحَمۡدُ لِلَّهِ لَهَا خِتَامُ', en: '“And all praise is due to Allah upon its completion.”' },
  draft: true,
  explanations: { by: 'Example commentary', defaultOn: true },
  nuskhas: ['Nuskh 1', 'Nuskh 2'],
  kindLabels: { list: 'Word list' },
  arabicInUrdu: true,
  qiraat: true,
  pdf: { whole: true, chapters: true },
};
