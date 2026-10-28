# Bulk data formats

The Bulk Loader (`/admin/loader`, or `node scripts/load.ts` in a terminal)
puts three kinds of content into a matn that is already stored. It reads each
from a JSON file you choose; nothing is bundled with the site. This page is
the reference for those files.

Every file is **one JSON object keyed by bayt number** (as a string, the way
JSON keys always are). The rules all three share:

- A key that is not a bayt number is a note and is skipped. By convention a
  file opens with `"_"` holding a line or a list of lines about where it came
  from.
- A bayt number must be one the matn has (1 to its registered verse count).
- A bayt that cannot be used is reported on its own row (or stops the CLI)
  and the rest of the file still can be. Nothing is guessed at.
- Loading never deletes: a field the file leaves out, or leaves blank, keeps
  whatever is stored. Delete in the Content Editor.
- Re-loading the same file is safe: a bayt whose stored content already
  matches is not sent.
- The file is UTF-8. A byte-order mark is allowed.

The rules come from `src/shared/bulk.ts`, which the page and the CLI share;
`tests/bulk.test.ts` exercises each of them.

## Explanations

The commentary shown in a bayt's explanation card.

```json
{
  "_": "English explanations, abyāt 2–14.",
  "2": "<p><b>Literal translation.</b> I speak a statement …</p><p><b><span class=\"ar\">مَقالاً</span>.</b> …</p>",
  "3": { "en": "<p>…</p>", "ur": "<p>…</p>" }
}
```

- The value is either **a string — the English explanation** — or **an object
  with any of `en`, `ur`, `ar`** for the languages written. The string form is
  exactly the old site's `khaqaniyyah-explanations-en.json` (built by
  `khaqaniyyah-explanations/build.mjs`), so such a file loads as it is.
- The text is HTML, in the markup the explanation card accepts and the API
  enforces (`PROSE_TAGS` / `PROSE_CLASSES` in `src/shared/poem-data.ts`):
  `p br b strong i em u ul ol li span`; `class` only `ar`, `ur` or `qline`;
  `dir` only `rtl`, `ltr` or `auto`; no other attribute, no links, no images.
  A Qurʾānic line set apart is `<span class="ar"><p class="qline" dir="rtl">…</p></span>`.
- **Languages are merged.** Loading English leaves an Urdu or Arabic
  explanation already stored beside it exactly as it was (sending an
  explanation replaces the whole object, so the loader builds each patch on
  top of what is stored).
- **Loading is not showing.** Each bayt's explanation switch is an accuracy
  gate: the text goes in hidden, and the page's **Show** button (or the CLI's
  `--enable`) switches it on once it has been read. A bayt that is already
  switched on — including every bayt of a matn registered with
  `explanations.defaultOn` — shows the new text as soon as it loads; the page
  says so before it sends.
- A bayt whose stored explanation is empty or still says it is "being
  prepared" is a placeholder, and cannot be switched on.
- Only the abyāt the matn registers as taking an explanation
  (`explanations.bayts`, default all) can be loaded.

## Word meanings

The word-by-word glosses a reader gets on tapping a word.

```json
{
  "_": ["Word meanings, as the reading page shows them when a word is tapped."],
  "7": {
    "s": [[1, "The first is"], [1, "Iẓhār — clear pronunciation"], [2, "before the letters"]],
    "a": [[1, "of the throat", "حلق کے"], [1, "six of them", "چھ"], [1, "set in order"], [1, "so know them"]]
  }
}
```

- `s` is the sadr (first hemistich) and `a` the ʿajuz (second). Each is a list
  of **cells**, in reading order.
- A cell is `[howManyWords, english]` or `[howManyWords, english, urdu]`.
  `english` may be `""` (or `null`) when only the Urdu is written, but every
  cell needs a meaning in one language or the other.
- **The Arabic is not in the file.** The loader cuts each cell's words out of
  the hemistich as the store holds it, so the verse on the page cannot change,
  and a cell can never disagree with its verse by one stray diacritic. In the
  example, the sadr of bayt 7 becomes three cells: its 1st word, its 2nd, and
  its 3rd and 4th together.
