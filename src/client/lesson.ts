/* A written lecture's language switch (src/pages/lectures/[id].astro):
   Arabic with English under it, Arabic only, or English only. The choice is
   kept on the device and read back before first paint by the page's inline
   script, so a reader who chose Arabic never sees the English flash in. */
import { lsGet, lsSet } from './page.ts';

const KEY = 'asl-lesson-show';
type Show = 'both' | 'ar' | 'en';

export function init(): void {
  const page = document.querySelector<HTMLElement>('.ls-page');
  const btns = [...document.querySelectorAll<HTMLButtonElement>('.ls-show button')];
  if (!page || !btns.length) return; // an English-only text has no switch
  function apply(v: Show, save: boolean): void {
    page!.dataset.show = v;
    for (const b of btns) b.setAttribute('aria-pressed', String(b.dataset.show === v));
    if (save) lsSet(KEY, v);
  }
  const saved = lsGet(KEY);
  apply(saved === 'ar' || saved === 'en' ? saved : 'both', false);
  for (const b of btns) {
    b.addEventListener('click', () => {
      // keep the paragraph the reader is on in place while the other language comes or goes
      const anchor = [...document.querySelectorAll<HTMLElement>('.ls > *')].find((el) => el.getBoundingClientRect().bottom > 70);
      const before = anchor?.getBoundingClientRect().top ?? 0;
      apply((b.dataset.show as Show) || 'both', true);
      if (anchor) window.scrollBy(0, anchor.getBoundingClientRect().top - before);
    });
  }
}
