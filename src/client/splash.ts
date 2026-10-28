/* The launch splash's animation (home page only). bootSplash (boot.ts) has
   already decided, in <head>, whether this launch gets a splash; this brings
   the #boot overlay to life and takes it away again.

   Like the bootstraps in boot.ts it is inlined into the page with
   `(${fn})()`, straight after the #boot markup, rather than loaded as a
   module: the page's module scripts are deferred, and if one failed to load
   the overlay — which sits above everything — would never be taken down. So
   it must stay self-contained: no imports, nothing from outside itself. */
export function runSplash(): void {
  const boot = document.getElementById('boot');
  if (!document.documentElement.hasAttribute('data-boot') || !boot) { if (boot) boot.remove(); return; }

  const BEAT = 1.55; // seconds, matches @keyframes bootBeat
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, gone = false;

  /* Gold sparks off the star. Same treatment as the launch flyer: every spark
     is a pure function of its index and the loop phase, so there is no state to
     carry between frames and the loop closes seamlessly. */
  const cv = document.getElementById('bootfx') as HTMLCanvasElement | null;
  const ctx = cv && typeof cv.getContext === 'function' ? cv.getContext('2d') : null;
  if (cv && ctx) {
    const W = 480, H = 480, DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * DPR; cv.height = H * DPR; ctx.scale(DPR, DPR);
    const CX = W / 2, CY = H / 2, TAU = Math.PI * 2, LOOP = BEAT * 2;
    const rnd = (i: number, k: number): number => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
    const N = 24;
    const S: { a0: number; off: number; r0: number; r1: number; curl: number; size: number; tw: number; glint: boolean }[] = [];
    for (let i = 0; i < N; i++) S.push({
      /* fanned out evenly and then jittered, not placed at random: with two
         dozen sparks a free hash clumps them down one side, which on a full
         screen reads as a lopsided picture rather than as sparkle. */
      a0: (i / N) * TAU + (rnd(i, 1) - 0.5) * (TAU / N) * 0.9,
      off: rnd(i, 2),                           // so they do not pulse in unison
      r0: 45 + rnd(i, 3) * 25,                  // starts just inside the star's edge
      r1: 94 + rnd(i, 4) * 62,                  // drifts out to here
      curl: (rnd(i, 5) - 0.5) * 0.55,           // a slight arc, not a straight line
      size: 2.8 + Math.pow(rnd(i, 6), 1.8) * 6.2,
      tw: 2 + Math.floor(rnd(i, 7) * 3),
      glint: rnd(i, 8) > 0.72,
    });
    /* the beat curve, as two gaussian thumps sitting on the CSS keyframe peaks */
    const bump = (p: number, c: number, w: number): number => { const d = (p - c) / w; return Math.exp(-d * d); };
    const beat = (p: number): number => Math.min(1, bump(p, 0.14, 0.085) + 0.62 * bump(p, 0.39, 0.10));
    const dot = (x: number, y: number, r: number, a: number): void => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,244,214,' + a + ')');
      g.addColorStop(0.28, 'rgba(214,163,58,' + (a * 0.96) + ')');
      g.addColorStop(0.62, 'rgba(184,134,40,' + (a * 0.42) + ')');
      g.addColorStop(1, 'rgba(169,123,33,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    };
    const glint = (x: number, y: number, len: number, a: number): void => {
      for (const d of ['h', 'v']) {
        const g = d === 'h' ? ctx.createLinearGradient(x - len, y, x + len, y)
          : ctx.createLinearGradient(x, y - len, x, y + len);
        g.addColorStop(0, 'rgba(192,151,60,0)');
        g.addColorStop(0.5, 'rgba(246,214,140,' + a + ')');
        g.addColorStop(1, 'rgba(192,151,60,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        ctx.beginPath();
        if (d === 'h') { ctx.moveTo(x - len, y); ctx.lineTo(x + len, y); }
        else { ctx.moveTo(x, y - len); ctx.lineTo(x, y + len); }
        ctx.stroke();
      }
    };
    const renderAt = (t: number): void => {
      const b = beat((t % BEAT) / BEAT), ph = (t % LOOP) / LOOP;
      ctx.clearRect(0, 0, W, H);
      const hr = 96 + b * 26; // the halo, swelling on the thump
      const hg = ctx.createRadialGradient(CX, CY, 10, CX, CY, hr);
      hg.addColorStop(0, 'rgba(226,188,104,' + (0.06 + b * 0.11) + ')');
      hg.addColorStop(0.5, 'rgba(198,152,58,' + (0.03 + b * 0.06) + ')');
      hg.addColorStop(1, 'rgba(192,151,60,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(CX, CY, hr, 0, TAU); ctx.fill();
      for (const s of S) {
        const p = (ph + s.off) % 1;
        const ease = 1 - Math.pow(1 - p, 2.1); // quick away, then drifting
        const r = s.r0 + (s.r1 - s.r0) * ease, ang = s.a0 + s.curl * ease;
        const x = CX + Math.cos(ang) * r, y = CY + Math.sin(ang) * r * 0.94;
        /* clamped before the pow: at the end of a spark's life sin(pi*p) lands a
           hair below zero, and a negative base with a fractional exponent is NaN,
           which reaches the canvas as an unparseable colour. */
        const fade = Math.pow(Math.max(0, Math.sin(Math.PI * p)), 1.35);
        const tw = 0.62 + 0.38 * Math.sin((p * s.tw + s.off) * TAU);
        const a = fade * tw * (0.80 + b * 0.45);
        if (a <= 0.004) continue;
        dot(x, y, s.size * (1.7 + tw * 0.6), a * 0.20);
        dot(x, y, s.size * 0.98, a);
        if (s.glint && a > 0.2) glint(x, y, s.size * 4.6, a * 0.8);
      }
    };
    if (still) renderAt(BEAT * 0.14); // one settled frame, no loop
    else {
      let t0: number | null = null;
      const frame = (now: number): void => {
        if (t0 === null) t0 = now;
        renderAt((now - t0) / 1000);
        if (!gone) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }
  }

  /* Long enough to read as a beat, never long enough to feel like a hang. The
     hard cap fires whatever else happens, so a slow font or a failed fetch can
     never leave the app sitting behind the splash. */
  const MIN = still ? 450 : 1250, MAX = 2800, start = Date.now();
  const done = (): void => {
    if (gone) return;
    gone = true;
    if (raf) cancelAnimationFrame(raf);
    boot.classList.add('gone');
    setTimeout(() => boot.remove(), 650);
  };
  const settle = (): void => { setTimeout(done, Math.max(0, MIN - (Date.now() - start))); };
  setTimeout(done, MAX);
  boot.addEventListener('click', done); // tap to skip
  let fontsReady: Promise<unknown> | null = null;
  try { fontsReady = document.fonts ? document.fonts.ready : null; } catch { /* ignore */ }
  if (fontsReady) fontsReady.then(settle, settle); else settle();
}
