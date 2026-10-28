import type { PoemConfig } from './types.ts';

/* ═══════════════════════════════════════════════════════════════════════════
   The mutūn this site serves, in the order the home page lists them.

   Adding one is two steps (docs/adding-a-matn.md has the details):
     1. Add an entry here — the reading page /<id>, the home page card, the
        menus, the editors' poem pickers, the sitemap and the offline precache
        all follow from it.
     2. Deploy, then import the text at /admin/import. Until then the page
        shows "the text could not be loaded".

   Set `draft: true` to proof a new matn on the live site before listing it.
   ═══════════════════════════════════════════════════════════════════════════ */
export const REGISTRY: PoemConfig[] = [
];
