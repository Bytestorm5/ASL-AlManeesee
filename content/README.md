# content/

The first import of each matn, bundled into the worker. A matn listed in
`index.ts` whose text is not stored yet is stored from its file here the
first time the API is asked for it (`src/worker/seed.ts`), so its text is
live on the deploy that adds it. The write is create-only: once a copy is
stored in R2 (`data/poem/<id>.json`) that copy is the live text, edited in
`/not-an-admin`, and the file here is not updated. It is a starting point, not the
current version.

| File | Matn | Source |
| --- | --- | --- |
| `zad-al-huffaz.json` | Zād al-Ḥuffāẓ (`/zad-al-huffaz`) | *Zād al-Ḥuffāẓ: Provision for the Memorisers*, Abdullah Badat's commentary on two poems of Shaykh Dr Waleed Idris al-Meneese (Athar Publishing). The verse text, the translations and the commentary are the book's. The word-by-word meanings follow the commentary's own word studies. |
| `siyasah-shariyyah.json` | As-Subul al-Marʿiyyah fī as-Siyāsah ash-Sharʿiyyah (`/siyasah-shariyyah`) | *The Islamic Version of Politics*, Abdullah Badat's translation and presentation of Shaykh Dr Waleed Idris al-Meneese's commentary on his own 43-bayt poem. The verse text, the verse translations and the commentary are the book's; the word-by-word meanings are written for this site. |
| `durar-walidiyyah.json` | Al-Durar al-Walīdiyyah (`/durar-walidiyyah`) | *al-Durar al-Walīdiyyah*, Abdullah Badat's collection of 44 poems by Shaykh Dr Waleed ibn Idris al-Meneese in three abwāb, with his explanation and commentary. Verse text, titles, translations and commentary are the book's (tables as lists); the word-by-word meanings are written for this site. |

`lectures/` holds the written lectures and khuṭbahs (`lectures/index.ts`
lists them): unlike a matn they are built into their page, `/lectures/<id>`,
so a change to one is a deploy.

| File | Lecture | Source |
| --- | --- | --- |
| `lectures/sunan-eid-al-fitr.json` | Sunan ʿĪd al-Fiṭr, The Sunnahs of ʿĪd al-Fiṭr (`/lectures/sunan-eid-al-fitr`) | The Shaykh's Arabic (from almenesi.com; first khuṭbah only), fully vowelled, with a US-English translation written for this site under each block. Besides the vowels: ﷺ restored after النبي and رسول الله, and رضي الله عنه after Ibn Masʿūd, where the copy had lost the site's glyphs; the three āyāt in ﴿ ﴾ with references under them; quotations in « »; paragraphs holding an āyah or a quotation split around it. Its seven summary points head its sections. |
| `lectures/hikam-al-siyam.json` | Ḥikam al-Ṣiyām wa Ādābuh, The Wisdom and Etiquette of Fasting (`/lectures/hikam-al-siyam`) | The Shaykh's Arabic (from almenesi.com; both khuṭbahs), fully vowelled, with a US-English translation written for this site under each block. Besides the vowels: ﷺ restored where the copy had lost the site's glyph; the five āyāt in ﴿ ﴾ with references under them; quotations in « »; in the summary, الحكم read الحلم (as point 7 has it), ويدعوا read ويدعو, and ثمرات read تمرات (as the etiquette's point 4 has it). |
| `lectures/fadail-ramadan.json` | Faḍāʾil Ramaḍān, The Virtues of Ramadan (`/lectures/fadail-ramadan`) | The Shaykh's Arabic (from almenesi.com; both khuṭbahs), fully vowelled, with a US-English translation written for this site under each block. Besides the vowels: ﷺ restored where the copy had lost the site's glyph, the two āyāt (al-Baqarah 2:185, al-Ḥāqqah 69:24) written in the site's ordinary script with their references under them, quotations in « », the poem's kashīdas dropped and its lines set one hemistich each, and two long paragraphs split at their own sentence breaks. The khuṭbah's five summary points head its sections. |
| `lectures/husn-al-khuluq.json` | Ḥusn al-Khuluq, Good Character (`/lectures/husn-al-khuluq`) | The Shaykh's Arabic (from almenesi.com; first khuṭbah only), fully vowelled, with a US-English translation written for this site under each block. Besides the vowels: ﷺ and رضي الله عنه restored where the copy had lost the site's glyphs, ﴿ ﴾ and references added to al-Qalam 68:4 and al-ʿAnkabūt 29:69, quotations set in « », أحسانكم read أحاسنكم (as in al-Tirmidhī), تعلى read تعالى, and "من الأخلاق ذميمة" read "من أخلاق ذميمة". The khuṭbah's six summary points head its sections. |
| `lectures/ahwal-al-qulub.json` | Aḥwāl al-Qulūb, Conditions of the Hearts, khuṭbah no. 1630 (`/lectures/ahwal-al-qulub`) | The Shaykh's Arabic (from almenesi.com, first khuṭbah only; the second is marked there as not provided) paired with Ahmed Abuelyaman's English translation. Arabic as given, with ﷺ restored where the copy had lost it, ﴿ ﴾ around the āyāt, references moved under their quotations (verse numbers supplied; al-Isrāʾ 36 for the copy's "2"), and one long paragraph split at its own sentence breaks. English: his wording in house style (Allah, ﷺ, transliterations, US spelling, typos; al-Baqarah 2:74 for his 73; "side" for "face" and "our hearts" for "my heart", as the Arabic has them). The few lines his translation leaves out (al-Nūr 24:48–49, the saying of the Salaf, "To proceed", "O Allah, āmīn") were translated for this site. The khuṭbah's three summary points head its sections. |
| `lectures/al-qabul.json` | al-Qabūl, a Friday khuṭbah (`/lectures/al-qabul`) | The Shaykh's text, prepared and delivered at the AMJA Imams' Conference in Dallas, 15 Rabīʿ al-Awwal 1448 AH. The Arabic is his, with typographic tidy-ups only (three missing or stray stops and spaces, and the muṣḥaf vowels on Āl ʿImrān 36); the US-English translation under each paragraph is written for this site. |

To store one on a site (it is checked first, and nothing is sent without
`--write`):

```bash
ASL_PASSWORD=… node scripts/import.ts --file content/zad-al-huffaz.json --write
```

Or load the file at `/not-an-admin/import`, which accepts a finished `.json`.
