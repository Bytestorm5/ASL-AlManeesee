/* Keep every hemistich on a single line in reading mode by shrinking the font
   of the few bayts long enough to wrap. (Memorize mode does its own fitting,
   where the hidden-word tiles change the width.)

   Width is measured with a Range over the text — not scrollWidth — so the
   word-gloss tooltips and the rumūz above a word (absolutely-positioned
   pseudo-elements) can't inflate the measurement. */
const rng = typeof document !== 'undefined' ? document.createRange() : null;

/* Measuring is a layout read and setting a font-size a layout write, so doing
   both per hemistich lays the page out once per hemistich — thousands of
   times on a long matn. Split into passes instead: all the writes, then all
   the reads (one layout for the set), then the shrink loop for only those that
   actually overflow, which is usually a handful. */
export function fitMany(list: ArrayLike<HTMLElement>): void {
  if (!rng || !list || !list.length) return;
  for (let i = 0; i < list.length; i++) { list[i]!.style.whiteSpace = 'nowrap'; list[i]!.style.fontSize = ''; }
  const over: [HTMLElement, number, number][] = [];
  for (let i = 0; i < list.length; i++) {
    const h = list[i]!;
    /* Skip anything the browser has chosen not to render yet: every chapter
       is content-visibility:auto, and asking one for its geometry would force
       it to be laid out — undoing what that buys. Chapters are measured when
       the browser reports they have become relevant (below). */
    if (h.checkVisibility && !h.checkVisibility({ contentVisibilityAuto: true })) continue;
    const cs = getComputedStyle(h);
    const avail = h.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (avail <= 0) continue;
    rng.selectNodeContents(h);
    const need = rng.getBoundingClientRect().width;
    if (need > avail + 0.5) over.push([h, avail, need]);
  }
  for (const [h, av, first] of over) {
    let nd = first, t = 0;
    while (nd > av + 0.5 && t < 12) {
      const fsz = parseFloat(getComputedStyle(h).fontSize);
      h.style.fontSize = Math.max(11, fsz * av / nd * 0.98) + 'px';
      rng.selectNodeContents(h);
      nd = rng.getBoundingClientRect().width;
      t++;
    }
  }
}

const memorizing = () => document.body.classList.contains('mz-on'); // memorize.ts owns fitting there

function fitAll(): void {
  if (memorizing()) return;
  fitMany(document.getElementsByClassName('hemi') as HTMLCollectionOf<HTMLElement>);
}

export function init(): void {
  if (!window.getComputedStyle || !document.createRange) return;
  // Once now, so hemistichs aren't left wrapping while the Arabic webfont
  // loads, then again when it is ready: its glyphs measure wider than the
  // fallback's, so a fit computed before the swap can spill past its box.
  fitAll();
  void document.fonts?.ready.then(fitAll);

  let t: number | undefined;
  window.addEventListener('resize', () => {
    if (memorizing()) return;
    clearTimeout(t); t = window.setTimeout(fitAll, 150);
  });
  // Re-fit when leaving memorize mode (a resize may have happened meanwhile).
  document.addEventListener('asl-mode-read', fitAll);

  /* A chapter skipped under content-visibility has no layout until the
     browser says it has become relevant — which is exactly when it can be
     measured. */
  document.addEventListener('contentvisibilityautostatechange', (e) => {
    if ((e as Event & { skipped?: boolean }).skipped || memorizing()) return;
    const el = e.target as Element | null;
    if (el?.getElementsByClassName) fitMany(el.getElementsByClassName('hemi') as HTMLCollectionOf<HTMLElement>);
  }, true);

  /* A verse (or a chapter's gloss spans) was just rewritten: the fitted size
     was measured against the previous markup, so re-measure just that part. */
  document.addEventListener('asl-verse-patched', (e) => {
    if (memorizing()) return;
    const el = e.target as Element | null;
    if (el?.getElementsByClassName) fitMany(el.getElementsByClassName('hemi') as HTMLCollectionOf<HTMLElement>);
  });
}
