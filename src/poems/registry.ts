import type { PoemConfig } from './types.ts';

/* ═══════════════════════════════════════════════════════════════════════════
   The mutūn this site serves, in the order the home page lists them.

   Adding one is two steps (docs/adding-a-matn.md has the details):
     1. Add an entry here — the reading page /<id>, the home page card, the
        menus, the editors' poem pickers, the sitemap and the offline precache
        all follow from it.
     2. Give it its text: either a file in content/ (listed in
        content/index.ts), which the worker stores the first time the matn is
        asked for, or an import at /not-an-admin/import after deploying. Until one
        of them happens the page shows "the text could not be loaded".

   Set `draft: true` to proof a new matn on the live site before listing it.
   ═══════════════════════════════════════════════════════════════════════════ */
export const REGISTRY: PoemConfig[] = [
  {
    id: 'zad-al-huffaz',
    titleAr: 'زَادُ الْحُفَّاظِ',
    shortAr: 'زَادُ الْحُفَّاظِ',
    titleEn: 'Zād al-Ḥuffāẓ',
    shortEn: 'Zād al-Ḥuffāẓ',
    description:
      'Two short poems by Shaykh Dr Waleed Idris al-Meneese: the conditions a student needs in order to learn, and how to memorise, keep and carry what he learns. With the commentary of Abdullah Badat.',
    subject: 'Provision for the Memorisers',
    author: { name: 'Shaykh Dr Waleed Idris al-Meneese' },
    metre: 'Rajaz',
    verses: 10,
    accent: 'navy',
    closing: { ar: 'وَاللَّهُ وَلِيُّ التَّوْفِيقِ', en: '“And Allah is the Granter of success.”' },
    explanations: { by: 'Abdullah Badat, Zād al-Ḥuffāẓ', defaultOn: true },
  },
  {
    id: 'siyasah-shariyyah',
    titleAr: 'السُّبُلُ الْمَرْعِيَّةُ فِي السِّيَاسَةِ الشَّرْعِيَّةِ',
    shortAr: 'السِّيَاسَةُ الشَّرْعِيَّةُ',
    titleEn: 'As-Subul al-Marʿiyyah fī as-Siyāsah ash-Sharʿiyyah',
    shortEn: 'As-Siyāsah ash-Sharʿiyyah',
    description:
      'Shaykh Dr Waleed Idris al-Meneese’s poem on Islamic governance: the Imāmah, the conditions, duties and rights of the Imām, how he is appointed, the bayʿah, and when he may be removed. With the Shaykh’s commentary, translated and presented by Abdullah Badat.',
    subject: 'Islamic Governance',
    author: { name: 'Shaykh Dr Waleed Idris al-Meneese' },
    metre: 'Rajaz',
    verses: 43,
    accent: 'teal',
    closing: { ar: 'وَالْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ', en: '“And all praise is for Allah, Lord of the worlds.”' },
    explanations: { by: 'Shaykh Dr Waleed al-Meneese’s commentary, tr. Abdullah Badat', defaultOn: true },
  },
];
