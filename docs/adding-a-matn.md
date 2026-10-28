# Adding a matn

A matn is two things: a **registration** in code, and its **text** in storage.

## 1. Register it

Add an entry to `src/poems/registry.ts`. The fields are documented on
`PoemConfig` in `src/poems/types.ts`; a minimal one:

```ts
{
  id: 'tuhfah',                       // the page is /tuhfah — lowercase, digits, dashes
  titleAr: 'تُحْفَةُ الأَطْفَالِ',
  shortAr: 'التُّحْفَة',
  titleEn: 'Tuḥfat al-Aṭfāl',
  shortEn: 'Tuḥfah',
  description: 'Shaykh Sulaymān al-Jamzūrī’s beginner’s poem on the rules of nūn sākinah, tanwīn and madd.',
  subject: 'The Science of Tajwīd',
  author: { name: 'Shaykh Sulaymān al-Jamzūrī', died: '1198 AH' },
  metre: 'Rajaz',
  verses: 61,                          // every upload is checked against this
  accent: 'sienna',                    // madder · lapis · verdigris · indigo · plum · sienna · teal
  closing: { ar: 'وَالۡحَمۡدُ لِلَّهِ لَهَا خِتَامُ', en: '“And all praise is due to Allah upon its completion.”' },
  draft: true,                         // proof it on the live site before listing it
}
```

Optional features switch on per matn: `explanations` (with `by` for the
attribution and `defaultOn` when the commentary is already checked),
`nuskhas` (two or more editions — the wording of edition 2+ goes in the
document's `variants`), `kindLabels` (word-list abyāt), `arabicInUrdu`,
`qiraat` (the qirāʾāt panels) and `pdf`.

`npm test` checks the registry (ids that collide with a route, verse counts,
edition settings).

Registering it generates the reading page, its card on the home page and in
the guide, its entry in every menu and editor, its recording sets, the
sitemap and the offline precache. Deploy.

## 2. Import the text

Open `/admin/import`, pick the matn, paste or load the text, check the
preview and create it. The document is validated against the same rules
every later edit is held to (`src/shared/poem-data.ts`): verse count, markup
vocabulary, word cells that join back to their hemistich.

Then, as the content arrives:

| What | Where |
| --- | --- |
| Fix a bayt's wording, word cells, rumūz | `/admin/editor` |
| Translations, explanations, visibility switches, qirāʾāt cards | `/admin/content` |
| Word meanings, translations or explanations in bulk (JSON) | `/admin/loader`, or `node scripts/load.ts` — formats in `docs/data-formats.md` |
| Recitations | `/admin/upload`, managed in `/admin/recordings` |
| PDFs (`pdf` in the registration) | `npm run pdf`, then commit `public/pdf/<id>/` |

## 3. Publish

Remove `draft: true` and deploy. The matn now appears on the home page, in
the menus, the sitemap and the offline precache.

## Trying it locally

`npm run dev:example` runs the whole stack with a built-in example matn
(`src/poems/example.ts`, text in `fixtures/`); `npm run seed:example` loads
its text into the local bucket. It is the quickest way to see what a
registration field does before using it on real content.
