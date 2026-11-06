/* The first import of each matn, bundled into the worker (src/worker/seed.ts).

   Until a registered matn has a copy stored in R2, the worker stores the one
   here the first time the matn is asked for, so a matn added with a file in
   content/ is readable as soon as it is deployed, with no import step. After
   that the stored copy is the live one, edited in /not-an-admin, and this file is
   not read again (the write is create-only: it can never replace a stored
   copy). Like fixtures/ for the dev fixture, this folder is content, so it
   may name the mutūn it holds. */
import type { PoemDoc } from '../src/poems/types.ts';
import zadAlHuffaz from './zad-al-huffaz.json';
import siyasahShariyyah from './siyasah-shariyyah.json';
import durarWalidiyyah from './durar-walidiyyah.json';

export type PoemSeed = Pick<PoemDoc, 'chapters'> & Partial<Pick<PoemDoc, 'variants'>>;

export const SEEDS: Readonly<Record<string, PoemSeed>> = {
  'zad-al-huffaz': zadAlHuffaz as unknown as PoemSeed,
  'siyasah-shariyyah': siyasahShariyyah as unknown as PoemSeed,
  'durar-walidiyyah': durarWalidiyyah as unknown as PoemSeed,
};
