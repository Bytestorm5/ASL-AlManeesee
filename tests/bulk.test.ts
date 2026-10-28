import { describe, expect, it } from 'vitest';
import {
  BatchFailure, buildWords, cutCells, describeBayts, detectKind, explanationPatch, explanationState, expOf,
  indexDoc, parseBaytSpec, parseBulk, parseExplanations, parseTranslations, parseWords, proseText, readJsonText,
  saveInBatches, sameCells, storedIsPlaceholder, translationPatch, translationState, withSwitches, wordsOf,
  wordsPatch, wordsState,
  type BuiltWords,
} from '../src/shared/bulk.ts';
import { mergeBayts, validateBayt } from '../src/shared/poem-data.ts';
import type { PoemDoc, Verse } from '../src/poems/types.ts';
import fixture from '../fixtures/example-poem.json';

const doc = (): PoemDoc => ({ ...(structuredClone(fixture) as unknown as PoemDoc), version: 3, updatedAt: null });
const verse = (n: number, d = doc()): Verse => indexDoc(d).get(n)!.v;
const built = (r: ReturnType<typeof buildWords>): BuiltWords => {
  if ('error' in r) throw new Error(r.error);
  return r;
};

describe('reading a file', () => {
  it('reads JSON, allowing a BOM, and says what is wrong with a bad one', () => {
    expect(readJsonText('﻿{"1": "x"}')).toEqual({ json: { 1: 'x' } });
    expect(readJsonText('  ')).toEqual({ error: 'The file is empty.' });
    expect('error' in readJsonText('{"1": ')).toBe(true);
  });
  it('skips keys that are not bayt numbers, and refuses a file that is not an object', () => {
    const p = parseExplanations({ _: ['a note'], 2: '<p>x</p>' });
    expect(p.ignored).toEqual(['_']);
    expect([...p.entries.keys()]).toEqual([2]);
    expect(parseWords([1, 2]).problems.join()).toMatch(/keyed by bayt number/);
    expect(parseTranslations({ _: 'only a note' }).problems.join()).toMatch(/No bayt numbers/);
  });
  it('flags out-of-range and repeated bayts without dropping the rest', () => {
    const p = parseExplanations({ 3: '<p>a</p>', ' 3': '<p>b</p>', 9: '<p>c</p>' }, 8);
    const q = parseExplanations({ 2: '<p>ok</p>', 9: '<p>c</p>' }, 8);
    expect([...q.entries.keys()]).toEqual([2]);
    expect(q.invalid.get(9)!.join()).toMatch(/out of range \(1–8\)/);
    expect(p.entries.has(3)).toBe(false);
    expect(p.invalid.get(3)!.join()).toMatch(/given twice/);
  });
  it('tells the three formats apart', () => {
    expect(detectKind({ 1: '<p>x</p>' })).toBe('explanations');
    expect(detectKind({ 1: { en: 'x', ur: 'y' } })).toBe('explanations');
    expect(detectKind({ _: [], 1: { s: [[1, 'a']], a: [[1, 'b']] } })).toBe('words');
    expect(detectKind({ 1: { tr: 'x', sharh: 'y' } })).toBe('translations');
    expect(detectKind({ 1: { ur: 'x' } })).toBe('translations');
    expect(detectKind([])).toBeNull();
  });
});

describe('word-meanings files', () => {
  it('accepts [count, english] and [count, english, urdu] cells, and Urdu alone', () => {
    const p = parseWords({ 3: { s: [[1, 'And now:'], [2, 'this poem is', 'یہ نظم'], [1, '', 'طالب کے لیے']], a: [[4, 'on the rules']] } });
    expect(p.invalid.size).toBe(0);
    expect(p.entries.get(3)!.s).toEqual([
      { count: 1, g: 'And now:' }, { count: 2, g: 'this poem is', gu: 'یہ نظم' }, { count: 1, gu: 'طالب کے لیے' },
    ]);
  });
  it('refuses a cell without a count or without a meaning', () => {
    const p = parseWords({ 1: { s: [['one', 'x'], [0, 'y'], [1, '']], a: [[1, 'z']] } });
    const why = p.invalid.get(1)!.join('\n');
    expect(why).toMatch(/sadr cell 1: a cell must start with how many words/);
    expect(why).toMatch(/sadr cell 2: a cell must start with how many words/);
    expect(why).toMatch(/sadr cell 3: has no meaning in either language/);
  });
  it('wants both hemistichs or neither when the file carries colour-coded text', () => {
    expect(parseWords({ 1: { s: [[1, 'x']], a: [[1, 'y']], sadr: 'x' } }).invalid.get(1)!.join()).toMatch(/both "sadr" and "ajuz"/);
    expect(parseWords({ 1: { s: [[1, 'x']] } }).invalid.get(1)!.join()).toMatch(/"s" list .* "a" list/);
  });
});

