import type { Lecture } from './types.ts';

/* ═══════════════════════════════════════════════════════════════════════════
   The Shaykh's lessons, lectures and khuṭbahs, shown on /lectures and in the
   home page's Lectures section by `date`, newest first (src/lectures/
   index.ts sorts them; one without a date goes last, and two on the same
   date keep the order they have here).

   A recorded one is an entry with `media` (a YouTube link, or an audio or
   video file) and a deploy, e.g.
     {
       id: 'jazariyyah-01',
       title: 'Explanation of al-Muqaddimah al-Jazariyyah — Lesson 1',
       titleAr: 'شَرْحُ الْمُقَدِّمَةِ الْجَزَرِيَّةِ — الدَّرْسُ الْأَوَّلُ',
       kind: 'lesson', series: 'Explanation of al-Jazariyyah',
       date: '2026-01-15', minutes: 52,
       media: { kind: 'youtube', url: 'https://www.youtube.com/watch?v=…' },
     },
   A written one is an entry with `written: true` and its text in
   content/lectures/<id>.json (listed in content/lectures/index.ts): Arabic
   paragraph by paragraph, the English under each. It is read at
   /lectures/<id>. It can carry `media` too. A translation that comes without
   its Arabic is `"languages": "en"` in that file, with its `translator`.
   ═══════════════════════════════════════════════════════════════════════════ */
export const LECTURE_REGISTRY: Lecture[] = [
  {
    id: 'husn-al-khuluq',
    title: 'Good Character',
    titleAr: 'حُسْنُ الْخُلُقِ',
    kind: 'khutbah',
    date: '2015-11-16', // as almenesi.com dates it
    description: 'The greatness of the Prophet’s ﷺ character, the virtue and reward of good character, what it truly is, how it is both inborn and acquired, and why perfecting noble character was a purpose of his mission.',
    written: true,
  },
  {
    id: 'ahwal-al-qulub',
    title: 'Conditions of the Hearts',
    titleAr: 'أَحْوَالُ الْقُلُوبِ',
    kind: 'khutbah',
    series: 'No. 1630',
    date: '2015-11-16', // as almenesi.com dates it
    description: 'How temptations mark the heart, the kinds of hearts, and the signs of a sick heart: on the danger of temptations, and how mistakes taken lightly damage the heart over time.',
    written: true,
  },
  {
    id: 'al-qabul',
    title: 'Acceptance',
    titleAr: 'الْقَبُولُ',
    kind: 'khutbah',
    place: 'AMJA Imams’ Conference, Dallas',
    date: '2026-08-28',
    dateHijri: '15 Rabīʿ al-Awwal 1448 AH',
    description: 'Why the righteous feared their deeds would not be accepted, what ruins a deed, and the qualities of those whose deeds Allah accepts.',
    written: true,
  },
];
