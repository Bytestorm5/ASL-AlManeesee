/* Pre-paint bootstraps. Each runs inline in <head>, before the first paint,
   because a decision that arrives a frame late shows as a flash. They are
   written as self-contained functions and inlined by the layouts with
   `(${fn})()` — so they may not refer to anything outside themselves. */

/* Tablet layout gate. Phones and tablets get the touch layout; a big screen
   (or a fine pointer) gets `html.bigscreen`. ?wide=1 / ?wide=0 overrides and
   is remembered, for testing on a device that guesses wrong. */
export function bootLayoutGate(): void {
  const d = document.documentElement;
  try {
    const m = /[?&]wide=([01])/.exec(location.search);
    if (m) { try { localStorage.setItem('asl-wide', m[1]!); } catch { /* ignore */ } }
    let f: string | null = null;
    try { f = localStorage.getItem('asl-wide'); } catch { /* ignore */ }
    let big: boolean;
    if (f === '1' || f === '0') big = f === '1';
    else {
      const r = window.devicePixelRatio || 1, s = window.screen || ({} as Screen);
      const e0 = Math.min(s.width || 0, s.height || 0) * r;
      big = matchMedia('(hover:hover) and (pointer:fine)').matches || !e0 || e0 >= 1460;
    }
    if (big) d.classList.add('bigscreen');
  } catch { d.classList.add('bigscreen'); }
}

/* Light/dark before first paint (theme.ts keeps it in sync afterwards). */
export function bootTheme(): void {
  try {
    const t = localStorage.getItem('asl-theme') || 'auto';
    const m = typeof window.matchMedia === 'function' && matchMedia('(prefers-color-scheme:dark)').matches;
    document.documentElement.setAttribute('data-theme', t === 'dark' || (t !== 'light' && m) ? 'dark' : 'light');
  } catch { /* light is the default */ }
}

/* Launch splash (home page only). The installed app's native splash cannot be
   animated, so this picks the same emblem up on the same ground and brings it
   to life — only on a cold start in app mode. ?boot=1 forces it in a browser,
   ?boot=0 suppresses it. */
export function bootSplash(): void {
  try {
    const f = /[?&]boot=([01])/.exec(location.search);
    if (f && f[1] === '0') return;
    let app = matchMedia('(display-mode: standalone)').matches
      || matchMedia('(display-mode: fullscreen)').matches
      || matchMedia('(display-mode: minimal-ui)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true
      || (document.referrer || '').indexOf('android-app://') === 0
      || /[?&](appmode=1|source=(twa|pwa|ios))/.test(location.search);
    try {
      if (app) sessionStorage.setItem('asl-app', '1');
      else if (sessionStorage.getItem('asl-app') === '1') app = true;
    } catch { /* ignore */ }
    let first = true;
    try { first = !sessionStorage.getItem('asl-booted'); sessionStorage.setItem('asl-booted', '1'); } catch { /* ignore */ }
    if ((app && first) || (f && f[1] === '1')) document.documentElement.setAttribute('data-boot', '1');
  } catch { /* no splash */ }
}

/** Inline-able source for a list of bootstraps. */
export function inlineBoot(...fns: Array<() => void>): string {
  return fns.map((fn) => `(${fn.toString()})();`).join('');
}
