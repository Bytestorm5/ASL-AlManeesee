/* Seeding: a registered matn whose text is not stored yet is stored from its
   bundled first import (content/index.ts) the first time the poems API is
   asked for anything, so the text of a newly added matn is live on its first
   deploy without anyone running an import.

   · Create-only. The write carries If-None-Match: *, so R2 commits it only
     while the key is still absent: it can never replace a copy an editor has
     imported or saved, and two first requests racing store it once.
   · Held to the same rules as an import (src/shared/poem-data.ts). A seed that
     fails them is logged and left alone, never half-stored.
   · Checked once per isolate. After the first look a stored matn costs
     nothing; a failed look (storage unreachable) is retried next time. */
import type { PoemDoc } from '../poems/types.ts';
import { isPoemId } from '../poems/index.ts';
import { nowIso, poemKey, validateBayt, validatePoemDoc, versesOf } from '../shared/poem-data.ts';
import { SEEDS, type PoemSeed } from '../../content/index.ts';

const settled = new Set<string>();

/** Forget which seeds this isolate has already looked at (tests empty the bucket between cases). */
export function resetSeedChecks(): void { settled.clear(); }

/** Store every registered matn's seed that has no stored copy. Returns the ids it stored. */
export async function ensureSeeded(bucket: R2Bucket, seeds: Readonly<Record<string, PoemSeed>> = SEEDS): Promise<string[]> {
  const stored: string[] = [];
  for (const [id, seed] of Object.entries(seeds)) {
    if (settled.has(id) || !isPoemId(id)) continue;
    try {
      if (await bucket.head(poemKey(id))) { settled.add(id); continue; }

      const doc: PoemDoc = { ...seed, id, version: 1, updatedAt: nowIso() };
      const problems = validatePoemDoc(doc);
      for (const v of versesOf(doc.chapters)) problems.push(...validateBayt(v));
      if (problems.length) {
        console.error(`seed for ${id} refused:`, problems.slice(0, 10));
        settled.add(id);
        continue;
      }
      const put = await bucket.put(poemKey(id), JSON.stringify(doc), {
        httpMetadata: { contentType: 'application/json; charset=utf-8' },
        customMetadata: { version: String(doc.version), updatedAt: doc.updatedAt ?? '' },
        onlyIf: new Headers({ 'If-None-Match': '*' }),
      });
      if (put) stored.push(id);   // null: someone stored it first, which is just as good
      settled.add(id);
    } catch (e) {
      console.error(`seeding ${id} failed:`, (e as Error)?.message);   // not settled: try again next request
    }
  }
  return stored;
}