describe('explanation and translation files', () => {
  it('reads a bare string as English and an object as several languages', () => {
    const p = parseExplanations({ 2: '  <p>English</p> ', 3: { en: '<p>e</p>', ur: '<p>اردو</p>', ar: '' } });
    expect(p.entries.get(2)).toEqual({ en: '<p>English</p>' });
    expect(p.entries.get(3)).toEqual({ en: '<p>e</p>', ur: '<p>اردو</p>' });
  });
  it('holds explanations to the prose markup the reading page accepts', () => {
    const p = parseExplanations({ 1: '<p onclick="x">a</p>', 2: '<a href="x">b</a>', 3: { de: 'c' }, 4: '  ' });
    expect(p.entries.size).toBe(0);
    expect(p.invalid.get(1)!.join()).toMatch(/stray attribute/);
    expect(p.invalid.get(2)!.join()).toMatch(/disallowed tag <a>/);
    expect(p.invalid.get(3)!.join()).toMatch(/unknown language/);
    expect(p.invalid.get(4)!.join()).toMatch(/empty/);
  });
  it('keeps translations plain, checks the sharḥ, and treats a blank field as left out', () => {
    const p = parseTranslations({
      1: { tr: 'Plain.', ur: '  ', sharh: '<p>شرح</p>' },
      2: { tr: 'Has <b>bold</b>' },
      3: { en: 'wrong field' },
      4: { sharh: '<script>x</script>' },
    });
    expect(p.entries.get(1)).toEqual({ tr: 'Plain.', sharh: '<p>شرح</p>' });
    expect(p.invalid.get(2)!.join()).toMatch(/plain text/);
    expect(p.invalid.get(3)!.join()).toMatch(/unknown field/);
    expect(p.invalid.get(4)!.join()).toMatch(/disallowed tag <script>/);
  });
  it('dispatches on the kind', () => {
    expect(parseBulk('translations', { 1: { tr: 'x' } }).entries.get(1)).toEqual({ tr: 'x' });
  });
});

