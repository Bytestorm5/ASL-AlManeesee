# Store listings — Google Play and the App Store

The text and answers for AlMenesi's two store listings, kept here so the next
release starts from them. Lengths are checked against each store's limit.
Describe only what the app does today: if a feature is not live yet
(recitations, Urdu, video, PDFs), leave it out of the listing until it is.

Screenshots and the Play feature graphic are made from the live site in app
mode; the sizes are listed at the end.

---

## Shared answers

| Field | Answer |
|---|---|
| Privacy policy | https://almenesi.al-asl.com/privacy |
| Support / marketing URL | https://almenesi.al-asl.com/guide · https://almenesi.al-asl.com |
| Contact email | info@al-asl.com |
| Price | Free, no in-app purchases, no ads |
| Category | Education (secondary: Books / Books & Reference) |
| Data collected | **None.** No account, no analytics, nothing leaves the device. Bookmarks, notes and memorization progress are stored on the device only. |
| Age rating | Everyone / 4+ (educational religious texts; no user-generated content, no web browsing outside the site) |

---

## Google Play

**App name** (≤ 30)

```
AlMenesi: Poems & Lectures
```

**Short description** (≤ 80)

```
Shaykh Waleed al-Meneese's poems and khutbahs, in Arabic with English.
```

**Full description** (≤ 4000)

```
AlMenesi brings together the work of Shaykh Dr Waleed Idris al-Meneese in one reader: his own poems, bayt by bayt, and his lectures and khutbahs, in his Arabic with an English translation beneath every paragraph.

HIS POEMS
Each poem is set out bayt by bayt in fully vowelled Arabic, with:
• An English translation of every bayt
• Word meanings: tap a highlighted word to see what it means
• An explanation of each bayt, laid out like the book it comes from, with the āyāt and aḥādīth it quotes and their references
• Chapters, a contents grid, and search in Arabic (no diacritics needed)

His poems include counsel for those who memorise the Qurʾān, a poem on Islamic governance with the Shaykh's own commentary, and a collection of poems on Qurʾānic recitation, language and scholarly etiquette.

LECTURES AND KHUTBAHS
Read the Shaykh's khutbahs on their own pages: the Arabic paragraph by paragraph, with the English under each one. Āyāt are set apart with their reference, and aḥādīth in a shaded box. Show both languages, Arabic only, or English only. New lectures are added as they are published.

MEMORIZE (ḤIFẒ)
• Hide words at four levels, from the last word to the whole bayt
• Tap to reveal, then mark "Got it" or "Review"
• Mastered abyāt come back for review after 1, 3, 7, 16, 35 and 90 days
• A daily goal for each poem, a streak, and progress per chapter
• Back up your progress and restore it on another device

MAKE IT YOURS
• Bookmark any bayt and write your own notes under it
• Pick up where you left off from the Home screen
• Light and dark modes

WORKS OFFLINE
Texts, translations and fonts are saved on your device as you read, so you can keep studying without a connection.

PRIVATE BY DESIGN
No account and nothing to sign into. Your bookmarks, notes and progress stay on your device; the app collects no data.

AlMenesi is a resource of the al-Asl Institute (al-asl.com).
```

**Release notes, 1.0.0** (≤ 500 per language; paste with the language tags,
or replace only the middle line if Play already shows them)

```
<en-US>
First release: the Shaykh's poems with translation, word meanings and explanations; his khutbahs in Arabic and English; memorization, bookmarks and notes; works offline.
</en-US>
```

**Graphics**

- App icon: `public/icon-512.png` (512 × 512)
- Feature graphic: 1024 × 500 JPEG
- Phone screenshots: 1080 × 1920 (six)
- 7-inch and 10-inch tablet screenshots: 1600 × 2844 (six)

**App content answers**: Ads — no. Data safety — no data collected, no data
shared. Target audience — 13+ or all ages, general educational content.
News app — no. Government app — no. Health — no. Financial — no.

---

## App Store

**Name** (≤ 30)

```
AlMenesi
```

**Subtitle** (≤ 30)

```
Poems & lectures with English
```

**Promotional text** (≤ 170, can be changed without a new version)

```
The poems and khutbahs of Shaykh Dr Waleed Idris al-Meneese: vowelled Arabic, English beneath it, word meanings, explanations, and a memorization coach.
```

**Description** — the Play full description above, unchanged.

**Keywords** (≤ 100, commas, no spaces)

```
Arabic,poetry,Islam,Quran,hifz,memorize,khutbah,lecture,matn,mutun,tajweed,qiraat,Islamic,study
```

**Support URL**: https://almenesi.al-asl.com/guide
**Marketing URL**: https://almenesi.al-asl.com
**Privacy policy URL**: https://almenesi.al-asl.com/privacy
**Copyright**: `2026 al-Asl Institute`
**App Privacy**: Data Not Collected.
**Age rating**: 4+ (answer "None" throughout; "Unrestricted web access" — No:
the app shows only its own site, and any outside link opens in a Safari sheet).

**App Review notes**

```
AlMenesi is the reader for the poems and lectures of Shaykh Dr Waleed Idris al-Meneese, published by the al-Asl Institute (the same publisher as our Mutun app). It needs no account and no sign-in.

Things to try:
1. Home: switch between "His Poems" and "Lectures".
2. Open a poem and tap a highlighted Arabic word to see its meaning; tap the book button under a bayt for its explanation.
3. In a poem, tap the Memorize tab: words are hidden; tap a blank to reveal, then "Got it" or "Review". Progress, streaks and the daily goal are kept on the device.
4. Tap the ribbon or pen under a bayt to bookmark it or write a note; both appear in the Marginalia tab.
5. Turn on Airplane Mode after opening a poem: it keeps working offline.
6. Lectures: open a khutbah and use the ع + EN / ع / EN switch.
```

**Screenshots**

- iPhone 6.9-inch display: 1320 × 2868 (six) — App Store Connect scales these
  down for the smaller iPhones
- iPad 13-inch display: 2064 × 2752 (six) — needed because the app runs on iPad

---

## Making the screenshots again

Store screenshots come from the live site in app mode (`?appmode=1`), first-run
tours switched off (`asl-tour`, `asl-trhint`, `asl-home-tour` set to `1` in
localStorage), at these viewports:

| Store size | Viewport | Scale |
|---|---|---|
| Play phone 1080 × 1920 | 360 × 640 | 3 |
| Play tablet 1600 × 2844 | 800 × 1422 | 2 |
| iPhone 6.9″ 1320 × 2868 | 440 × 956 | 3 |
| iPad 13″ 2064 × 2752 | 1032 × 1376 | 2 |

Scenes: Home; a poem with a word's meaning open; a bayt with its explanation
open; Memorize at level 2; a khutbah in Arabic + English; a poem in dark mode.
