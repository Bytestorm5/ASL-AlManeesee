/* Recitation audio + "Listen & Repeat" memorisation.
   Recordings live in R2 (uploaded through /admin/upload) and are discovered
   through the audio manifest (/api/audio/<set>), which maps every bayt to the
   newest recording per reciter, played same-origin from /media/. The set is
   window.ASL_AUDIO_POEM — the matn id, or "<id>-n<k>" when edition k is being
   read — so each edition plays its own recordings. The Listen & Repeat panel
   loops a chosen range with configurable per-bayt and per-range repeats,
   speed, and an optional "pause to recite" gap — the classic echo method for
   ḥifẓ. Self-contained. */
import type { AudioManifest, AudioReciter } from '../../poems/types.ts';
import { getAudioManifest } from '../api.ts';
import { currentPoem, currentPoemId, esc, lsGet, lsSet } from '../page.ts';

// Normalise a manifest into a list of reciters: { id, name, abyat[], urls }.
// urls maps bayt → the same-origin URL of the newest recording; a bayt is
// listed only when it has one.
function parseReciters(data: AudioManifest | null): AudioReciter[] {
  const nums = (a: unknown[] | undefined) => (a || []).map(Number).filter((n) => n > 0).sort((x, y) => x - y);
  if (!data || !Array.isArray(data.reciters)) return [];
  return data.reciters
    .map((r) => {
      const urls = r.urls && typeof r.urls === 'object' ? r.urls : {};
      return {
        id: r.id,
        name: (r.name || r.id || '').trim(),
        abyat: nums(r.abyat).filter((n) => !!urls[n]),
        urls,
        bytes: Number(r.bytes) || 0,
      };
    })
    .filter((r) => r.id && r.abyat.length);
}

interface Cfg {
  from: number; to: number; each: number; range: number; speed: number; gap: boolean;
  mode: 'bayt' | 'chapter'; chFrom: string | null; chTo: string | null;
}
interface Session {
  q: number[]; i: number; eachDone: number; each: number; rangeDone: number; range: number;
  speed: number; gap: boolean; paused: boolean; inGap: boolean;
}
interface ChapterInfo { num: string; ar: string; first: number; last: number }

/* A reciter only appears once they have a meaningful set for this matn —
   stray test uploads (a handful of abyat) stay invisible until the real
   recording run is under way. A matn shorter than that needs all of it. */
function fetchReciters(set: string): Promise<AudioReciter[]> {
  const min = Math.min(8, currentPoem()?.verses ?? 8);
  return getAudioManifest(set)
    .catch(() => null)
    .then((res) => parseReciters(res).filter((r) => r.abyat.length >= min));
}

export function init(): void {
  const main = document.getElementById('main');
  if (!main) return;
  // The renderer points the player at the recording set of the edition being
  // read (e.g. '<id>-n2' for a matn's second nuskha).
  const poem = window.ASL_AUDIO_POEM || currentPoemId();
  if (!poem) return;
  fetchReciters(poem).then((recs) => {
    if (recs.length) start(main, poem, recs);
  }).catch(() => { /* no recitations */ });
}

