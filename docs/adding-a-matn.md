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
  accent: 'lagoon',                    // navy · royal · sky · lagoon · teal · midnight
  closing: { ar: 'وَالۡحَمۡدُ لِلَّهِ لَهَا خِتَامُ', en: '“And all praise is due to Allah upon its completion.”' },
  draft: true,                         // proof it on the live site before listing it
}
```

### Which section

The site has three sections (`src/config/sections.ts`): **His Poems** (mutūn
the Shaykh composed), **His Explanations** (his sharḥ of a classical matn)
and **Lectures**. A matn is in His Poems unless its entry says otherwise. For
one of the Shaykh's explanations of a classical matn, set

```ts
  section: 'shuruh',
  author: { name: 'Imām Ibn al-Jazarī', died: '833 AH' },   // the matn's own author
  explanations: { by: 'Shaykh Dr Waleed Idris al-Meneese', defaultOn: true },
```

The Explanations section is hidden for now (`hidden: true` on it in
`src/config/sections.ts`): remove that line when the first explanation is
ready, or `npm test` refuses the entry.

`author` stays the classical matn's author; `explanations.by` names the
Shaykh's explanation, which is what the reader opens under each bayt. The
matn then lists under His Explanations on Home and in the app's Collection,
its **Mutūn ▾** menu lists the other explanations, and the rest works as
for any matn.

Lectures are not mutūn: they are entries in `src/lectures/registry.ts`
(title, date, series, and a YouTube link or an audio/video file), shown on
`/lectures` and in the Lectures section. A **written** one (a khuṭbah or a
lesson the Shaykh wrote out) is an entry with `written: true` and its text in
`content/lectures/<id>.json`, listed in `content/lectures/index.ts`: blocks of
`part`, `head`, `p`, `ayah` (in ﴿ ﴾, with a `ref`) and `quote`, each with its
`ar` and the `en` under it (`LectureText`, `src/lectures/types.ts`). It is
read at `/lectures/<id>`. `npm test` checks the entries and that every block
of a written text has both languages.

### Collections of poems

A book that collects several poems is still one matn: each poem is a
chapter, `chapterLabel: 'Poem'` names them so, `numbering: 'per-chapter'`
starts every poem's abyāt at 1 (the stored `n` keeps running through the
book and stays each bayt's identity), and a chapter's `part: {ar, en}` puts
consecutive poems under one part (bāb) heading.

Optional features switch on per matn: `explanations` (with `by` for the
attribution and `defaultOn` when the commentary is already checked),
`nuskhas` (two or more editions — the wording of edition 2+ goes in the
document's `variants`), `kindLabels` (word-list abyāt), `arabicInUrdu`,
`qiraat` (the qirāʾāt panels) and `pdf`.

`npm test` checks the registry (ids that collide with a route, verse counts,
edition settings).

Registering it generates the reading page, its card in its section on the
home page and in the guide, its entry in every menu and editor, its recording sets, the
sitemap and the offline precache. Deploy.

## 2. Give it its text

**With the deploy.** Put the finished document (`{id, chapters}`, in the
format `/not-an-admin/import` saves) at `content/<id>.json` and list it in
`content/index.ts`. The first time anything asks the API for the matn, the
worker stores that file in R2 (`src/worker/seed.ts`), checked against the
same rules as an import. The write is create-only, so it never replaces a
stored copy: once the text is stored, R2 is the live version and the file in
`content/` is only its record of origin.

**Or by importing it.** Open `/not-an-admin/import`, pick the matn, paste or load the text, check the
preview and create it. A finished document (a `.json` with its chapters,
like the files under `content/`) can be loaded there too, or stored from a
terminal with `ASL_PASSWORD=… node scripts/import.ts --file <file> --write`. The document is validated against the same rules
every later edit is held to (`src/shared/poem-data.ts`): verse count, markup
vocabulary, word cells that join back to their hemistich.

Then, as the content arrives:

| What | Where |
| --- | --- |
| Fix a bayt's wording, word cells, rumūz | `/not-an-admin/editor` |
| Translations, explanations, visibility switches, qirāʾāt cards | `/not-an-admin/content` |
| Word meanings, translations or explanations in bulk (JSON) | `/not-an-admin/loader`, or `node scripts/load.ts` — formats in `docs/data-formats.md` |
| Recitations | `/not-an-admin/upload`, managed in `/not-an-admin/recordings` |
| PDFs (`pdf` in the registration) | `npm run pdf`, then commit `public/pdf/<id>/` |

## 3. Publish

Remove `draft: true` and deploy. The matn now appears on the home page, in
the menus, the sitemap and the offline precache.

## Trying it locally

`npm run dev:example` runs the whole stack with a built-in example matn
(`src/poems/example.ts`, text in `fixtures/`); `npm run seed:example` loads
its text into the local bucket. It is the quickest way to see what a
registration field does before using it on real content.
