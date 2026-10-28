import { describe, expect, it } from 'vitest';
import { ALL_POEMS, POEMS, audioSetsOf, getAudioSet, registryProblems } from '../src/poems/index.ts';
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
