import { describe, expect, it } from 'vitest';
import { ALL_POEMS, POEMS, audioSetsOf, getAudioSet, poemsIn, registryProblems } from '../src/poems/index.ts';
import { LECTURES, lectureHref, lectureProblems, lectureTextProblems } from '../src/lectures/index.ts';
import { LECTURE_TEXTS } from '../content/lectures/index.ts';
import { REGISTRY } from '../src/poems/registry.ts';

describe('poem registry', () => {
  it('has no problems', () => {
    expect(registryProblems(REGISTRY)).toEqual([]);
    expect(registryProblems(ALL_POEMS)).toEqual([]);
  });
  it('keeps drafts off the reader-facing list', () => {
    expect(POEMS.some((p) => p.draft)).toBe(false);
  });
  it('gives each edition its own recording set', () => {
    const ex = ALL_POEMS.find((p) => p.id === 'example')!;
    expect(audioSetsOf(ex).map((s) => s.id)).toEqual(['example', 'example-n2']);
    expect(getAudioSet('example-n2')?.nuskha).toBe(2);
  });
  it('rejects ids that would collide with a route or an edition set', () => {
    const base = ALL_POEMS.find((p) => p.id === 'example')!;
    expect(registryProblems([{ ...base, id: 'admin' }]).join()).toMatch(/collides/);
    expect(registryProblems([{ ...base, id: 'foo-n2' }]).join()).toMatch(/reserved for edition/);
  });
});

describe('sections', () => {
  it('puts every listed matn in exactly one text section', () => {
    expect(poemsIn('mutun').length + poemsIn('shuruh').length).toBe(POEMS.length);
  });
  it('keeps a matn off the sections\' own addresses', () => {
    const base = POEMS[0]!;
    for (const id of ['lectures', 'shuruh', 'mutun']) expect(registryProblems([{ ...base, id }]).join()).toMatch(/collides/);
  });
});

describe('lectures', () => {
  it('the registry is valid', () => {
    expect(lectureProblems()).toEqual([]);
    expect(LECTURES.length).toBeGreaterThanOrEqual(0);
  });
  it('refuses a malformed lecture', () => {
    const l = { id: 'Bad Id', title: '', date: '15/01/2026', media: { kind: 'youtube' as const, url: 'http://example.com' } };
    const probs = lectureProblems([l, { ...l, id: 'ok-id' }, { ...l, id: 'ok-id' }]).join('\n');
    for (const want of ['lowercase', 'title', 'yyyy-mm-dd', 'https://', 'YouTube', 'listed twice']) expect(probs).toContain(want);
    expect(lectureProblems([{ id: 'no-media', title: 'Nothing to open' }]).join()).toMatch(/needs media, or written/);
  });
  it('every written lecture has its text, and every text its entry', () => {
    const written = LECTURES.filter((l) => l.written).map((l) => l.id).sort();
    expect(Object.keys(LECTURE_TEXTS).sort()).toEqual(written);
    for (const l of LECTURES.filter((x) => x.written)) expect(lectureHref(l)).toBe('/lectures/' + l.id);
  });
  it('each written text is whole: Arabic with English under every block', () => {
    for (const [id, doc] of Object.entries(LECTURE_TEXTS)) expect(lectureTextProblems(id, doc)).toEqual([]);
  });
  it('refuses a text with a missing or mixed-up translation', () => {
    const doc = {
      title: { ar: 'القبول', en: 'Acceptance' }, byline: [],
      blocks: [
        { t: 'p' as const, ar: 'إن الحمد لله', en: '' },
        { t: 'ayah' as const, ar: 'يا أيها الذين آمنوا', en: 'O you who believe' },
        { t: 'quote' as const, ar: 'لا حول ولا قوة إلا بالله', en: 'لا حول' },
      ],
    };
    const probs = lectureTextProblems('x', doc).join('\n');
    for (const want of ['needs its English', '﴿ ﴾', 'Arabic letters in the English', 'open with a part or a heading']) expect(probs).toContain(want);
  });
});
