import { describe, expect, it } from 'vitest';
import {
  checkMarkup, mergeBayts, mergeQiraatCards, normalizeExp, validateBayt, validatePoemDoc, weldJoins,
} from '../src/shared/poem-data.ts';
import type { PoemDoc } from '../src/poems/types.ts';
import fixture from '../fixtures/example-poem.json';

const doc = (): PoemDoc => ({ ...(structuredClone(fixture) as unknown as PoemDoc), version: 3, updatedAt: null });

describe('verse markup', () => {
  it('accepts the known span vocabulary', () => {
    const problems: string[] = [];
    checkMarkup('<span class="rmz ann" data-tp="ب">ب</span>ِهِ <span class="rd">x</span>', 'w', problems);
    expect(problems).toEqual([]);
  });
  it('rejects other tags, stray attributes and unbalanced spans', () => {
    const problems: string[] = [];
    checkMarkup('<b>x</b><span class="rmz" onclick="1">y', 'w', problems);
    expect(problems.join('\n')).toMatch(/disallowed tag <b>/);
    expect(problems.join('\n')).toMatch(/stray attribute/);
    expect(problems.join('\n')).toMatch(/unbalanced/);
  });
});

describe('validateBayt', () => {
  it('requires the hemistich to equal the space-join of its cells', () => {
    const p = validateBayt({ n: 1, sadr: 'a b', ajuz: 'c', sadrW: [{ w: 'a' }, { w: 'x' }] });
    expect(p.join()).toMatch(/sadr ≠ space-join of sadrW/);
  });
  it('refuses an empty word cell', () => {
    const p = validateBayt({ n: 1, sadr: 'a  b', ajuz: 'c', sadrW: [{ w: 'a' }, { w: '' }, { w: 'b' }] });
    expect(p.join()).toMatch(/sadrW\[1\] is an empty word/);
  });
    it('treats an entry with only prose as a prose-only patch', () => {
    expect(validateBayt({ n: 4, tr: 'A translation' })).toEqual([]);
  });
  it('keeps translations plain text', () => {
    expect(validateBayt({ n: 4, tr: '<b>x</b>' }).join()).toMatch(/plain text/);
  });
});

describe('mergeBayts', () => {
  it('changes only the fields sent and reports what it applied', () => {
    const r = mergeBayts(doc(), [{ n: 3, tr: 'New wording' }, { n: 4, tr: doc().chapters[0]!.verses[3]!.tr }]);
    expect(r.problems).toEqual([]);
    expect(r.applied).toEqual([3]);
    expect(r.skipped).toEqual([4]);
    const v3 = r.doc.chapters[0]!.verses[2]!;
    expect(v3.tr).toBe('New wording');
    expect(v3.sadr).toBe(doc().chapters[0]!.verses[2]!.sadr);
  });
  it('removes a translation sent as an empty string', () => {
    const r = mergeBayts(doc(), [{ n: 1, ur: '' }]);
    expect(r.doc.chapters[0]!.verses[0]!.ur).toBeUndefined();
  });
  it('refuses a hemistich that no longer matches its stored cells', () => {
    const v1 = doc().chapters[0]!.verses[0]!;
    const r = mergeBayts(doc(), [{ n: 1, sadr: v1.sadr + ' زِيَادَة', ajuz: v1.ajuz }]);
    expect(r.problems.join()).toMatch(/no longer matches the stored sadrW/);
  });
  it('normalises explanations to the language object', () => {
    expect(normalizeExp('  <p>x</p> ')).toEqual({ en: '<p>x</p>' });
    expect(normalizeExp({ en: ' ', ur: 'ی' })).toEqual({ ur: 'ی' });
    expect(normalizeExp('')).toBeNull();
  });
});

describe('validatePoemDoc', () => {
  it('accepts the fixture', () => {
    expect(validatePoemDoc(doc())).toEqual([]);
  });
  it('checks the verse count against the registry', () => {
    const d = doc();
    d.chapters[1]!.verses.pop();
    expect(validatePoemDoc(d).join()).toMatch(/expected 8 verses, found 7/);
  });
  it('checks edition variants against the registered editions', () => {
    const d = doc();
    d.variants = { '3': { '1': { sadr: 'x' } } };
    expect(validatePoemDoc(d).join()).toMatch(/edition must be 2–2/);
  });
  it('rejects an unregistered id', () => {
    expect(validatePoemDoc({ ...doc(), id: 'nope' }).join()).toMatch(/unknown poem id/);
  });
});

describe('weldJoins', () => {
  it('inserts joiners only where a tag splits two joining letters, idempotently', () => {
    const s = 'وَ<span class="rmz4">كُوفِيِّ</span>هِمۡ';
    const once = weldJoins(s);
    expect(once).toContain('‍</span>‍'.replace('</span>', '</span>'));
    expect(weldJoins(once)).toBe(once);
    expect(weldJoins('plain')).toBe('plain');
  });
});

describe('qirāʾāt cards', () => {
  const empty = { id: 'example', version: 0, updatedAt: null, examples: {} };
  it('applies, skips and removes by bayt', () => {
    const card = { word: 'مَٰلِكِ', sura: 'al-Fātiḥah', ayah: 4, ayahText: '<b>مَٰلِكِ</b> يَوۡمِ ٱلدِّينِ', readings: [{ who: 'ʿĀṣim', how: 'with alif' }] };
    const r1 = mergeQiraatCards(empty, { '2': [card] });
    expect(r1.problems).toEqual([]);
    expect(r1.applied).toEqual([2]);
    const r2 = mergeQiraatCards(r1.doc, { '2': null, '3': null });
    expect(r2.removed).toEqual([2]);
    expect(r2.skipped).toEqual([3]);
  });
  it('allows only <b> inside ayahText', () => {
    const r = mergeQiraatCards(empty, { '1': [{ word: 'x', ayahText: '<i>x</i>', readings: [] }] });
    expect(r.problems.join()).toMatch(/only <b> is allowed/);
  });
});
