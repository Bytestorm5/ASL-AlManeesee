import type { Lecture } from './types.ts';

/* ═══════════════════════════════════════════════════════════════════════════
   The Shaykh's khuṭbahs, books, lessons and lectures. Each is shown in the
   section its `kind` belongs to (src/config/sections.ts: Khuṭbahs, Books,
   Lectures), on that section's page and on Home, by `date`, newest first (src/lectures/
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
  {
    id: 'qaswat-al-qalb',
    title: 'Hardness of the Heart',
    titleAr: 'قَسْوَةُ الْقَلْبِ',
    kind: 'book',
    date: '2015', // first edition, 1436 AH / 2015
    dateHijri: '1436 AH',
    description: 'Its causes, signs and cure: how sins, neglected voluntary worship, music, idle talk and too much joking harden the heart, how a hard heart shows in a lack of mercy, and how admonition, the Qurʾān, remembrance of Allah and caring for the poor soften it again.',
    written: true,
  },
  /* سِلْسِلَةُ خُطَبٍ عَنِ الْيَوْمِ الْآخِرِ: ten khuṭbahs on the Last Day, from the
     Shaykh's book of that name (Islamic University of Minnesota Press). The
     book gives no dates, so they list after the dated khuṭbahs, in its order. */
  {
    id: 'al-iman-bil-yawm-al-akhir',
    title: 'Belief in the Last Day and the First Scenes of the Resurrection',
    titleAr: 'الْإِيمَانُ بِالْيَوْمِ الْآخِرِ وَأَوَّلُ مَشَاهِدِ الْقِيَامَةِ',
    kind: 'khutbah',
    series: 'The Last Day, 1 of 10',
    description: 'The Last Day as a pillar of īmān, its names in the Qurʾān and why its time is hidden; then the first scene of the Resurrection: the blast on the Trumpet at which all creation swoons, and whom Allah excepts.',
    written: true,
  },
  {
    id: 'tayy-al-kawn',
    title: 'The Folding Up of the Universe and the Land of the Gathering',
    titleAr: 'طَيُّ الْكَوْنِ وَأَرْضُ الْمَحْشَرِ',
    kind: 'khutbah',
    series: 'The Last Day, 2 of 10',
    description: 'The upheavals between the two blasts of the Trumpet: the rain from which bodies grow again, the earth grasped and the heavens folded up, the openings of al-Takwīr and al-Infiṭār, and the white, level land of the Gathering.',
    written: true,
  },
  {
    id: 'nafkhat-al-bath',
    title: 'The Blast of Resurrection and People Rising from Their Graves',
    titleAr: 'نَفْخَةُ الْبَعْثِ وَقِيَامُ النَّاسِ مِنْ قُبُورِهِمْ',
    kind: 'khutbah',
    series: 'The Last Day, 3 of 10',
    description: 'The second blast of the Trumpet: bodies grow from a rain like dew, souls return to them, and all creation rises from the graves and hastens to the Caller. The state of the criminals that Day, and the good news that it will be easy for the believers.',
    written: true,
  },
  {
    id: 'ahwal-al-nas-fil-hashr',
    title: 'The States of People at the Gathering',
    titleAr: 'أَحْوَالُ النَّاسِ فِي الْحَشْرِ',
    kind: 'khutbah',
    series: 'The Last Day, 4 of 10',
    description: 'How people are gathered: barefoot, naked and uncircumcised, then clothed by their deeds; some ride, some walk and some are driven by the Fire. And the forms their deeds take, from the pilgrim’s talbiyah and the martyr’s wound to the betrayer’s banner.',
    written: true,
  },
  {
    id: 'dunuww-al-shams',
    title: 'The Sun Drawing Near, Those Shaded by the Throne, and the Pond of the Prophet ﷺ',
    titleAr: 'دُنُوُّ الشَّمْسِ وَالْمُسْتَظِلُّونَ فِي ظِلِّ الْعَرْشِ وَحَوْضُ النَّبِيِّ ﷺ',
    kind: 'khutbah',
    series: 'The Last Day, 5 of 10',
    description: 'The sun drawn near and people sweating by their deeds, the believers Allah shades in the shade of His Throne, and the Pond of the Prophet ﷺ: its size and water, who comes to it first, and who is driven away from it.',
    written: true,
  },
  {
    id: 'al-shafaah-al-uzma',
    title: 'The Great Intercession and the Kinds of Intercession',
    titleAr: 'الشَّفَاعَةُ الْعُظْمَى وَأَنْوَاعُ الشَّفَاعَاتِ',
    kind: 'khutbah',
    series: 'The Last Day, 6 of 10',
    description: 'How the people at the Gathering go from prophet to prophet asking for intercession, until the Prophet ﷺ makes the Great Intercession, the Praised Station; then the other intercessions of the Last Day, and the two conditions every intercession needs.',
    written: true,
  },
  {
    id: 'al-ard-wal-hisab',
    title: 'The Presentation, the Reckoning and Its Principles',
    titleAr: 'الْعَرْضُ وَالْحِسَابُ وَقَوَاعِدُهُ',
    kind: 'khutbah',
    series: 'The Last Day, 7 of 10',
    description: 'The presentation of all creation before Allah, the believer’s easy reckoning, and how disbelievers, hypocrites and Muslims are reckoned; then its principles: perfect justice, each soul bearing its own burden, good deeds multiplied, and ṣalāh the first thing asked about.',
    written: true,
  },
  {
    id: 'tatayur-al-suhuf',
    title: 'The Flying of the Scrolls and the Setting Up of the Scales',
    titleAr: 'تَطَايُرُ الصُّحُفِ وَنَصْبُ الْمَوَازِينِ',
    kind: 'khutbah',
    series: 'The Last Day, 8 of 10',
    description: 'The nations fall to their knees and the scrolls of deeds fly, taken in the right hand or the left; then the Scales are set up, and the three things weighed in them: the deeds, the scrolls, with the hadith of the card, and the doer himself.',
    written: true,
  },
  {
    id: 'al-murur-ala-al-sirat',
    title: 'Crossing the Ṣirāṭ and the Halt at al-Qanṭarah',
    titleAr: 'الْمُرُورُ عَلَى الصِّرَاطِ وَالْوُقُوفُ عَلَى الْقَنْطَرَةِ',
    kind: 'khutbah',
    series: 'The Last Day, 9 of 10',
    description: 'Every nation follows what it worshipped into Jahannam; the believers cross the Ṣirāṭ by the light of their īmān while the hypocrites’ light goes out; then they are held at al-Qanṭarah to settle the wrongs between them, and intercede for their brothers in the Fire.',
    written: true,
  },
  {
    id: 'khitam-mashahid-al-qiyamah',
    title: 'The Final Scenes of the Resurrection: The Bliss of the People of Jannah and the Punishment of the People of the Fire',
    titleAr: 'خِتَامُ مَشَاهِدِ الْقِيَامَةِ: نَعِيمُ أَهْلِ الْجَنَّةِ وَعَذَابُ أَهْلِ النَّارِ',
    kind: 'khutbah',
    series: 'The Last Day, 10 of 10',
    description: 'Death slaughtered between Jannah and the Fire; the gates, ranks, rivers, fruits and spouses of Jannah; and the canopies, garments, food and drink of the people of the Fire.',
    written: true,
  },
];