describe('cutting word cells out of the stored hemistich', () => {
  it('keeps spaces inside tags and splits only on plain spaces', () => {
    expect(wordsOf('<span class="rmz4">حُ</span>زۡ بِهِ')).toEqual(['<span class="rmz4">حُ</span>زۡ', 'بِهِ']);
    expect(wordsOf('<span class="rmz ann" data-tp="ب">س</span>َمَّيۡتُهُ بِـ')).toHaveLength(2);
    /* the Bayt Editor keeps a no-break space as the seat of a dot circle */
    expect(wordsOf('دَوۡمًا<span class="dot"> </span> سُلَيۡمَانُ')).toEqual(['دَوۡمًا<span class="dot"> </span>', 'سُلَيۡمَانُ']);
    expect(wordsOf('دَوۡمًا<span class="dot"> </span> هُوَ')).toEqual(['دَوۡمًا<span class="dot"> </span>', 'هُوَ']);
    expect(wordsOf('a b c')).toEqual(['a b', 'c']);
  });
  it('cuts by the counts, and refuses counts that do not use up the words', () => {
    const r = cutCells('a b c d', [{ count: 1, g: 'A' }, { count: 2, g: 'BC', gu: 'ب' }, { count: 1, gu: 'د' }]);
    expect(r).toEqual({ cells: [{ w: 'a', g: 'A' }, { w: 'b c', g: 'BC', gu: 'ب' }, { w: 'd', gu: 'د' }] });
    const bad = cutCells('a b c', [{ count: 1, g: 'A' }]);
    expect('error' in bad && bad.error).toBe('covers 1 word but the verse now has 3');
  });
  it('builds cells for a bayt without any, which the API then accepts', () => {
    const d = doc();
    const v3 = verse(3, d);
    const p = parseWords({ 3: { s: [[1, 'And now:'], [2, 'this poem is'], [1, 'for the seeker']], a: [[2, 'on the nūn'], [1, 'and the tanwīn'], [1, 'and the prolongations']] } });
    const b = built(buildWords(v3, p.entries.get(3)!));
    expect(b.sadrW.map((c) => c.w).join(' ')).toBe(v3.sadr);
    expect(b.ajuzW.map((c) => c.w).join(' ')).toBe(v3.ajuz);
    expect(b.sadr).toBeUndefined();
    expect(wordsState(v3, b)).toBe('none');
    const patch = wordsPatch(3, v3, b);
    expect(validateBayt(patch)).toEqual([]);
    const m = mergeBayts(d, [patch]);
    expect(m.problems).toEqual([]);
    expect(m.applied).toEqual([3]);
    expect(wordsState(verse(3, m.doc), b)).toBe('loaded');
  });
  it('carries a ramz through inside its cell', () => {
    const v4 = verse(4);
    const b = built(buildWords(v4, { s: [{ count: 1, g: 'I named it' }, { count: 3, g: 'Tuḥfat al-Aṭfāl' }], a: [{ count: 5, g: 'from our teacher…' }] }));
    expect(b.sadrW[0]!.w).toBe('<span class="rmz ann" data-tp="ب">س</span>َمَّيۡتُهُ');
  });
  it('reports a miscount with the words numbered', () => {
    const r = buildWords(verse(5), { s: [{ count: 4, g: 'x' }], a: [{ count: 3, g: 'y' }] });
    expect(r).toMatchObject({ error: 'sadr covers 4 words but the verse now has 5' });
    expect('detail' in r && r.detail).toMatch(/^1·أَرۡجُو 2·بِهِ/);
  });
  it('tells a changed set of cells from the live one', () => {
    const v1 = verse(1);
    const same = built(buildWords(v1, { s: [{ count: 1, g: 'Says' }, { count: 1, g: 'he who hopes for' }, { count: 2, g: 'the mercy of the Oft-Forgiving' }], a: [{ count: 1, g: 'always' }, { count: 1, g: 'Sulaymān' }, { count: 2, g: 'he is al-Jamzūrī' }] }));
    expect(wordsState(v1, same)).toBe('loaded');
    const other = built(buildWords(v1, { s: [{ count: 2, g: 'Says the one who hopes' }, { count: 2, g: 'mercy' }], a: [{ count: 4, g: 'Sulaymān al-Jamzūrī' }] }));
    expect(wordsState(v1, other)).toBe('differs');
    expect(wordsState(v1, { error: 'x' })).toBe('mismatch');
    expect(sameCells([{ w: 'a', g: 'x' }], [{ w: 'a', g: 'x', gu: '' }])).toBe(true);
  });
  it('takes colour-coded hemistichs when only the markup differs, and never different letters', () => {
    const v5 = verse(5);
    const sadr = v5.sadr.replace('أَرۡجُو', '<span class="rd">أَرۡجُو</span>');
    const groups = { s: [{ count: 5, g: 'I hope…' }], a: [{ count: 3, g: 'and reward…' }] };
    const b = built(buildWords(v5, { ...groups, sadr, ajuz: v5.ajuz }));
    expect(b.sadr).toBe(sadr);
    expect(wordsPatch(5, v5, b).sadr).toBe(sadr);
    expect(buildWords(v5, { ...groups, sadr: sadr.replace('بِهِ', 'بِهَا'), ajuz: v5.ajuz }))
      .toEqual({ error: 'the colour-coded text is not the stored bayt' });
    expect(buildWords(v5, { ...groups, sadr: sadr.replace('rd', 'nope'), ajuz: v5.ajuz }))
      .toMatchObject({ error: expect.stringMatching(/unknown class/) });
  });
  it('keeps a stored footnote on the cell with the same words, and refuses to lose one', () => {
    const v6 = verse(6);
    v6.sadrW![1]!.fn = 'A variant reading.';
    const a = { count: 4, g: 'four rulings…' };
    const kept = built(buildWords(v6, { s: [{ count: 1, g: 'For the nūn' }, { count: 2, g: 'if it is still' }, { count: 1, g: 'and the tanwīn' }], a: [a] }));
    expect(kept.sadrW[1]).toEqual({ w: 'إِنۡ تَسۡكُنۡ', g: 'if it is still', fn: 'A variant reading.' });
    const lost = buildWords(v6, { s: [{ count: 2, g: 'For the nūn if' }, { count: 2, g: 'it is still…' }], a: [a] });
    expect(lost).toMatchObject({ error: expect.stringMatching(/footnote on «إِنۡ تَسۡكُنۡ» has no cell/) });
  });
});

