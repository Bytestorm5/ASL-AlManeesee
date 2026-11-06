import type { Lecture } from './types.ts';

/* ═══════════════════════════════════════════════════════════════════════════
   The Shaykh's lessons, lectures and khuṭbahs, shown on /lectures and in the
   home page's Lectures section, newest first.

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
   /lectures/<id>. It can carry `media` too.
   ═══════════════════════════════════════════════════════════════════════════ */
export const LECTURE_REGISTRY: Lecture[] = [
  {
    id: 'al-qabul',
    title: 'Acceptance',
    titleAr: 'القبول',
    kind: 'khutbah',
    place: 'AMJA Imams’ Conference, Dallas',
    date: '2026-08-28',
    dateHijri: '15 Rabīʿ al-Awwal 1448 AH',
    description: 'Why the righteous feared their deeds would not be accepted, what ruins a deed, and the qualities of those whose deeds Allah accepts.',
    written: true,
  },
];
