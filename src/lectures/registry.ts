import type { Lecture } from './types.ts';

/* ═══════════════════════════════════════════════════════════════════════════
   The Shaykh's lectures. Empty for now: /lectures and the home page's
   Lectures section show "being gathered" until the first one is added.

   Adding one is an entry here and a deploy, e.g.
     {
       id: 'jazariyyah-01',
       title: 'Explanation of al-Muqaddimah al-Jazariyyah — Lesson 1',
       titleAr: 'شَرْحُ الْمُقَدِّمَةِ الْجَزَرِيَّةِ — الدَّرْسُ الْأَوَّلُ',
       series: 'Explanation of al-Jazariyyah',
       date: '2026-01-15', minutes: 52,
       media: { kind: 'youtube', url: 'https://www.youtube.com/watch?v=…' },
     },
   ═══════════════════════════════════════════════════════════════════════════ */
export const LECTURE_REGISTRY: Lecture[] = [
];
