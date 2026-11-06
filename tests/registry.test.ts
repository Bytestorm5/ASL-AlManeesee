import { describe, expect, it } from 'vitest';
import { ALL_POEMS, POEMS, audioSetsOf, getAudioSet, poemsIn, registryProblems } from '../src/poems/index.ts';
import { LECTURES, lectureProblems } from '../src/lectures/index.ts';
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
  });
});
