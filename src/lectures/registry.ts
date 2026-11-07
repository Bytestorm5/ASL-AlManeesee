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
    id: 'sunan-eid-al-fitr',
    title: 'The Sunnahs of ʿĪd al-Fiṭr',
    titleAr: 'سُنَنُ عِيدِ الْفِطْرِ',
    kind: 'khutbah',
    date: '2015-11-16', // as almenesi.com dates it
    description: 'Zakat al-Fiṭr, when and how to say the takbīr, joy and fine clothes on ʿĪd, women at the ʿĪd prayer, walking to it, eating dates first, and not taking part in the festivals of the polytheists.',
    written: true,
  },
  {
    id: 'hikam-al-siyam',
    title: 'The Wisdom and Etiquette of Fasting',
    titleAr: 'حِكَمُ الصِّيَامِ وَآدَابُهُ',
    kind: 'khutbah',
    date: '2015-11-16', // as almenesi.com dates it
    description: 'Fourteen of the wisdoms behind the fast of Ramadan, from purifying the soul to its health benefits, and five points of its etiquette, from the pre-dawn meal to breaking the fast.',
    written: true,
  },
  {
    id: 'fadail-ramadan',
    title: 'The Virtues of Ramadan',
    titleAr: 'فَضَائِلُ رَمَضَانَ',
    kind: 'khutbah',
    date: '2015-11-16', // as almenesi.com dates it
    description: 'Welcoming Ramadan and not wasting it, the longing of the righteous to reach it, a call to repent, its virtues from the Sunnah, and how the month is established: by sighting the new moon, not by astronomical calculation.',
    written: true,
  },
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
