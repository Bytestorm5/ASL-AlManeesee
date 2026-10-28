/* ── Arabic inside the Urdu ────────────────────────────────────────────────
   The Urdu is set in Nastaʿlīq, which draws fully-vowelled Arabic badly: the
   marks of a quoted āyah word or a ramz pile up on one another and run into
   the line above. So each Arabic word inside an Urdu passage is set in the
   Arabic face instead — at render time, because a stored translation has to
   stay plain text (the API rejects markup in `tr` and `ur`). The sharḥ goes
   through the same pass. Switched on per matn (PoemConfig.arabicInUrdu).

   What tells the two apart is the spelling. Urdu has its own letters for
   sounds Arabic writes otherwise — ٹ ڈ ڑ ں ھ ہ ی ے گ چ پ ک ژ — so a word
   holding one of those is Urdu, and that alone is enough inside a «…» quote,
   where a matn only ever quotes the Qurʾān or the poem.

   Loose in the prose the test has to be stricter, because Urdu writes plenty
   of Arabic loanwords in Arabic letters: مدّ, خُلف, نقشِ قدم. What it does not
   do is vowel them right through, so a word counts as Arabic when it carries a
   mark only the Qurʾānic orthography uses (ٱ ۡ ۥ ۦ and the Uthmanic tanwīn),
   or when every letter in it is spoken for: marked, or a long vowel after a
   marked letter, or last in the word and so pausal. */
const UR_ONLY = /[ٹچپڈڑژکگںھۀ-ۃیےۓ]/;
const AR_ONLY = /[ٖٱۡۥۦࣰ-ࣲ]/; // marks only the Qurʾānic orthography uses
const AR_MARK = /[ً-ࣰٰٖۡ-ࣲ]/;
const AR_LETTER = /[ء-غف-يىٱ]/;
const AR_VOWEL = /[اويىٰ]/;               // alif, wāw, yāʾ, alif maqṣūra, dagger alif
const AR_SKIP = /[ً-ٰٖۡـࣰ-ࣲ]/g; // marks and the kashida

/** Arabic script and not spelt the Urdu way — all a «…» quote has to be. */
export function isArabicScript(s: string): boolean {
  const t = String(s).replace(/[^؀-ۿ]/g, '');
  return !!t && !UR_ONLY.test(t);
}

/** Arabic, rather than one of the Arabic words Urdu has taken over. */
export function isArabicWord(w: string): boolean {
  const s = String(w).replace(/[^؀-ۿ]/g, '');
  if (!isArabicScript(s)) return false;
  if (AR_ONLY.test(s)) return true;
  let marks = 0, bare = 0, first: boolean | null = null, prevMarked = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (!AR_LETTER.test(ch)) { if (AR_MARK.test(ch)) marks++; continue; }
    const marked = AR_MARK.test(s[i + 1] || '');
    const last = !AR_LETTER.test(s.slice(i + 1).replace(AR_SKIP, ''));
    if (first === null) first = marked;
    if (!marked && !last && !(AR_VOWEL.test(ch) && prevMarked)) bare++;
    prevMarked = marked;
  }
  return first === true && marks > 0 && bare === 0;
}

/** Set the Arabic of an Urdu passage in the Arabic face. Skips tags, so it
    runs over the sharḥ's markup as readily as over a bare translation.

    A «…» quote is weighed whole and set whole, guillemets and inner commas
    with it. A word loose in the prose keeps the punctuation it is wrapped in
    outside the span, because that belongs to the Urdu sentence. */
const AR_PUNCT = /^([(\[«"'‘“]*)(.*?)([)\]»"'’”،؛۔.,:;!?*=—–-]*)$/;
export function arInUrdu(s: string): string {
  const face = (t: string) => `<span class="ar">${t}</span>`;
  return String(s).replace(/<[^>]*>|«[^»]*»|[^\s<«]+/g, (t) => {
    if (t.charAt(0) === '<') return t;
    if (t.charAt(0) === '«') return isArabicScript(t) ? face(t) : t;
    const [, lead = '', core = '', tail = ''] = AR_PUNCT.exec(t) ?? [];
    return isArabicWord(core) ? lead + face(core) + tail : t;
  });
}