describe('explanations against the stored document', () => {
  it('reads both stored shapes', () => {
    expect(expOf(verse(6))).toEqual({ en: verse(6).exp });
    expect(expOf(verse(3))).toEqual({});
    expect(storedIsPlaceholder({ exp: '<p>This explanation is being prepared.</p>' })).toBe(true);
    expect(storedIsPlaceholder({ exp: { en: ' ', ur: '<p>شرح</p>' } })).toBe(false);
  });
  it('sends only what changed, merged over the languages already stored', () => {
    const v6 = verse(6);
    expect(explanationPatch(6, v6, { en: String(v6.exp) })).toBeNull();
    const p = explanationPatch(6, v6, { ur: '<p>اردو</p>' });
    expect(p).toEqual({ n: 6, exp: { en: v6.exp, ur: '<p>اردو</p>' } });
    const m = mergeBayts(doc(), [p!]);
    expect(m.problems).toEqual([]);
    expect(verse(6, m.doc).sadr).toBe(v6.sadr);
  });
  it('names the state of each bayt the way the old loader did', () => {
    const empty = verse(3), real = verse(6);
    const want = { en: '<p>new</p>' };
    expect(explanationState(empty, want, false)).toBe('placeholder');
    expect(explanationState(real, want, false)).toBe('differs');
    expect(explanationState(real, want, true)).toBe('stale');
    expect(explanationState(real, undefined, false)).toBe('loaded');
    expect(explanationState(real, undefined, true)).toBe('shown');
    expect(explanationState(empty, undefined, true)).toBe('stale');
    expect(explanationState({ ...real, exp: want }, want, true)).toBe('shown');
  });
});

describe('translations against the stored document', () => {
  it('leaves out what the file leaves out and merges the sharḥ into the explanation', () => {
    const v6 = verse(6);
    const p = translationPatch(6, v6, { ur: 'نیا ترجمہ', sharh: '<p>شرح</p>' });
    expect(p).toEqual({ n: 6, ur: 'نیا ترجمہ', exp: { en: v6.exp, ur: '<p>شرح</p>' } });
    expect(p).not.toHaveProperty('tr');
    const m = mergeBayts(doc(), [p!]);
    expect(m.problems).toEqual([]);
    const after = verse(6, m.doc);
    expect(after.tr).toBe(v6.tr);
    expect(translationState(after, { ur: 'نیا ترجمہ', sharh: '<p>شرح</p>' })).toBe('loaded');
    expect(translationPatch(6, after, { ur: 'نیا ترجمہ' })).toBeNull();
  });
  it('says whether something else is stored in the fields it would write', () => {
    expect(translationState(verse(3), { tr: 'Different' })).toBe('differs');
    expect(translationState(verse(3), { sharh: '<p>x</p>' })).toBe('none');
    expect(translationState(undefined, { tr: 'x' })).toBe('mismatch');
  });
});

describe('switches, bayt lists and batches', () => {
  it('sends the whole switch map back with only the named bayts changed', () => {
    expect(withSwitches({ 1: true, 2: false, 3: true }, [2, 3], true)).toEqual({ 1: true, 2: true, 3: true });
    expect(withSwitches({ 1: true, 2: true }, [1], false)).toEqual({ 1: false, 2: true });
  });
  it('reads and writes bayt lists', () => {
    expect(parseBaytSpec('1-3, 5,9–10', 12)).toEqual([1, 2, 3, 5, 9, 10]);
    expect(() => parseBaytSpec('4-2', 12)).toThrow(/out of range/);
    expect(() => parseBaytSpec('13', 12)).toThrow(/out of range \(1–12\)/);
    expect(() => parseBaytSpec('x', 12)).toThrow(/cannot read/);
    expect(describeBayts([9, 1, 2, 3, 5, 10])).toBe('1–3, 5, 9–10');
  });
  it('turns prose into one line of text', () => {
    expect(proseText('<p><b>iẓhār</b>, then</p><p>next</p>')).toBe('iẓhār, then next');
  });
  it('sends batches in order, each on the version the last one returned', async () => {
    const seen: [number, number[]][] = [];
    const r = await saveInBatches([{ n: 1 }, { n: 2 }, { n: 3 }], 2, 7, async (v, chunk) => {
      seen.push([v, chunk.map((b) => b.n)]);
      return { version: v + 1, applied: chunk.map((b) => b.n).filter((n) => n !== 2) };
    });
    expect(seen).toEqual([[7, [1, 2]], [8, [3]]]);
    expect(r).toEqual({ version: 9, applied: 2, appliedBayts: [1, 3] });
  });
  it('says which batch failed and how much went in before it', async () => {
    const boom = new Error('409');
    const run = saveInBatches([{ n: 1 }, { n: 2 }, { n: 3 }], 2, 1, async (v, chunk) => {
      if (chunk[0]!.n === 3) throw boom;
      return { version: v + 1, applied: chunk.map((b) => b.n) };
    });
    await expect(run).rejects.toBeInstanceOf(BatchFailure);
    await run.catch((e: BatchFailure) => {
      expect(e.error).toBe(boom);
      expect(e.chunk).toEqual([3]);
      expect(e.applied).toBe(2);
      expect(e.version).toBe(2);
    });
  });
});