- **The counts must add up** to the hemistich's word count exactly. A bayt
  whose counts do not — usually because the verse was edited after the
  meanings were written — is left alone and reported, with its words
  numbered (`1·فَالأَوَّلُ 2·الإِظۡهَارُ …`) so the miscount can be found.
- A word is what a reader sees as a word: words are separated by a plain
  space. A space inside a tag (`<span class="rmz ann" data-tp="ب">`), a
  no-break space, or the space inside a `<span class="dot">` circle does not
  separate words. Markup in the hemistich travels into the cell it falls in.
- A word cell that carries a footnote (`fn`, added in the Bayt Editor) keeps
  it when the new cells include one with exactly the same words. If they do
  not, the bayt is refused rather than losing the footnote.
- Meanings go live for readers as soon as they load — there is no switch.
- This is the old site's `scripts/<matn>-words.json` format unchanged
  (`tuhfah`, `salsabeel`, `durrah`), including its `"_"` note.

### Colour-coded hemistichs

An entry may also carry the hemistichs themselves:

```json
"12": {
  "s": [[1, "and with a kasrah", "اور کسرہ کے ساتھ"], …],
  "a": [[2, "…"], …],
  "sadr": "وَ<span class=\"rmz4\">كَسۡرِ</span> …",
  "ajuz": "…"
}
```

This is for a words file that writes colour-coding (rumūz in red) into the
verse along with its meanings. **Only the markup may differ**: once tags are
stripped the text must be letter for letter the stored hemistich, or the bayt
is refused. The cells are cut from these marked-up hemistichs and the two are
saved together. Give both `sadr` and `ajuz`, or neither. The markup must be
the verse vocabulary (`ALLOWED_CLASSES` in `src/shared/poem-data.ts`).

## Translations & sharḥ

The English translation, the Urdu translation, and the sharḥ (an Urdu
explanation).

```json
{
  "1": {
    "tr": "Say: all praise belongs to Allah, who alone is exalted above all; …",
    "ur": "کہو کہ تمام تعریفیں اللہ تعالیٰ کے لیے ہیں، …",
    "sharh": "<p>ناظم رحمہ اللہ نے منظومہ کا آغاز حمد سے کیا … <b>قُلِ</b> …</p>"
  },
  "2": { "ur": "…" }
}
```

- `tr` — English translation; `ur` — Urdu translation. **Plain text**: no `<`
  or `>`, because the reading page inserts them as text.
- `sharh` — the bayt's Urdu explanation, in the explanation markup described
  above. It is stored as the explanation's `ur` language; an English or
  Arabic explanation already stored beside it is kept.
- Any of the three may be left out, and a blank one counts as left out; what
  is left out is not touched. No other field is accepted (a typo such as
  `"en"` is reported rather than ignored).
- `⟨?⟩` anywhere in an entry marks a passage the translator wants checked; the
  loader flags those abyāt.
- All three go live as soon as they are saved. Because a sharḥ is reached
  through the explanation button, saving one also **switches that bayt's
  explanation on** — otherwise the note would be stored but unreachable. The
  page offers **Show** for a sharḥ already in place whose switch is off.
- This is the old site's `scripts/durrah-urdu.json` format unchanged.

## Command line

```
node scripts/load.ts --poem <id> --kind words|explanations|translations --file <json>
                     [--bayts 1-22] [--show] [--write] [--enable|--disable] [--origin URL]
```

It is a dry run unless `--write` is given; `--show` prints every cell or text
it would send; `--bayts` takes `1-16` or `1,5,9-12`; `--enable`/`--disable`
switch explanations on or off after loading them (`--kind explanations`
only). The password comes from `ASL_PASSWORD` or a prompt that does not echo —
never an argument. `--origin` defaults to the live site; point it at a local
`wrangler dev` (`--origin http://127.0.0.1:8787`) to try a file first. Unlike
the page, the CLI stops before sending anything if any selected bayt cannot be
loaded.