function start(main: HTMLElement, poem: string, reciters: AudioReciter[]): void {
  const SKEY = 'asl-audio-' + poem;
  const RKEY = 'asl-reciter-' + poem;
  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;

  // Reciter-dependent state — (re)assigned by buildForReciter when the voice
  // changes. Declared here so every closure below reads the current values.
  let curRec: AudioReciter | null = null;
  let available: number[] = [];
  let SET: Record<number, 1> = {};
  let verseByN: Record<number, HTMLElement> = {};
  let chapters: ChapterInfo[] = [];
  let chapById: Record<string, ChapterInfo> = {};

  function pickDefault(): AudioReciter {
    const stored = lsGet(RKEY);
    const byId = reciters.find((r) => (r.id || '') === stored);
    if (byId) return byId;
    // else the reciter with the fullest coverage (so nothing looks missing)
    return reciters.slice().sort((a, b) => b.abyat.length - a.abyat.length)[0]!;
  }

  const ICON_HEAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="3" y="13" width="4" height="7" rx="1.6"/><rect x="17" y="13" width="4" height="7" rx="1.6"/></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5.5" width="4" height="13" rx="1"/><rect x="13.5" y="5.5" width="4" height="13" rx="1"/></svg>';
  const ICON_PREV = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5h2.2v13H7zM19 5.5l-9 6.5 9 6.5z"/></svg>';
  const ICON_NEXT = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14.8 5.5H17v13h-2.2zM5 5.5l9 6.5-9 6.5z"/></svg>';

  const css = [
    /* top-bar launcher (headphone), placed between bookmark and search */
    '.aud-launch{flex:0 0 auto;cursor:pointer;display:inline-grid;place-items:center;width:34px;height:34px;padding:0;',
    'border-radius:50%;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447);',
    '-webkit-tap-highlight-color:transparent;transition:background .15s,border-color .15s}',
    '.aud-launch:hover{border-color:var(--gilt,#c0973c)}',
    '.aud-launch svg{width:19px;height:19px}',
    '.navbar-inner .aud-launch{order:5}',
    '.navbar-inner .searchbtn{order:6}',
    '.navbar-inner .helpbtn{order:7}',
    '.aud-btn{flex:0 0 auto;display:inline-grid;place-items:center;width:26px;height:26px;padding:0;',
    'border-radius:50%;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447);',
    'cursor:pointer;transition:background .15s,border-color .15s,color .15s;-webkit-tap-highlight-color:transparent}',
    '.aud-btn:hover{border-color:var(--gilt,#c0973c)}',
    '.aud-btn svg{width:15px;height:15px;display:block}',
    '.aud-btn.playing{background:var(--madder,#8a4447);color:#fff;border-color:var(--madder,#8a4447)}',
    '.verse.aud-cur{background:var(--paper-2,#f3eada);border-radius:10px;box-shadow:inset 3px 0 0 var(--gilt,#c0973c);scroll-margin-top:120px}',
    '.audov{position:fixed;inset:0;z-index:440;background:rgba(58,42,43,.5);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);',
    'display:flex;align-items:center;justify-content:center;padding:18px;opacity:0;transition:opacity .18s}',
    '.audov.show{opacity:1}',
    '.audcard{width:100%;max-width:400px;max-height:90vh;overflow:auto;background:var(--paper,#f9f4ea);border-radius:16px;',
    'padding:18px 18px 20px;box-shadow:0 24px 60px rgba(0,0,0,.4);font-family:"Montserrat",sans-serif}',
    '.audcard h3{font-family:"Cormorant Garamond",Georgia,serif;color:var(--madder,#8a4447);font-size:1.45rem;margin:0 0 2px}',
    '.audcard .sub{color:var(--sage,#9c7f80);font-size:.74rem;font-weight:600;margin:0 0 15px;line-height:1.5}',
    '.audrow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 0;border-top:1px solid var(--paper-edge,#e8dcc7)}',
    '.audrow .lbl{font-size:.82rem;font-weight:700;color:var(--ink,#3a2a2b)}',
    '.audrow .lbl small{display:block;font-size:.68rem;font-weight:600;color:var(--sage,#9c7f80);margin-top:2px}',
    /* min-width:0 lets the selects give way on a narrow phone: two chapter
       names side by side otherwise push the card into a sideways scroll. */
    '.audsel{display:inline-flex;align-items:center;gap:7px;min-width:0}',
    '.audsel select{min-width:0}',
    '.audsel select{font-family:inherit;font-size:.86rem;font-weight:700;color:var(--madder,#8a4447);background:var(--surface,#fff);',
    'border:1px solid var(--paper-edge,#e8dcc7);border-radius:9px;padding:7px 9px;-webkit-appearance:none;appearance:none}',
    '.audstep{display:inline-flex;align-items:center;gap:2px;border:1px solid var(--paper-edge,#e8dcc7);border-radius:20px;background:var(--surface,#fff);overflow:hidden}',
    '.audstep button{width:32px;height:32px;border:0;background:transparent;color:var(--madder,#8a4447);font-size:1.1rem;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.audstep .v{min-width:34px;text-align:center;font-size:.9rem;font-weight:700;color:var(--ink,#3a2a2b);font-variant-numeric:tabular-nums}',
    '.audspeed{display:inline-flex;border:1px solid var(--paper-edge,#e8dcc7);border-radius:20px;overflow:hidden;background:var(--surface,#fff)}',
    '.audspeed button{border:0;background:transparent;color:var(--ink-soft,#6c585a);font-family:inherit;font-size:.74rem;font-weight:700;padding:7px 8px;cursor:pointer;-webkit-tap-highlight-color:transparent;white-space:nowrap}',
    '.audspeed button.on{background:var(--madder,#8a4447);color:#fbeee8}',
    /* Abyāt / Chapters mode switch — a full-width segmented control */
    '.audmode{display:flex;width:100%;margin:2px 0 4px;border:1px solid var(--paper-edge,#e8dcc7);border-radius:22px;overflow:hidden;background:var(--surface,#fff)}',
    '.audmode button{flex:1 1 0;border:0;background:transparent;color:var(--ink-soft,#6c585a);font-family:inherit;font-size:.8rem;font-weight:700;padding:9px 6px;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.audmode button.on{background:var(--madder,#8a4447);color:#fbeee8}',
    '.audsel select.a-chfrom,.audsel select.a-chto{max-width:112px;text-overflow:ellipsis}',
    '.audsel select.a-reciter{max-width:190px;text-overflow:ellipsis}',
    '.audtog{position:relative;width:42px;height:24px;border-radius:12px;background:var(--paper-edge,#e8dcc7);border:0;cursor:pointer;flex:0 0 auto;transition:background .15s}',
    '.audtog::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .15s;box-shadow:0 1px 3px rgba(0,0,0,.3)}',
    '.audtog.on{background:var(--madder,#8a4447)}.audtog.on::after{left:21px}',
    '.audstart{margin-top:16px;width:100%;display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;',
    'border:0;border-radius:24px;background:var(--madder,#8a4447);color:#fbeee8;font-family:inherit;font-size:.92rem;font-weight:700;padding:13px}',
    '.audstart svg{width:18px;height:18px}',
    '.audcancel{margin-top:9px;width:100%;border:0;background:transparent;color:var(--sage,#9c7f80);font-family:inherit;font-size:.8rem;font-weight:700;cursor:pointer;padding:6px}',
    /* floating card, centred and capped at the abyāt column width (--maxw) */
    '.audbar{position:fixed;left:50%;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:250;',
    'width:min(var(--maxw,940px),calc(100% - 20px));background:var(--surface,#fff);border:1px solid var(--paper-edge,#e8dcc7);',
    'border-radius:16px;box-shadow:0 10px 30px rgba(58,28,31,.2);padding:9px 12px;font-family:"Montserrat",sans-serif;',
    'transform:translate(-50%,calc(100% + 50px));transition:transform .22s ease}',
    '.audbar.show{transform:translate(-50%,0)}',
    /* installed app: float above the bottom tab bar instead of covering it */
    'body.appmode .audbar{display:none}',
    '.audbar .prog{height:4px;border-radius:3px;background:var(--paper-edge,#e8dcc7);overflow:hidden;margin:0 2px 8px}',
    '.audbar .prog i{display:block;height:100%;width:0;background:var(--gilt,#c0973c)}',
    '.audbar .r{display:flex;align-items:center;gap:9px}',
    '.audbar .meta{flex:1 1 auto;min-width:0}',
    '.audbar .meta .t{font-size:.86rem;font-weight:700;color:var(--madder,#8a4447);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.audbar .meta .s{font-size:.66rem;font-weight:600;color:var(--sage,#9c7f80);margin-top:1px}',
    '.audbar .c{flex:0 0 auto;display:inline-grid;place-items:center;width:38px;height:38px;border-radius:50%;border:1px solid var(--paper-edge,#e8dcc7);',
    'background:var(--surface,#fff);color:var(--madder,#8a4447);cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.audbar .c.pp{width:46px;height:46px;background:var(--madder,#8a4447);color:#fbeee8;border-color:var(--madder,#8a4447)}',
    '.audbar .c svg{width:20px;height:20px}.audbar .c.pp svg{width:24px;height:24px}',
    '.audbar .x{background:transparent;border:0;color:var(--sage,#9c7f80);width:32px;height:32px;font-size:1rem}',
    'body.aud-on{padding-bottom:130px}',
    'body.appmode.aud-on{padding-bottom:calc(58px + env(safe-area-inset-bottom,0px))}',
    '@media (prefers-reduced-motion:reduce){.audbar{transition:none}}',
    /* The offline offer, clear of the player bar: on the website the bar is
       about 78px tall and floats 10px off the bottom, so the card starts
       above that; in the installed app the bar is hidden and the only thing
       to clear is the 58px tab bar. Above the bar in the stack too — the two
       overlap on a short screen, and the bar would swallow the taps. */
    '.audoff{position:fixed;left:12px;right:12px;bottom:calc(100px + env(safe-area-inset-bottom,0px));z-index:251;',
    '  background:var(--surface,#fffdf8);border:1px solid var(--paper-edge,#e8dcc7);border-radius:14px;',
    '  box-shadow:0 8px 26px rgba(94,44,48,.18);padding:12px 14px;max-width:520px;margin:0 auto;',
    '  transform:translateY(12px);opacity:0;transition:transform .22s ease,opacity .22s ease}',
    '.audoff.show{transform:none;opacity:1}',
    'body.appmode .audoff{bottom:calc(70px + env(safe-area-inset-bottom,0px))}',
    '.audoff .t{font-family:"Cormorant Garamond",serif;font-weight:700;font-size:1.02rem;color:var(--ink,#3a2a2b)}',
    '.audoff .s{font-family:"Montserrat",sans-serif;font-size:.74rem;color:var(--ink-soft,#6c585a);margin-top:2px}',
    '.audoff .r{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}',
    '.audoff button{font-family:"Montserrat",sans-serif;font-size:.76rem;font-weight:600;border-radius:999px;',
    '  padding:7px 14px;border:1px solid var(--paper-edge,#e8dcc7);background:transparent;color:var(--ink-soft,#6c585a);cursor:pointer}',
    '.audoff button.go{background:var(--madder,#8a4447);border-color:var(--madder,#8a4447);color:#fff}',
    '@media (prefers-reduced-motion:reduce){.audoff{transition:none}}',
  ].join('');
  const st = document.createElement('style'); st.appendChild(document.createTextNode(css)); document.head.appendChild(st);

  // ---------- player core ----------
  const audio = new Audio();
  audio.preload = 'auto';
  let curN: number | null = null;      // bayt number currently loaded in the element
  let session: Session | null = null;  // active Listen & Repeat session, or null
  let gapTimer: number | undefined;
  let wakeLock: WakeLockSentinel | null = null;
  let playingN: number | null = null;  // the one bayt whose button is showing "playing"
  let scrolledN: number | null = null; // the one we last brought on screen
  let wantRate = 1;                    // the speed asked for, re-applied whenever media loads
  let watchdog: number | null = null, lastTick = 0, playToken = 0, misfires = 0;

  function srcFor(n: number): string {
    return curRec?.urls[n] ?? '';
  }
  /* Keeping what plays, and what is about to play ------------------------
     Two things went wrong on a weak connection. A loop moving from one bayt
     to the next was a cold request every time — the browser holds a file it
     has already fetched, so repeats of ONE bayt were fine, but stepping
     through a range was not. And nothing a reader listened to was kept, so
     the same range was fetched again from scratch the next day.

     So each bayt the session is about to need is pulled into the same
     'asl-audio' cache the offline download fills and the service worker
     serves from. Whole-file GETs, because the service worker cuts its own
     206s out of them — an <audio> element asks for byte ranges, and a range
     response would be useless to it later. */
  const CAN_CACHE = ('caches' in window) && ('serviceWorker' in navigator);
  const warming = new Set<string>();
  function abs(url: string): string { try { return new URL(url, location.href).href; } catch { return url; } }
  function warm(url: string): void {
    if (!CAN_CACHE || !url || warming.has(url)) return;
    // Never race the player for the file it is fetching right now: that
    // would ask a weak connection for the same bayt twice at once, which is
    // the opposite of the point.
    if (abs(url) === audio.currentSrc) return;
    warming.add(url);
    const done = () => { warming.delete(url); };
    caches.open('asl-audio').then((c) => c.match(url).then((hit) => {
      if (hit) return null;
      return fetch(url, { credentials: 'omit' }).then((res) => {
        if (res && res.status === 200) return c.put(url, res);
        return undefined;
      });
    })).then(done, done);
  }
  /* The next three, never the current one — the <audio> element is already
     fetching that. Far enough ahead to cover a slow fetch, short enough that
     skipping around does not pull the whole matn. At the end of a range that
     repeats, reach round to the front of it. */
  function warmAhead(): void {
    if (!session) return;
    const q = session.q, n = q.length, loop = session.rangeDone + 1 < session.range;
    for (let k = 1; k <= 3; k++) {
      let j = session.i + k;
      if (j >= n) { if (!loop) break; j -= n; if (j >= session.i) break; }
      warm(srcFor(q[j]!));
    }
  }

  function reqWake(): void {
    try {
      if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then((w) => { wakeLock = w; }, () => {});
    } catch { /* unsupported */ }
  }
  function relWake(): void { try { if (wakeLock) { void wakeLock.release(); wakeLock = null; } } catch { /* ignore */ } }

  /* Exactly one button ever shows "playing", so only that one is ever
     repainted. This used to rewrite the icon of every recorded bayt on the
     page — sixty-odd innerHTML parses, each re-parsing an SVG — and it runs
     once per repeat, in the moment between a track ending and the next one
     having to start. On a phone that is real work at the worst possible
     time, and it is what makes the restart below miss. */
  function paintBtn(n: number, on: boolean): void {
    const v = verseByN[n]; if (!v) return;
    const btn = v.querySelector('.aud-btn'); if (!btn) return;
    btn.classList.toggle('playing', on);
    btn.innerHTML = on ? ICON_PAUSE : ICON_PLAY;
    btn.setAttribute('aria-label', on ? 'Pause' : 'Play this bayt');
  }
  function markPlaying(n: number | null | undefined, on: boolean): void {
    if (n == null) return;
    if (on) {
      if (playingN === n) return;
      if (playingN != null) paintBtn(playingN, false);
      paintBtn(n, true); playingN = n;
    } else {
      if (playingN !== n) return;
      paintBtn(n, false); playingN = null;
    }
  }
  function clearPlaying(): void { if (playingN != null) markPlaying(playingN, false); }
  function clearHighlight(): void { document.querySelectorAll('.verse.aud-cur').forEach((v) => v.classList.remove('aud-cur')); }

  /* Starting the track is the one thing this player cannot afford to get
     wrong, because a failure here is silent and final: the loop is driven
     entirely by the 'ended' event, so a play() that never starts means no
     'ended' ever arrives and the session simply stops — which is what a
     reader sees as the repeat "breaking" a few loops in, with the player
     bar still sitting there. So hold on to the promise instead of throwing
     it away, and if the play is refused, reload the track and try again. */
  function loadPlay(n: number, rate: number): void {
    wantRate = rate || 1;
    const mine = ++playToken;
    if (curN !== n) { audio.src = srcFor(n); curN = n; }
    else { try { audio.currentTime = 0; } catch { /* not seekable yet */ } }
    audio.playbackRate = wantRate;
    armWatchdog();
    let p: Promise<void> | undefined;
    try { p = audio.play(); } catch { replay(mine, n); return; }
    if (p && p.catch) p.catch(() => replay(mine, n));
  }
  /* A refused play is almost always a restart that raced the seek it just
     asked for, so come back to it with a clean load rather than giving up. */
  function replay(token: number, n: number): void {
    if (!session || session.paused || token !== playToken) return;
    const mine = ++playToken;      // this retry now owns the track
    setTimeout(() => {
      if (!session || session.paused || mine !== playToken) return;
      try { audio.pause(); } catch { /* ignore */ }
      audio.src = srcFor(n); curN = n;
      audio.playbackRate = wantRate;
      const p = audio.play();
      if (p && p.catch) p.catch(() => {
        // still refused — treat this repeat as spent and carry on
        if (session && !session.paused && mine === playToken) afterBayt();
      });
    }, 150);
  }

  /* Nothing about a media element is dependable on a phone: a track can
     fail to fetch, the system can take the audio session away for a
     notification, an 'ended' can simply not arrive. A loop that only ever
     waits to be told what happened cannot notice any of that — it just
     stops. So watch that playback is still making progress, and push it
     along when it is not. If pushing does not help several times over, park
     the session as paused so the reader has something to tap, rather than
     leaving a player that has quietly died. */
  /* NETWORK_LOADING with too little buffered to play on is a bayt still
     arriving, not one that has died. On a slow connection that is most of
     the first seconds of every new bayt — and counting it as a misfire is
     precisely what made a loop jump forward, or park itself after three of
     them. Wait on it, but not forever: thirty seconds and it has failed. */
  function fetching(): boolean { return audio.networkState === 2 && audio.readyState < 3; }
  function armWatchdog(): void {
    lastTick = Date.now();
    if (watchdog) return;
    watchdog = window.setInterval(() => {
      if (!session || session.paused || session.inGap) { lastTick = Date.now(); return; }
      const idle = Date.now() - lastTick;
      if (idle < 6000) return;
      if (fetching() && idle < 30000) return;
      lastTick = Date.now();
      if (++misfires > 3) { pauseSession(); return; }
      if (audio.paused) { const p = audio.play(); if (p && p.catch) p.catch(() => afterBayt()); }
      else afterBayt();     // running but going nowhere — count it and move on
    }, 2000);
  }
  function disarmWatchdog(): void { if (watchdog) clearInterval(watchdog); watchdog = null; misfires = 0; }

  // per-bayt play buttons — re-rendered whenever the reciter (and thus which
  // abyāt have audio) changes.
  function renderBaytButtons(): void {
    main.querySelectorAll('.aud-btn').forEach((b) => b.remove());
    playingN = null;   // the buttons that carried that state have just gone
    for (const key of Object.keys(verseByN)) {
      const n = Number(key), v = verseByN[n]!;
      let row = v.querySelector('.verse-actions');
      if (!row) { row = document.createElement('div'); row.className = 'verse-actions'; v.appendChild(row); }
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'aud-btn'; btn.innerHTML = ICON_PLAY;
      btn.title = 'Play this bayt'; btn.setAttribute('aria-label', 'Play this bayt');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Tapping the bayt that's already playing pauses/resumes. During a
        // session, tapping another bayt that's inside the loop jumps the
        // loop there, keeping the configured range/repeats — replacing the
        // session here would turn a chapter loop into play-to-the-end and
        // sail past the chapter. Otherwise start continuous playback from
        // this bayt through the rest.
        if (session && session.q[session.i] === n) { togglePP(); return; }
        if (session && session.q.includes(n)) { jumpTo(session.q.indexOf(n)); return; }
        const cfg = loadCfg();
        startSession({ ...cfg, from: n, to: available[available.length - 1]!, each: 1, range: 1, gap: false });
      });
      row.insertBefore(btn, row.firstChild);
    }
  }

  // Switch the active voice: recompute which abyāt/chapters have audio, redraw
  // the per-bayt buttons, remember the choice, and stop any running session.
  function buildForReciter(rec: AudioReciter): void {
    if (session) stopSession();
    curRec = rec;
    // Drop the loaded track: the same bayt number must reload from the new
    // reciter's recordings (loadPlay skips setting src when curN matches).
    try { audio.pause(); } catch { /* ignore */ }
    audio.removeAttribute('src');
    curN = null;
    available = rec.abyat.slice();
    SET = {}; for (const n of available) SET[n] = 1;
    verseByN = {};
    main.querySelectorAll<HTMLElement>('.verse').forEach((v) => {
      const vn = v.querySelector('.vn');
      const n = vn ? parseInt((vn.textContent || '').trim(), 10) : NaN;
      if (n && SET[n]) verseByN[n] = v;
    });
    // Chapter map: for each chapter that has any recorded abyāt, record its
    // Arabic name and the first/last bayt with audio, so Listen & Repeat can
    // loop a whole chapter (or a run of chapters) instead of picking abyāt.
    chapters = [];
    main.querySelectorAll('section.chapter').forEach((sec) => {
      const nums = [...sec.querySelectorAll('.verse .vn')]
        .map((v) => parseInt((v.textContent || '').trim(), 10))
        .filter((n) => n && SET[n]);
      if (!nums.length) return;
      const arEl = sec.querySelector('.ch-ar');
      chapters.push({
        num: (sec.id || '').replace('ch', ''),
        ar: arEl ? (arEl.textContent || '').trim() : '',
        first: Math.min(...nums),
        last: Math.max(...nums),
      });
    });
    chapById = {}; for (const c of chapters) chapById[c.num] = c;
    renderBaytButtons();
    if (window.AslAudio) { window.AslAudio.list = available; window.AslAudio.reciter = rec.id; }
    lsSet(RKEY, rec.id || '');
  }

  // top-bar launcher (headphone) — between the bookmark and search icons
  const navInner = document.querySelector('.navbar-inner');
  if (navInner) {
    const launch = document.createElement('button');
    launch.type = 'button'; launch.className = 'aud-launch';
    launch.title = 'Listen & repeat'; launch.setAttribute('aria-label', 'Listen and repeat');
    launch.innerHTML = ICON_HEAD;
    launch.addEventListener('click', (e) => { e.stopPropagation(); openPanel(); });
    const bm = navInner.querySelector('.bmmenu');
    if (bm && bm.nextSibling) navInner.insertBefore(launch, bm.nextSibling);
    else navInner.appendChild(launch);
  }

  audio.addEventListener('play', () => { if (curN != null) markPlaying(curN, true); keepRate(); });
  audio.addEventListener('pause', () => { if (curN != null && !session) markPlaying(curN, false); });
  audio.addEventListener('playing', () => { misfires = 0; lastTick = Date.now(); });
  audio.addEventListener('timeupdate', () => {
    lastTick = Date.now();
    if (session && barProg && audio.duration) barProg.style.width = (100 * audio.currentTime / audio.duration) + '%';
  });
  // iOS drops playbackRate when a new track loads, so re-assert it once the
  // media is actually there instead of only at the moment play() is called.
  function keepRate(): void { if (audio.playbackRate !== wantRate) { try { audio.playbackRate = wantRate; } catch { /* ignore */ } } }
  audio.addEventListener('loadedmetadata', keepRate);
  audio.addEventListener('ended', () => {
    if (!session) { markPlaying(curN, false); return; }
    if (session.paused) return;
    /* Out of this handler before touching the element again. Seeking back
       to the start and calling play() while 'ended' is still being
       dispatched is what WebKit refuses, and a refused play is a stopped
       session — so let the event finish first. */
    setTimeout(scheduleNext, 0);
  });
  // A track that will not load must not be the end of the session either.
  // Tokened, so it stands aside if a retry has meanwhile taken the track on.
  audio.addEventListener('error', () => {
    if (!session || session.paused) return;
    const token = playToken;
    setTimeout(() => { if (session && !session.paused && token === playToken) afterBayt(); }, 250);
  });

  // ---------- settings ----------
  function loadCfg(): Cfg {
    const first = chapters[0]?.num ?? null;
    const d: Cfg = {
      from: available[0]!, to: available[available.length - 1]!, each: 3, range: 1, speed: 1, gap: false,
      mode: 'bayt', chFrom: first, chTo: first,
    };
    let o: Record<string, unknown> | null = null;
    try { o = JSON.parse(lsGet(SKEY) || 'null') as Record<string, unknown> | null; } catch { /* defaults */ }
    if (o && typeof o === 'object') {
      const reps = (v: unknown, dflt: number) => (v === '∞' ? Infinity : v == null ? dflt : Number(v) || dflt);
      if (o.from != null) d.from = Number(o.from);
      if (o.to != null) d.to = Number(o.to);
      d.each = reps(o.each, d.each);
      d.range = reps(o.range, d.range);
      if (o.speed != null) d.speed = Number(o.speed) || 1;
      if (o.gap != null) d.gap = !!o.gap;
      if (o.mode != null) d.mode = o.mode === 'chapter' ? 'chapter' : 'bayt';
      if (o.chFrom != null) d.chFrom = String(o.chFrom);
      if (o.chTo != null) d.chTo = String(o.chTo);
    }
    if (!SET[d.from]) d.from = available[0]!;
    if (!SET[d.to]) d.to = available[available.length - 1]!;
    if (d.from > d.to) d.to = d.from;
    if (d.mode !== 'chapter' || !chapters.length) d.mode = 'bayt';
    if (d.chFrom == null || !chapById[d.chFrom]) d.chFrom = first;
    if (d.chTo == null || !chapById[d.chTo]) d.chTo = first;
    return d;
  }
  function saveCfg(c: Cfg): void {
    const o = {
      from: c.from, to: c.to, speed: c.speed, gap: c.gap, each: c.each === Infinity ? '∞' : c.each, range: c.range === Infinity ? '∞' : c.range,
      mode: c.mode || 'bayt', chFrom: c.chFrom, chTo: c.chTo,
    };
    lsSet(SKEY, JSON.stringify(o));
  }
  function stepLabel(v: number): string { return v === Infinity ? '∞' : String(v); }
  function stepInc(v: number, dir: number): number {
    if (dir > 0) return v === Infinity ? Infinity : (v >= 10 ? Infinity : v + 1);
    return v === Infinity ? 10 : Math.max(1, v - 1);
  }

  // ---------- setup modal ----------
  function openPanel(): void {
    if (session) { stopSession(); }
    const cfg = loadCfg();
    let each = cfg.each, range = cfg.range, speed = cfg.speed, gap = !!cfg.gap;
    let mode = cfg.mode;
    const hasChapters = chapters.length > 0;
    if (!hasChapters) mode = 'bayt';
    const ov = document.createElement('div'); ov.className = 'audov';
    const baytOpts = () => available.map((n) => '<option value="' + n + '">Bayt ' + n + '</option>').join('');
    const chapOpts = () => chapters.map((c) => '<option value="' + c.num + '">' + esc(c.ar || ('Chapter ' + c.num)) + '</option>').join('');
    const opts = baytOpts();
    const chOpts = chapOpts();
    const arrow = '<span style="color:var(--sage,#9c7f80);font-weight:700">→</span>';
    const stepHTML = (id: string) => '<span class="audstep" data-step="' + id + '"><button type="button" data-d="-1" aria-label="less">–</button><span class="v"></span><button type="button" data-d="1" aria-label="more">+</button></span>';
    ov.innerHTML =
      '<div class="audcard" role="dialog" aria-label="Listen and repeat">'
      + '<h3>Listen &amp; Repeat</h3>'
      + '<p class="sub">Loop abyāt — or a whole chapter — to memorise by ear. Only recorded abyāt are listed.</p>'
      + (reciters.length >= 2
        ? '<div class="audrow a-recrow"><span class="lbl">Reciter</span><span class="audsel"><select class="a-reciter" aria-label="Reciter">'
          + reciters.map((r) => '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>').join('')
          + '</select></span></div>'
        : '')
      + (hasChapters
        ? '<div class="audmode" role="tablist"><button type="button" data-md="bayt">By bayt</button><button type="button" data-md="chapter">By chapter</button></div>'
        : '')
      + '<div class="audrow"><span class="lbl a-rlbl">Range</span>'
      + '<span class="audsel a-baytsel"><select class="a-from" aria-label="From bayt">' + opts + '</select>' + arrow
      + '<select class="a-to" aria-label="To bayt">' + opts + '</select></span>'
      + (hasChapters
        ? '<span class="audsel a-chapsel"><select class="a-chfrom" aria-label="From chapter">' + chOpts + '</select>' + arrow
          + '<select class="a-chto" aria-label="To chapter">' + chOpts + '</select></span>'
        : '')
      + '</div>'
      + '<div class="audrow"><span class="lbl">Repeat each bayt</span>' + stepHTML('each') + '</div>'
      + '<div class="audrow"><span class="lbl">Repeat the range</span>' + stepHTML('range') + '</div>'
      + '<div class="audrow"><span class="lbl">Speed</span><span class="audspeed">'
      + [0.75, 1, 1.25, 1.5, 1.75, 2].map((s) => '<button type="button" data-sp="' + s + '">' + (s === 1 ? '1×' : s + '×') + '</button>').join('') + '</span></div>'
      + '<div class="audrow"><span class="lbl">Pause to recite<small>Silent gap after each bayt</small></span>'
      + '<button type="button" class="audtog a-gap" role="switch" aria-label="Pause to recite"></button></div>'
      + '<button type="button" class="audstart">' + ICON_PLAY + ' Start</button>'
      + '<button type="button" class="audcancel">Cancel</button></div>';
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));

    const fromSel = ov.querySelector<HTMLSelectElement>('.a-from')!, toSel = ov.querySelector<HTMLSelectElement>('.a-to')!;
    fromSel.value = String(cfg.from); toSel.value = String(cfg.to);
    const chFromSel = ov.querySelector<HTMLSelectElement>('.a-chfrom'), chToSel = ov.querySelector<HTMLSelectElement>('.a-chto');
    if (chFromSel && chToSel) { chFromSel.value = cfg.chFrom ?? ''; chToSel.value = cfg.chTo ?? ''; }
    const baytSel = ov.querySelector<HTMLElement>('.a-baytsel'), chapSel = ov.querySelector<HTMLElement>('.a-chapsel'), rlbl = ov.querySelector('.a-rlbl');

    // Reciter picker (only present with ≥2 voices): switching rebuilds the
    // recorded-abyāt/chapter coverage, then refreshes the range dropdowns.
    const recSel = ov.querySelector<HTMLSelectElement>('.a-reciter');
    const refreshRanges = () => {
      const o = baytOpts();
      fromSel.innerHTML = o; toSel.innerHTML = o;
      fromSel.value = String(available[0]); toSel.value = String(available[available.length - 1]);
      if (chFromSel && chToSel) {
        const co = chapOpts();
        chFromSel.innerHTML = co; chToSel.innerHTML = co;
        if (chapters.length) { chFromSel.value = chapters[0]!.num; chToSel.value = chapters[0]!.num; }
      }
    };
    if (recSel) {
      recSel.value = curRec?.id || '';
      recSel.addEventListener('change', () => {
        const r = reciters.find((x) => (x.id || '') === recSel.value);
        if (r) { buildForReciter(r); refreshRanges(); }
      });
    }

    const paintMode = () => {
      if (!hasChapters) return;
      ov.querySelectorAll('.audmode button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-md') === mode));
      const chap = mode === 'chapter';
      if (baytSel) baytSel.style.display = chap ? 'none' : '';
      if (chapSel) chapSel.style.display = chap ? '' : 'none';
      if (rlbl) rlbl.textContent = chap ? 'Chapters' : 'Range';
    };
    paintMode();
    ov.querySelectorAll('.audmode button').forEach((b) => {
      b.addEventListener('click', () => { mode = b.getAttribute('data-md') === 'chapter' ? 'chapter' : 'bayt'; paintMode(); });
    });
    const paintSteps = () => {
      ov.querySelector('[data-step="each"] .v')!.textContent = stepLabel(each);
      ov.querySelector('[data-step="range"] .v')!.textContent = stepLabel(range);
    };
    paintSteps();
    ov.querySelectorAll('.audstep button').forEach((b) => {
      b.addEventListener('click', () => {
        const which = b.parentElement?.getAttribute('data-step'), d = +(b.getAttribute('data-d') || 0);
        if (which === 'each') each = stepInc(each, d); else range = stepInc(range, d);
        paintSteps();
      });
    });
    const paintSpeed = () => { ov.querySelectorAll('.audspeed button').forEach((b) => b.classList.toggle('on', +(b.getAttribute('data-sp') || 0) === speed)); };
    paintSpeed();
    ov.querySelectorAll('.audspeed button').forEach((b) => b.addEventListener('click', () => { speed = +(b.getAttribute('data-sp') || 1); paintSpeed(); }));
    const gapTog = ov.querySelector<HTMLElement>('.a-gap')!;
    const paintGap = () => { gapTog.classList.toggle('on', gap); gapTog.setAttribute('aria-checked', gap ? 'true' : 'false'); };
    paintGap();
    gapTog.addEventListener('click', () => { gap = !gap; paintGap(); });
    fromSel.addEventListener('change', () => { if (+toSel.value < +fromSel.value) toSel.value = fromSel.value; });
    toSel.addEventListener('change', () => { if (+toSel.value < +fromSel.value) fromSel.value = toSel.value; });
    if (chFromSel && chToSel) {
      const firstOf = (sel: HTMLSelectElement) => chapById[sel.value]?.first ?? 0;
      chFromSel.addEventListener('change', () => { if (firstOf(chToSel) < firstOf(chFromSel)) chToSel.value = chFromSel.value; });
      chToSel.addEventListener('change', () => { if (firstOf(chToSel) < firstOf(chFromSel)) chFromSel.value = chToSel.value; });
    }

    const close = () => { ov.classList.remove('show'); setTimeout(() => ov.remove(), 200); };
    ov.querySelector('.audcancel')!.addEventListener('click', close);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.audstart')!.addEventListener('click', () => {
      let from: number, to: number;
      const a = chFromSel && chapById[chFromSel.value], z = chToSel && chapById[chToSel.value];
      if (mode === 'chapter' && hasChapters && a && z) {
        from = Math.min(a.first, z.first); to = Math.max(a.last, z.last);
      } else {
        from = +fromSel.value; to = +toSel.value;
      }
      const c: Cfg = {
        from, to, each, range, speed, gap,
        mode, chFrom: chFromSel ? chFromSel.value : null, chTo: chToSel ? chToSel.value : null,
      };
      saveCfg(c); close(); startSession(c);
    });
  }

  // ---------- Listen & Repeat session ----------
  let bar: HTMLElement | null = null, barProg: HTMLElement | null = null;
  let barTitle: HTMLElement | null = null, barSub: HTMLElement | null = null, ppBtn: HTMLElement | null = null;
  function buildBar(): HTMLElement {
    const b = document.createElement('div'); b.className = 'audbar'; b.setAttribute('aria-label', 'Listen and repeat player');
    b.innerHTML =
      '<div class="prog"><i></i></div><div class="r">'
      + '<button type="button" class="c b-prev" aria-label="Previous bayt">' + ICON_PREV + '</button>'
      + '<button type="button" class="c pp b-pp" aria-label="Pause">' + ICON_PAUSE + '</button>'
      + '<button type="button" class="c b-next" aria-label="Next bayt">' + ICON_NEXT + '</button>'
      + '<div class="meta"><div class="t"></div><div class="s"></div></div>'
      + '<button type="button" class="c x b-x" aria-label="Stop">✕</button></div>';
    document.body.appendChild(b);
    barProg = b.querySelector('.prog i'); barTitle = b.querySelector('.meta .t'); barSub = b.querySelector('.meta .s'); ppBtn = b.querySelector('.b-pp');
    b.querySelector('.b-pp')!.addEventListener('click', togglePP);
    b.querySelector('.b-prev')!.addEventListener('click', () => step(-1));
    b.querySelector('.b-next')!.addEventListener('click', () => step(1));
    b.querySelector('.b-x')!.addEventListener('click', () => stopSession());
    bar = b;
    return b;
  }
  /* Offered once per recording set, the first time a reader actually starts
     audio in it — the moment the download is obviously worth something,
     rather than buried in a menu they have no reason to open. Never taken
     without asking: a long matn runs past a hundred megabytes, and a reader
     on a phone plan should be the one who decides to spend that.

     Skipped when there is little left to fetch, because by then the answer
     does not matter, and skipped for good once answered either way. */
  const OFFER_KEY = 'asl-audio-offer-' + poem;
  let offerEl: HTMLElement | null = null;
  function answered(): void { lsSet(OFFER_KEY, '1'); }
  function dropOffer(): void {
    if (!offerEl) return;
    const el = offerEl; offerEl = null;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 260);
  }
  function mb(b: number): string { return (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB'; }
  function maybeOfferDownload(): void {
    const off = window.AslOffline;
    if (!CAN_CACHE || offerEl || !off) return;
    /* The first-run walkthrough is a modal scrim at z-index 400, and this
       card sits under it — offered there it would be visible but untappable.
       Nothing is remembered in that case, so it comes back next time. */
    if (document.querySelector('.tour-ov')) return;
    try { if (localStorage.getItem(OFFER_KEY)) return; } catch { return; }
    off.status([poem]).then((s) => {
      if (!s || !s.total || s.complete || s.bytesLeft < 2097152) return;
      if (!session || offerEl) return;
      showOffer(s);
    }).catch(() => {});
  }
  function showOffer(s: { total: number; cached: number; bytesLeft: number }): void {
    const el = document.createElement('div');
    el.className = 'audoff';
    el.innerHTML = '<div class="t">Keep these recitations on your device?</div>'
      + '<div class="s">' + (s.total - s.cached) + ' of ' + s.total + ' still to download · ' + mb(s.bytesLeft)
      + ' · then they play with no connection, and never stall mid-loop.</div>'
      + '<div class="r"><button type="button" class="no">Not now</button>'
      + '<button type="button" class="go">Download</button></div>';
    document.body.appendChild(el);
    offerEl = el;
    requestAnimationFrame(() => el.classList.add('show'));
    el.querySelector('.no')!.addEventListener('click', () => { answered(); dropOffer(); });
    el.querySelector('.go')!.addEventListener('click', () => {
      answered();
      const sub = el.querySelector('.s')!, row = el.querySelector('.r');
      row?.remove();
      el.querySelector('.t')!.textContent = 'Downloading recitations…';
      sub.textContent = 'You can keep listening while this runs.';
      window.AslOffline!.download((done, total) => {
        if (!offerEl) return;
        sub.textContent = done + ' of ' + total + ' saved';
      }, [poem]).then(() => {
        if (!offerEl) return;
        el.querySelector('.t')!.textContent = 'Saved for offline';
        el.querySelector('.s')!.textContent = 'This matn now plays without a connection.';
        setTimeout(dropOffer, 3200);
      }, () => { dropOffer(); });
    });
  }

  function startSession(c: Cfg): void {
    stopSession(true);
    const queue = available.filter((n) => n >= c.from && n <= c.to);
    if (!queue.length) return;
    session = { q: queue, i: 0, eachDone: 0, each: c.each, rangeDone: 0, range: c.range, speed: c.speed, gap: c.gap, paused: false, inGap: false };
    scrolledN = null; misfires = 0;
    const b = bar || buildBar();
    document.body.classList.add('aud-on');
    requestAnimationFrame(() => b.classList.add('show'));
    reqWake();
    if (ppBtn) ppBtn.innerHTML = ICON_PAUSE;
    playCurrent();
    maybeOfferDownload();
  }
  function playCurrent(): void {
    if (!session) return;
    clearTimeout(gapTimer); session.inGap = false;
    const n = session.q[session.i]!;
    clearHighlight();
    const v = verseByN[n];
    if (v) {
      v.classList.add('aud-cur'); markPlaying(n, true);
      /* Only when the bayt actually changes. Repeating one ten times used
         to fire ten smooth scrolls to a bayt already sitting in the middle
         of the screen, each one animating over the last. */
      if (scrolledN !== n) { scrolledN = n; v.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); }
    }
    updateBar(false);
    warmAhead();
    loadPlay(n, session.speed);
  }
  function scheduleNext(): void {
    if (!session) return;
    if (session.gap) {
      session.inGap = true; updateBar(true);
      const len = (audio.duration || 3) * 1000 / session.speed;
      gapTimer = window.setTimeout(() => {
        // If they paused while reciting, stay in the gap rather than
        // dropping out of it — resuming then knows to move on, instead of
        // replaying the bayt without counting it.
        if (!session || session.paused) return;
        session.inGap = false; afterBayt();
      }, Math.min(9000, Math.max(1200, len)));
    } else afterBayt();
  }
  function afterBayt(): void {
    if (!session) return;
    session.eachDone++;
    if (session.eachDone < session.each) { playCurrent(); return; }
    session.eachDone = 0; session.i++;
    if (session.i < session.q.length) { playCurrent(); return; }
    session.i = 0; session.rangeDone++;
    if (session.rangeDone < session.range) { playCurrent(); return; }
    stopSession();
  }
  function updateBar(reciting: boolean): void {
    if (!session || !barTitle || !barSub) return;
    const n = session.q[session.i];
    barTitle.textContent = 'Bayt ' + n + (reciting ? ' — your turn' : '');
    const parts: string[] = [];
    if (session.each !== 1) parts.push('×' + (session.eachDone + 1) + '/' + stepLabel(session.each));
    if (session.q.length > 1) parts.push('bayt ' + (session.i + 1) + '/' + session.q.length);
    if (session.range !== 1) parts.push('loop ' + (session.rangeDone + 1) + '/' + stepLabel(session.range));
    barSub.textContent = parts.join('  ·  ');
  }
  function pauseSession(): void {
    if (!session || session.paused) return;
    session.paused = true;
    if (ppBtn) ppBtn.innerHTML = ICON_PLAY;
    markPlaying(session.q[session.i], false);
    clearTimeout(gapTimer);
    try { audio.pause(); } catch { /* ignore */ }
  }
  function togglePP(): void {
    if (!session) return;
    const cur = session.q[session.i];
    if (session.paused) {
      session.paused = false; misfires = 0; if (ppBtn) ppBtn.innerHTML = ICON_PAUSE; markPlaying(cur, true);
      if (session.inGap) { session.inGap = false; afterBayt(); }
      else if (audio.ended) afterBayt();          // it finished while paused
      else { armWatchdog(); const p = audio.play(); if (p && p.catch) p.catch(() => playCurrent()); }
    } else pauseSession();
  }
  function jumpTo(idx: number): void {
    if (!session) return;
    clearTimeout(gapTimer); session.inGap = false; session.eachDone = 0; misfires = 0;
    session.i = Math.min(session.q.length - 1, Math.max(0, idx));
    session.paused = false; if (ppBtn) ppBtn.innerHTML = ICON_PAUSE;
    playCurrent();
  }
  function step(dir: number): void { if (session) jumpTo(session.i + dir); }
  function stopSession(silent?: boolean): void {
    clearTimeout(gapTimer); disarmWatchdog(); playToken++;
    session = null;
    dropOffer();      // the offer belongs to the session that raised it
    try { audio.pause(); } catch { /* ignore */ }
    clearPlaying(); clearHighlight(); relWake();
    if (barProg) barProg.style.width = '0';
    if (bar && !silent) bar.classList.remove('show');
    document.body.classList.remove('aud-on');
  }

  // release/re-acquire wake lock across visibility changes
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && session && !session.paused) reqWake(); });

  window.AslAudio = { available: true, openPanel, list: [], reciter: null, reciters };
  buildForReciter(pickDefault());   // sets available/coverage + renders the per-bayt buttons

  // The installed app can stay in memory for days, but the reciter list is
  // fetched only when the page opens — so fresh uploads never appeared
  // without a full restart. When the app returns to the foreground and the
  // list is stale, quietly re-fetch and fold in anything new.
  let manifestAt = Date.now();
  const recSig = (rs: AudioReciter[]) => rs.map((r) => r.id + ':' + r.abyat.join(',')).join('|');
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - manifestAt < 5 * 60e3) return;
    if (session || !audio.paused) return;   // never yank a live session
    fetchReciters(poem).then((recs) => {
      manifestAt = Date.now();
      if (!recs.length || recSig(recs) === recSig(reciters)) return;
      reciters.length = 0;
      reciters.push(...recs);
      const keep = reciters.find((r) => curRec && r.id === curRec.id);
      buildForReciter(keep || pickDefault());
    }).catch(() => {});
  });
  try { document.dispatchEvent(new CustomEvent('asl-audio-ready')); } catch { /* ignore */ }
}
