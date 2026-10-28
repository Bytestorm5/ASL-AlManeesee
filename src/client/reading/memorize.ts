/* Memorize (ḥifẓ) mode for the reading pages — Tier 1 + Tier 2 + Tier 3.
   Tier 1: a "Memorize" button focuses one chapter and blanks out words so
     students recite from memory and tap a blank to check. Four levels:
     1 last word · 2 second hemistich · 3 first word only · 4 full test.
   Tier 2: rate a revealed verse Got it / Review. Two correct passes (or one
     correct Level-4 recall) master it. Progress shows as rings on the verse
     numbers, per-chapter and whole-matn counts, a streak, a daily goal and a
     "hide mastered" drill filter, with export/import.
   Tier 3: spaced repetition. Mastered verses enter Leitner boxes (1→3→7→16→
     35→90 days). A "due today" queue lets students review only what they're
     about to forget, mixed across the whole matn, at a level they choose.
     Got it moves a verse up a box; a miss drops it to box 1. An in-app badge
     shows how many are due.
   Self-contained: no changes to the page's own code. All state in localStorage
   (asl-mz-prog-<id>, asl-mz-level, asl-mz-reveal, asl-mode-<id>; the home page
   and the app shell read the progress and goal keys, so they never change). */
import { SITE } from '../../config/site.ts';
import { currentPoem, lsGet, lsSet } from '../page.ts';

const LKEY = 'asl-mz-level';

type Level = 1 | 2 | 3 | 4;
/** One bayt's record: s 0 new · 1 learning · 2 mastered; p correct passes;
    box the Leitner box (1–6) and due the next review date (YYYY-MM-DD). */
interface VerseProgress { s: number; p?: number; box?: number; due?: string }
interface Progress {
  v: Record<string, VerseProgress>;
  streak: { n: number; last: string };
  goal: { date: string; done: number };
}
/** A rendered bayt, with its word units built lazily on first use. */
interface MzVerse {
  el: HTMLElement;
  section: HTMLElement;
  id: string;
  sadr: HTMLElement[] | null;
  ajuz: HTMLElement[] | null;
  rate: HTMLElement | null;
}

const BOX_DAYS: Record<number, number> = { 1: 1, 2: 3, 3: 7, 4: 16, 5: 35, 6: 90 };

const CAP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 2 9l10 5 10-5-10-5z"/><path d="M5 11.2V16c0 1.6 3.1 3 7 3s7-1.4 7-3v-4.8"/></svg>';
const HINTS: Record<Level, string> = {
  1: 'Last word of each bayt hidden',
  2: 'Second half of each bayt hidden',
  3: 'Only the first word is shown',
  4: 'Full test — bayt numbers only',
};

const CSS = [
  /* compact top-bar toggle, uniform with the neighbouring circles.
     Discovery lives on the home screen's Read/Memorize buttons (web)
     and the bottom bar (app, where this button is hidden entirely). */
  '.mzbtn{position:relative;cursor:pointer;display:inline-grid;place-items:center;width:34px;height:34px;padding:0;',
  'border-radius:50%;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447);',
  'flex:0 0 auto;transition:background .15s,border-color .15s,color .15s;-webkit-tap-highlight-color:transparent}',
  '.mzbtn:hover{border-color:var(--gilt,#c0973c);background:var(--paper,#f7f2e5)}',
  '.mzbtn svg{width:19px;height:19px}',
  '.mzbtn.on{background:var(--madder,#8a4447);border-color:var(--madder,#8a4447);color:#fbeee8}',
  '.mzbadge{position:absolute;top:-5px;right:-5px;min-width:17px;height:17px;padding:0 3px;border-radius:9px;',
  'background:var(--madder);color:#fff;font-family:"Montserrat",sans-serif;font-weight:700;font-size:.6rem;',
  'display:none;align-items:center;justify-content:center;line-height:1;box-shadow:0 0 0 2px var(--paper,#f9f4ea)}',
  '.mzbadge.show{display:flex}',
  '.mzbadge.due{background:#a23b3b}',
  /* verse-number status — the centre number disc becomes a solid "jewel"
     badge in the state colour, lifted off the star by a thin paper ring so
     it reads cleanly against the emblem. Cream number for contrast.
     Order matters: a due verse also carries .mzp-mastered, so due wins. */
  '.verse.mzp-learning .medallion .vn{color:#8a6a1c;box-shadow:0 0 0 1.5px #c9a13b}',
  '.verse.mzp-mastered .medallion .vn{box-shadow:0 0 0 1.5px var(--madder)}',
  '.verse.mzp-due .medallion .vn{background:color-mix(in srgb,var(--madder) 13%,#fff);color:var(--madder);box-shadow:0 0 0 1.5px var(--madder)}',
  /* practice bar — lives INSIDE .navbar-inner (see activate()/the bar's
     insertion point below) so it shares the same row as the top bar's
     icons, rather than adding a whole second row underneath. Its own
     order (see below) places it right after the chapter-jump button;
     everything else in that row (translate, bookmarks, notes, audio,
     search, help) is hidden in memorize mode to make room. */
  '.mzbar{display:none;align-items:flex-start;gap:8px 10px;flex-wrap:wrap;flex:1 1 auto;min-width:0;order:2}',
  '.mzbar .mz-left{display:flex;flex-direction:column;gap:3px;flex:1 1 auto;min-width:0}',
  'body.mz-on .mzbar{display:flex}',
  'body.mz-on .navbar-inner .nav-menus,body.mz-on .navbar-inner .mzbtn,body.mz-on .navbar-inner .bmmenu,',
  'body.mz-on .navbar-inner .ntmenu,body.mz-on .navbar-inner .aud-launch,body.mz-on .navbar-inner .searchbtn,',
  'body.mz-on .navbar-inner .helpbtn{display:none!important}',
  /* .chnav-btn is the row's only OTHER visible child once the rest are
     hidden above — .navbar-inner centers its children by default, which
     works fine for a single-line row, but .mzbar is two lines tall (level
     selector + hint), so centering would sink chnav-btn ~10px below the
     level buttons it's supposed to sit level with. Pin it to the top of
     the row instead, and match every control here to the same 30px
     height the rest of the app's top-bar icons already use. */
  'body.mz-on .navbar-inner .chnav-btn{align-self:flex-start;height:30px;box-sizing:border-box}',
  '.mzbar .grp{display:flex;align-items:center;gap:7px;flex:0 0 auto}',
  '.mzbar .step{cursor:pointer;display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;',
  'border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447);font-size:1rem;line-height:1;-webkit-tap-highlight-color:transparent}',
  '.mzbar .step:disabled{opacity:.35;cursor:default}',
  '.mzbar .mz-ch{font-family:"Montserrat",sans-serif;font-size:.74rem;font-weight:700;color:var(--ink,#3a2a2b);',
  'min-width:104px;max-width:150px;text-align:center;border:0;background:transparent;padding:0;-webkit-tap-highlight-color:transparent}',
  '.mzbar .mz-ch .mzc-t{display:inline-block;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom}',
  '.mzbar .mz-ch.mz-ch-jump{display:inline-flex;align-items:center;gap:5px;cursor:pointer;border:1px solid var(--paper-edge,#e8dcc7);',
  'border-radius:16px;padding:5px 11px;background:var(--surface,#fff);max-width:200px}',
  '.mzbar .mz-ch.mz-ch-jump:hover{border-color:var(--gilt,#c0973c)}',
  '.mzbar .mz-ch.mz-ch-jump::after{content:"▾";color:var(--madder,#8a4447);font-size:.72em;line-height:1}',
  /* .levels' own 1px border isn't absorbed into an unset height the way
     box-sizing:border-box absorbs it into .pill/.mz-done's explicit 30px
     — it just adds on top, leaving this pill 32px tall against their 30.
     Give it the same explicit 30px (with the border box-sizing already
     applies everywhere) and size the buttons to its resulting 28px
     content box, so the pill's outer edge lines up with everything else. */
  '.mzbar .levels{display:inline-flex;height:30px;border:1px solid var(--paper-edge,#e8dcc7);border-radius:20px;overflow:hidden;background:var(--surface,#fff)}',
  '.mzbar .levels button{cursor:pointer;border:0;background:transparent;color:var(--ink-soft,#6c585a);height:100%;',
  'font-family:"Montserrat",sans-serif;font-size:.78rem;font-weight:700;padding:0 11px;display:inline-flex;align-items:center;-webkit-tap-highlight-color:transparent}',
  '.mzbar .levels button.on{background:var(--madder,#8a4447);color:#fbeee8}',
  '.mzbar .lvlwrap{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto}',
  '.mzbar .lvl-lbl{font-family:"Montserrat",sans-serif;font-size:.6rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--sage,#9c7f80)}',
  '.mzbar .lvl-end{font-family:"Montserrat",sans-serif;font-size:.58rem;font-weight:600;color:var(--sage,#9c7f80);letter-spacing:.02em}',
  '.mzbar .pill{cursor:pointer;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447);',
  'font-family:"Montserrat",sans-serif;font-size:.72rem;font-weight:700;border-radius:20px;height:30px;box-sizing:border-box;padding:0 12px;-webkit-tap-highlight-color:transparent;display:inline-flex;align-items:center;gap:6px}',
  '.mzbar .pill.on{background:var(--madder,#8a4447);color:#fbeee8;border-color:var(--madder,#8a4447)}',
  '.mzbar .pill:disabled{opacity:.4;cursor:default}',
  '.mzbar .mz-rvstart{color:#a23b3b;border-color:#e3c3c3}',
  '.mzbar .mz-rvstart.hot{background:#a23b3b;color:#fff;border-color:#a23b3b}',
  '.mzbar .mz-rvinfo{font-family:"Montserrat",sans-serif;font-size:.74rem;font-weight:700;color:var(--ink,#3a2a2b)}',
  '.mzbar .mz-prog .n{font-variant-numeric:tabular-nums}',
  '.mzbar .mz-endrev{cursor:pointer;border:0;background:var(--madder,#8a4447);color:#fbeee8;',
  'font-family:"Montserrat",sans-serif;font-size:.74rem;font-weight:700;border-radius:20px;padding:7px 15px;-webkit-tap-highlight-color:transparent}',
  '.mzbar .mz-done{cursor:pointer;border:0;background:var(--madder,#8a4447);color:#fbeee8;width:30px;height:30px;',
  'border-radius:50%;padding:0;display:grid;place-items:center;box-shadow:0 2px 7px rgba(58,28,31,.2);-webkit-tap-highlight-color:transparent}',
  '.mzbar .mz-done svg{width:16px;height:16px}',
  '.mzbar .mz-hint{font-family:"Montserrat",sans-serif;font-size:.62rem;font-weight:600;color:var(--sage,#9c7f80);text-align:left;padding-left:2px}',
  '@media (max-width:390px){.mzbar .lvl-end{display:none}.mzbar .levels button{width:27px;font-size:.72rem}.mzbar{gap:6px 7px}.mzbar .pill{padding:0 10px;font-size:.68rem}}',
  '.mzmenu{position:fixed;z-index:220;background:var(--surface,#fff);border:1px solid var(--paper-edge,#e8dcc7);border-radius:12px;',
  'box-shadow:0 14px 34px rgba(14,38,56,.18);padding:5px;min-width:214px;font-family:"Montserrat",sans-serif}',
  '.mzmenu button{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;box-sizing:border-box;',
  'text-align:left;border:0;background:transparent;cursor:pointer;color:var(--ink,#3a2a2b);font-family:inherit;',
  'font-size:.82rem;font-weight:700;padding:10px 12px;border-radius:8px;-webkit-tap-highlight-color:transparent}',
  '.mzmenu button:hover{background:var(--paper,#f7f2e5)}',
  '.mzmenu button:disabled{opacity:.4;cursor:default}',
  '.mzmenu button .st{font-size:.74rem;font-weight:700;color:var(--madder,#8a4447)}',
  '.mzmenu .mzm-div{height:1px;background:var(--paper-edge,#e8dcc7);margin:5px 4px}',
  /* focus one chapter (or one verse in review); strip answer-giving chrome */
  'body.mz-on section.chapter{display:none}',
  'body.mz-on section.chapter.mz-active{display:block}',
  'body.mz-on header.hero,body.mz-on .toc-wrap,body.mz-on .pills,body.mz-on .backbar,body.mz-on footer{display:none!important}',
  'body.mz-on .mz-active .translation,body.mz-on .mz-active .translation-ur,body.mz-on .mz-active .explanation,',
  'body.mz-on .mz-active .verse-actions,body.mz-on .mz-active .wl-tag,body.mz-on .mz-active .verse-note,',
  'body.mz-on .mz-active .ch-desc{display:none!important}',
  /* notes are a Read-mode feature only — the per-verse note text (above,
     via .verse-note; the pencil button is already gone with .verse-actions)
     and the top-bar notes menu (button hidden with the other reading-only
     icons; its dropdown lives outside .navbar-inner as position:fixed, so
     it needs its own rule in case it was left open when memorize mode
     started) both stay hidden for the whole session, not just .mz-active. */
  'body.mz-on .ntpop{display:none!important}',
  'body.mz-on .medallion,body.mz-on .vn{cursor:pointer}',
  'body.mz-on.mz-hidemastered .mz-active .verse.mzp-mastered{display:none}',
  'body.mz-review .mz-active .ch-head{display:none!important}',
  'body.mz-review .mz-active .verse{display:none!important}',
  'body.mz-review .mz-active .verse.mz-rvcur{display:block!important}',
  /* blanks */
  '.mz-hide{color:transparent!important;background:var(--paper-2,#efe3d3);border-radius:5px;',
  'box-shadow:inset 0 -2px 0 rgba(201,180,143,.95);padding:0 3px;cursor:pointer;',
  'transition:color .25s,background .25s,box-shadow .25s}',
  /* rumūz/red-word spans set their own explicit (non-!important) color,
     which otherwise wins over an ancestor's inherited transparency —
     force every descendant transparent too so a hidden word never
     shows its markup colour through the blank tile. Scoped to the
     still-hidden state only (:not(.mz-reveal), body:not(.mz-revealall))
     so a revealed word's own text — and its rumūz/red-word colouring —
     actually becomes visible again once tapped or "Reveal all" is on. */
  'body:not(.mz-revealall) .mz-hide:not(.mz-reveal) *{color:transparent!important}',
  '.mz-hide::before,.mz-hide::after{content:none!important;display:none!important}',
  '.mz-hide.mz-reveal,body.mz-revealall .mz-hide{color:inherit!important;background:transparent!important;box-shadow:none!important}',
  /* Every hemistich stays on ONE line in memorize mode too. The hidden-word
     tiles are wider than the text they mask, so fitHemiMz() shrinks the font
     per hemistich until the tiled line fits its column — no wrapping, no
     spill past the screen edge or over the verse-number medallion. Gloss
     tooltips are suppressed here so they can't inflate the width measurement. */
  'body.mz-on .hemi{white-space:nowrap!important}',
  'body.mz-on .hemi .seg[data-g]::after,body.mz-on .hemi .seg[data-g]::before{content:none!important;display:none!important}',
  /* per-verse rating row */
  '.mzrate{display:none;align-items:center;justify-content:center;gap:9px;margin-top:9px}',
  'body.mz-on .verse.mz-revealed .mzrate{display:flex}',
  '.mzrate button{cursor:pointer;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);border-radius:20px;',
  'padding:6px 15px;font-family:"Montserrat",sans-serif;font-size:.74rem;font-weight:700;-webkit-tap-highlight-color:transparent}',
  '.mzrate .got{color:#a9791f;border-color:#e6d5a8}',
  '.mzrate .got.on{background:#b58a2e;color:#fff;border-color:#b58a2e}',
  '.mzrate .rev{color:var(--ink-soft,#6c585a);border-color:var(--paper-edge,#e8dcc7)}',
  '.mzrate .rev.on{background:var(--sage,#9c7f80);color:#fff;border-color:var(--sage,#9c7f80)}',
  /* panel + modal */
  '.mzov{position:fixed;inset:0;z-index:420;background:rgba(58,42,43,.5);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);',
  'display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .2s}',
  '.mzov.show{opacity:1}',
  '.mzcard{width:100%;max-width:380px;max-height:86vh;overflow:auto;background:var(--paper,#f9f4ea);border-radius:16px;',
  'box-shadow:0 24px 60px rgba(0,0,0,.4);font-family:"Montserrat",sans-serif;padding:20px;text-align:left}',
  '.mzcard h3{font-family:"Cormorant Garamond",Georgia,serif;color:var(--madder,#8a4447);font-size:1.35rem;margin:0 0 2px}',
  '.mzcard .sub{color:var(--sage,#9c7f80);font-size:.72rem;font-weight:600;margin:0 0 14px}',
  '.mzbig{font-family:"Cormorant Garamond",serif;font-size:2.1rem;font-weight:700;color:var(--ink,#3a2a2b);line-height:1}',
  '.mzbig small{font-size:.9rem;color:var(--ink-soft,#6c585a);font-family:"Montserrat",sans-serif;font-weight:600}',
  '.mzbarline{height:9px;border-radius:6px;background:#e8dcc7;overflow:hidden;margin:9px 0 4px}',
  '.mzbarline i{display:block;height:100%;background:linear-gradient(90deg,#e6c66f,#b58a2e)}',
  '.mzcta{display:block;width:100%;box-sizing:border-box;margin:12px 0 2px;cursor:pointer;border:0;border-radius:11px;',
  'padding:12px;font-family:"Montserrat",sans-serif;font-size:.82rem;font-weight:700;background:#a23b3b;color:#fff}',
  '.mzcta.calm{background:#f6edd6;color:#a9791f;cursor:default}',
  '.mzstat{display:flex;gap:10px;margin:12px 0}',
  '.mzstat div{flex:1;background:var(--surface,#fff);border:1px solid var(--paper-edge,#e8dcc7);border-radius:11px;padding:9px 8px;text-align:center}',
  '.mzstat b{display:block;font-family:"Cormorant Garamond",serif;font-size:1.3rem;color:var(--madder,#8a4447)}',
  '.mzstat span{font-size:.62rem;font-weight:700;color:var(--sage,#9c7f80);letter-spacing:.02em;text-transform:uppercase}',
  '.mzchlist{margin:6px 0 4px;border-top:1px solid var(--paper-edge,#e8dcc7)}',
  '.mzchrow{display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--paper-edge,#e8dcc7)}',
  '.mzchrow .nm{flex:1;min-width:0;font-size:.74rem;font-weight:600;color:var(--ink,#3a2a2b);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.mzchrow .mzbarline{flex:0 0 74px;margin:0}',
  '.mzchrow .pc{flex:0 0 auto;font-size:.68rem;font-weight:700;color:var(--sage,#9c7f80);width:34px;text-align:right}',
  '.mzactions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}',
  '.mzactions button{flex:1 1 auto;cursor:pointer;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);',
  'border-radius:10px;padding:9px;font-family:"Montserrat",sans-serif;font-size:.72rem;font-weight:700;color:var(--ink,#3a2a2b);-webkit-tap-highlight-color:transparent}',
  '.mzactions button.danger{color:#a23b3b;border-color:#e3c3c3}',
  '.mzactions button.prime{background:var(--madder,#8a4447);color:#fbeee8;border-color:var(--madder,#8a4447)}',
  '.mzio{width:100%;box-sizing:border-box;margin-top:12px;height:84px;border:1px solid var(--paper-edge,#e8dcc7);border-radius:10px;',
  'padding:9px;font-family:monospace;font-size:.72rem;color:var(--ink,#3a2a2b);background:var(--surface,#fff);resize:none}',
  '.mzmsg{font-size:.72rem;font-weight:600;margin-top:8px;min-height:16px}',
  '.mzbackup{margin-top:10px;padding-top:12px;border-top:1px solid var(--paper-edge,#e8dcc7)}',
  '.bk-title{font-family:"Cormorant Garamond",serif;font-weight:700;color:var(--madder,#8a4447);font-size:1.08rem;margin-bottom:3px}',
  '.bk-help{font-size:.74rem;color:var(--ink-soft,#6c585a);line-height:1.5;margin:0 0 10px}',
  '.bk-note{font-size:.76rem;font-weight:600;color:#a9791f;line-height:1.5;margin:2px 0 8px}',
  '.io-details{margin-top:10px}',
  '.io-details summary{cursor:pointer;font-size:.72rem;font-weight:700;color:var(--sage,#9c7f80)}',
  '.mzclose{margin-top:14px;width:100%;cursor:pointer;border:0;background:var(--madder,#8a4447);color:#fbeee8;',
  'border-radius:10px;padding:10px;font-family:"Montserrat",sans-serif;font-size:.78rem;font-weight:700}',
  '.mzend{text-align:center}',
  '.mzend .big{font-family:"Cormorant Garamond",serif;font-size:2.4rem;color:#a9791f;margin:4px 0 2px}',
  '@media (prefers-reduced-motion:reduce){.mz-hide{transition:none}}',
].join('');

/* ---------- dates ---------- */
function ymd(d: Date): string {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

/* ---------- word tokenisation ----------
   Splits a hemistich's rendered HTML into one unit per real word, so
   "hide the last word" always lands on the true last word — not the
   last <span class="seg"> (glosses can bundle several words into one
   seg, e.g. "مِنۡ أَهۡلِ الۡأَدَا", and gloss-less trailing words aren't
   wrapped in a seg at all). Splits happen only on whitespace that is
   outside any tag; any tag straddling a split is closed/reopened so
   each word keeps its own markup (rumūz colour, small-noon marks, etc). */
function tokenizeWords(html: string): string[] {
  const words: string[] = [];
  const tagStack: string[] = [];
  let current = '', hasContent = false;
  const openTags = () => tagStack.join('');
  const closeTags = () => {
    let out = '';
    for (let k = tagStack.length - 1; k >= 0; k--) {
      const m = /^<(\w+)/.exec(tagStack[k]!);
      out += '</' + (m ? m[1] : 'span') + '>';
    }
    return out;
  };
  let i = 0;
  const n = html.length;
  while (i < n) {
    const ch = html.charAt(i);
    if (ch === '<') {
      const close = html.indexOf('>', i);
      if (close === -1) { current += html.slice(i); break; }
      const tag = html.slice(i, close + 1);
      if (/^<\//.test(tag)) tagStack.pop();
      else if (!/\/>\s*$/.test(tag)) tagStack.push(tag);
      current += tag;
      i = close + 1;
    } else if (/\s/.test(ch)) {
      if (hasContent) {
        words.push(current + closeTags());
        current = openTags();
        hasContent = false;
      }
      i++;
    } else {
      current += ch;
      hasContent = true;
      i++;
    }
  }
  if (hasContent) words.push(current + closeTags());
  return words;
}

export function init(): void {
  const navbar = document.querySelector<HTMLElement>('.navbar');
  const navInner = document.querySelector<HTMLElement>('.navbar-inner');
  const main = document.getElementById('main');
  if (!navbar || !navInner || !main) return; // reading pages only

  const sections = [...main.querySelectorAll<HTMLElement>('section.chapter')];
  if (!sections.length) return;

  const matn = currentPoem();
  const poem = matn?.id || 'poem';
  const PKEY = 'asl-mz-prog-' + poem;
  const POEM_NAME = matn?.shortEn || 'this matn';
  // Daily goal (verses/day) — set per matn from the app's More sheet
  // (app-shell.ts) so learners working on more than one matn can pace each
  // one differently. Read fresh each time rather than cached once, in case
  // it changed in another tab since this page loaded.
  function goalTarget(): number {
    const v = parseInt(lsGet('asl-mz-goal-target-' + poem) || '', 10);
    if (v >= 1 && v <= 50) return v;
    // fall back to the old shared setting, if this matn hasn't been given
    // its own goal yet, so upgrading doesn't reset anyone's pace to 3
    const legacy = parseInt(lsGet('asl-mz-goal-target') || '', 10);
    if (legacy >= 1 && legacy <= 50) return legacy;
    return 3;
  }

  // ---------- dates ----------
  const today = ymd(new Date());
  const yesterday = ymd(new Date(Date.now() - 864e5));
  const addDays = (n: number) => ymd(new Date(Date.now() + n * 864e5));
  function daysUntil(s: string | null | undefined): number | null {
    if (!s) return null;
    return Math.round((new Date(s + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 864e5);
  }
  function humanDue(s: string | null): string {
    const d = daysUntil(s);
    if (d === null) return 'later';
    if (d <= 0) return 'today';
    if (d === 1) return 'tomorrow';
    return 'in ' + d + ' days';
  }

  // ---------- progress state ----------
  const prog: Progress = { v: {}, streak: { n: 0, last: '' }, goal: { date: '', done: 0 } };
  try {
    const raw = JSON.parse(localStorage.getItem(PKEY) || 'null') as Partial<Progress> | null;
    if (raw && typeof raw === 'object') {
      prog.v = raw.v || {};
      prog.streak = raw.streak || prog.streak;
      prog.goal = raw.goal || prog.goal;
    }
  } catch { /* fresh start */ }
  function save(): void {
    lsSet(PKEY, JSON.stringify(prog));
    try { document.dispatchEvent(new Event('asl-mz-save')); } catch { /* ignore */ }
  }
  const stateOf = (id: string) => prog.v[id]?.s ?? 0;

  function bumpStreak(): void {
    if (prog.streak.last === today) return;
    prog.streak.n = prog.streak.last === yesterday ? prog.streak.n + 1 : 1;
    prog.streak.last = today;
  }
  function bumpGoal(): void {
    if (prog.goal.date !== today) { prog.goal.date = today; prog.goal.done = 0; }
    prog.goal.done++;
  }

  const st = document.createElement('style');
  st.appendChild(document.createTextNode(CSS));
  document.head.appendChild(st);

  // ---------- state ----------
  let active = false, level: Level = 2, chIdx = 0, revealAll = false, hideMastered = false;
  let reviewActive = false, reviewQueue: MzVerse[] = [], reviewIdx = 0, reviewGraded = 0;
  const sv = parseInt(lsGet(LKEY) || '', 10);
  if (sv >= 1 && sv <= 4) level = sv as Level;
  let revealMode: 'word' | 'line' = 'word'; // 'word' = tap each blank; 'line' = a tap reveals the whole verse
  if (lsGet('asl-mz-reveal') === 'line') revealMode = 'line';
  let badge: HTMLElement | null = null;

  // ---------- index verses; migrate + apply rings ----------
  const verses: MzVerse[] = [];
  for (const sec of sections) {
    for (const v of sec.querySelectorAll<HTMLElement>('.verse')) {
      const vn = v.querySelector('.vn');
      verses.push({ el: v, section: sec, id: vn ? (vn.textContent || '').trim() : 'x' + verses.length, sadr: null, ajuz: null, rate: null });
    }
  }

  function isDue(id: string): boolean {
    const r = prog.v[id];
    return !!(r && r.s === 2 && r.due && r.due <= today);
  }
  function applyRing(v: MzVerse): void {
    const s = stateOf(v.id);
    v.el.classList.toggle('mzp-learning', s === 1);
    v.el.classList.toggle('mzp-mastered', s === 2);
    v.el.classList.toggle('mzp-due', s === 2 && isDue(v.id));
  }
  // migrate: mastered verses from earlier tiers get seeded into the schedule
  {
    let changed = false;
    for (const v of verses) {
      const r = prog.v[v.id];
      if (r && r.s === 2 && (!r.box || !r.due)) { r.box = r.box || 1; r.due = r.due || today; changed = true; }
    }
    if (changed) save();
  }
  verses.forEach(applyRing);

  const dueList = () => verses.filter((v) => isDue(v.id));

  // ---------- word units (lazy) ----------
  /* The renderer builds a chapter's word-gloss spans only as it nears the
     viewport, and leaves alone any hemistich memorize has tokenised. So ask
     for the spans first: tokenising the plain text would keep that chapter
     without its glosses (and red ink) for the rest of the visit, even back
     in reading mode. A no-op for a chapter already built or without glosses. */
  const glossed = new Set<HTMLElement>();
  function needGlosses(v: MzVerse): void {
    if (glossed.has(v.section)) return;
    glossed.add(v.section);
    v.el.dispatchEvent(new CustomEvent('asl-need-glosses', { bubbles: true }));
  }
  function unitsOf(hemi: HTMLElement | null): HTMLElement[] {
    if (!hemi) return [];
    if (hemi._mzTok) return [...hemi.querySelectorAll<HTMLElement>('.mz-w')];
    hemi._mzTok = true;
    const words = tokenizeWords(hemi.innerHTML);
    if (!words.length) return [];
    hemi.innerHTML = words.map((w) => '<span class="mz-w">' + w + '</span>').join(' ');
    return [...hemi.querySelectorAll<HTMLElement>('.mz-w')];
  }
  function ensureUnits(v: MzVerse): { sadr: HTMLElement[]; ajuz: HTMLElement[] } {
    if (v.sadr === null || v.ajuz === null) needGlosses(v);
    if (v.sadr === null) v.sadr = unitsOf(v.el.querySelector<HTMLElement>('.hemi.sadr'));
    if (v.ajuz === null) v.ajuz = unitsOf(v.el.querySelector<HTMLElement>('.hemi.ajuz'));
    return { sadr: v.sadr, ajuz: v.ajuz };
  }
  function ensureRate(v: MzVerse): HTMLElement {
    if (v.rate) return v.rate;
    const row = document.createElement('div');
    row.className = 'mzrate';
    row.innerHTML = '<button type="button" class="got">✓ Got it</button><button type="button" class="rev">↺ Review</button>';
    row.querySelector('.got')!.addEventListener('click', () => onRate(v, 'got'));
    row.querySelector('.rev')!.addEventListener('click', () => onRate(v, 'rev'));
    v.el.appendChild(row);
    v.rate = row;
    return row;
  }
  function syncRate(v: MzVerse): void {
    if (!v.rate) return;
    const s = stateOf(v.id);
    v.rate.querySelector('.got')!.classList.toggle('on', s === 2);
    v.rate.querySelector('.rev')!.classList.toggle('on', s === 1);
  }

  const hideUnits = (list: HTMLElement[]) => list.forEach((u) => u.classList.add('mz-hide'));
  function clearReveals(v: MzVerse): void {
    const { sadr, ajuz } = ensureUnits(v);
    sadr.concat(ajuz).forEach((u) => u.classList.remove('mz-hide', 'mz-reveal'));
    v.el.classList.remove('mz-revealed');
  }
  function blankVerse(v: MzVerse): void {
    clearReveals(v);
    const { sadr, ajuz } = ensureUnits(v);
    if (level === 1) {
      const last = ajuz.length ? ajuz : sadr;
      last[last.length - 1]?.classList.add('mz-hide');
    } else if (level === 2) {
      hideUnits(ajuz.length ? ajuz : sadr.slice(Math.ceil(sadr.length / 2)));
    } else if (level === 3) {
      hideUnits(sadr.slice(1)); hideUnits(ajuz);
    } else {
      hideUnits(sadr); hideUnits(ajuz);
    }
    fitVerse(v);
  }
  // Keep each hemistich on ONE line: the hidden-word tiles are wider than the
  // text they mask, so shrink the font per hemistich until the tiled line fits
  // its column (no wrapping, no spill past the edge or over the medallion). The
  // original inline font-size is remembered so reading mode is restored on exit.
  const fs0 = new Map<HTMLElement, string>();
  function fitHemiMz(h: HTMLElement | null): void {
    if (!h) return;
    if (!fs0.has(h)) fs0.set(h, h.style.fontSize);
    h.style.fontSize = '';
    const w = h.clientWidth; if (w <= 0) return;
    let fs = parseFloat(getComputedStyle(h).fontSize), t = 0;
    while (h.scrollWidth > w + 0.5 && fs > 10 && t < 16) {
      fs = Math.max(10, fs * w / h.scrollWidth * 0.985);
      h.style.fontSize = fs + 'px'; t++;
    }
  }
  function fitVerse(v: MzVerse): void {
    fitHemiMz(v.el.querySelector<HTMLElement>('.hemi.sadr'));
    fitHemiMz(v.el.querySelector<HTMLElement>('.hemi.ajuz'));
  }
  function unfitAllMz(): void {
    for (const [h, size] of fs0) h.style.fontSize = size;
    fs0.clear();
  }
  function refitActive(): void {
    if (!active) return;
    if (reviewActive) { const rc = reviewQueue[reviewIdx]; if (rc) fitVerse(rc); return; }
    const sec = sections[chIdx];
    verses.forEach((v) => { if (v.section === sec) fitVerse(v); });
  }
  let refitT: number | undefined;
  window.addEventListener('resize', () => {
    if (!active) return;
    clearTimeout(refitT); refitT = window.setTimeout(refitActive, 150);
  });
  function updateRevealed(v: MzVerse): void {
    const { sadr, ajuz } = ensureUnits(v);
    const hidden = sadr.concat(ajuz).filter((u) => u.classList.contains('mz-hide'));
    const all = hidden.length > 0 && hidden.every((u) => u.classList.contains('mz-reveal'));
    v.el.classList.toggle('mz-revealed', all);
  }

  // ---------- Tier 2 rating (chapter mode) ----------
  function onRate(v: MzVerse, kind: 'got' | 'rev'): void {
    if (reviewActive) { reviewGrade(kind); return; }
    const rec: VerseProgress = prog.v[v.id] || { s: 0, p: 0 };
    const wasMastered = rec.s === 2;
    if (kind === 'got') {
      rec.p = (rec.p || 0) + 1;
      rec.s = level === 4 || rec.p >= 2 ? 2 : 1;
    } else { rec.s = 1; rec.p = Math.min(rec.p || 0, 1); }
    if (rec.s === 2 && !rec.box) { rec.box = 1; rec.due = addDays(1); } // enter the schedule
    prog.v[v.id] = rec;
    if (rec.s === 2 && !wasMastered) bumpGoal();
    bumpStreak(); save();
    applyRing(v); syncRate(v); refreshCounts(); updateDue();
  }

  function applyLevel(): void {
    revealAll = false;
    document.body.classList.remove('mz-revealall');
    const sec = sections[chIdx];
    verses.forEach((v) => {
      if (v.section !== sec) return;
      blankVerse(v); ensureRate(v); syncRate(v);
    });
  }
  function counts(secFilter?: HTMLElement): { t: number; m: number; l: number } {
    let t = 0, m = 0, l = 0;
    for (const v of verses) {
      if (secFilter && v.section !== secFilter) continue;
      t++;
      const s = stateOf(v.id);
      if (s === 2) m++; else if (s === 1) l++;
    }
    return { t, m, l };
  }
  function refreshCounts(): void { /* count now shown in the Options menu + progress panel */ }
  function updateDue(): void {
    const due = dueList().length;
    const mastered = verses.filter((v) => stateOf(v.id) === 2).length;
    verses.forEach(applyRing);
    if (!badge) return;
    // Reviews due take priority (red, actionable); otherwise show how many
    // abyāt are memorised (gold, progress). Hidden only when there's nothing.
    const showDue = due > 0 && !reviewActive;
    const n = showDue ? due : mastered;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.classList.toggle('due', showDue);
    badge.classList.toggle('show', n > 0 && !reviewActive);
    badge.setAttribute('aria-label', showDue ? due + ' due for review' : mastered + ' memorised');
  }
  // toggles (driven from the Options menu)
  function setRevealAll(on: boolean): void {
    revealAll = on;
    document.body.classList.toggle('mz-revealall', on);
    if (reviewActive) { const rc = reviewQueue[reviewIdx]; if (rc) updateRevealed(rc); }
    else { const sec = sections[chIdx]; verses.forEach((v) => { if (v.section === sec) updateRevealed(v); }); }
  }
  function setHideMastered(on: boolean): void { hideMastered = on; document.body.classList.toggle('mz-hidemastered', on); }
  function setRevealMode(mode: 'word' | 'line'): void { revealMode = mode; lsSet('asl-mz-reveal', mode); }
  function chapterLabel(idx: number): string {
    const sec = sections[idx];
    if (!sec) return 'Chapter';
    const n = (sec.id || '').replace('ch', '');
    const t = (sec.querySelector('.ch-en')?.textContent || '').trim();
    return (n ? 'Ch ' + n : 'Chapter') + (t ? ' · ' + t : '');
  }
  function scrollTop(el: Element): void {
    window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - (navbar!.offsetHeight + 8)));
  }
  function setChapter(idx: number, scroll: boolean): void {
    chIdx = Math.max(0, Math.min(sections.length - 1, idx));
    sections.forEach((s, i) => s.classList.toggle('mz-active', i === chIdx));
    applyLevel();
    const sec = sections[chIdx]!;
    if (scroll) scrollTop(sec);
    // keep the top-bar chapter dropdown in sync (it drives chapters in memorize)
    try { document.dispatchEvent(new CustomEvent('asl-mz-chapter', { detail: { id: sec.id } })); } catch { /* ignore */ }
  }
  function setLevel(l: Level): void {
    level = l;
    lsSet(LKEY, String(l));
    levelBtns.forEach((b) => b.classList.toggle('on', Number(b.dataset.l) === l));
    hintEl.textContent = HINTS[l];
    if (reviewActive) { const rec = reviewQueue[reviewIdx]; if (rec) { blankVerse(rec); ensureRate(rec); syncRate(rec); } }
    else applyLevel();
  }
  function currentChapterIdx(): number {
    const top = navbar!.offsetHeight + 24;
    for (let i = 0; i < sections.length; i++) { if (sections[i]!.getBoundingClientRect().bottom > top) return i; }
    return 0;
  }
  function setBarMode(mode: 'chapter' | 'review'): void {
    const rv = mode === 'review';
    doneBtn.style.display = rv ? 'none' : '';
    rvInfo.style.display = rv ? 'inline-block' : 'none';
    endRvBtn.style.display = rv ? '' : 'none';
  }

  const rememberMode = (m: 'memorize' | 'read') => lsSet('asl-mode-' + poem, m);
  function activate(): void {
    active = true;
    document.body.classList.add('mz-on');
    btn.classList.add('on'); btn.setAttribute('aria-pressed', 'true');
    setBarMode('chapter');
    setLevel(level);
    setChapter(currentChapterIdx(), true);
    refreshCounts(); updateDue();
    rememberMode('memorize');
  }
  function deactivate(): void {
    active = false; reviewActive = false;
    document.body.classList.remove('mz-on', 'mz-revealall', 'mz-review', 'mz-hidemastered');
    hideMastered = false;
    btn.classList.remove('on'); btn.setAttribute('aria-pressed', 'false');
    verses.forEach((v) => { v.el.classList.remove('mz-rvcur'); if (v.sadr !== null) clearReveals(v); });
    unfitAllMz();
    // hemi-fit.ts re-fits the reading view on this
    try { document.dispatchEvent(new CustomEvent('asl-mode-read')); } catch { /* ignore */ }
    updateDue();
    rememberMode('read');
  }

  // ---------- Tier 3 review session ----------
  function startReview(): void {
    const q = dueList();
    if (!q.length) return;
    q.sort((a, b) => {
      const ra = prog.v[a.id]!, rb = prog.v[b.id]!;
      if (ra.due !== rb.due) return (ra.due || '') < (rb.due || '') ? -1 : 1;
      return (ra.box || 1) - (rb.box || 1);
    });
    reviewQueue = q; reviewIdx = 0; reviewGraded = 0; reviewActive = true;
    active = true;
    document.body.classList.add('mz-on', 'mz-review');
    document.body.classList.remove('mz-revealall', 'mz-hidemastered');
    btn.classList.add('on');
    setBarMode('review');
    showReviewVerse(0);
    updateDue();
  }
  function showReviewVerse(i: number): void {
    reviewIdx = i;
    const rec = reviewQueue[i];
    if (!rec) return;
    sections.forEach((s) => s.classList.toggle('mz-active', s === rec.section));
    verses.forEach((v) => v.el.classList.toggle('mz-rvcur', v === rec));
    blankVerse(rec); ensureRate(rec); syncRate(rec);
    rvInfo.textContent = 'Review ' + (i + 1) + ' / ' + reviewQueue.length;
    scrollTop(rec.el);
  }
  function reviewGrade(kind: 'got' | 'rev'): void {
    const rec = reviewQueue[reviewIdx];
    if (!rec) return;
    const r: VerseProgress = prog.v[rec.id] || { s: 2, p: 2, box: 1 };
    if (kind === 'got') { r.box = Math.min((r.box || 1) + 1, 6); r.due = addDays(BOX_DAYS[r.box]!); }
    else { r.box = 1; r.due = addDays(1); }
    r.s = 2; if (!r.p) r.p = 2;
    prog.v[rec.id] = r;
    reviewGraded++;
    bumpStreak(); save();
    applyRing(rec); refreshCounts();
    if (kind === 'rev') reviewQueue.push(rec); // see again before finishing
    const next = reviewIdx + 1;
    if (next >= reviewQueue.length) endReview();
    else showReviewVerse(next);
  }
  function endReview(): void {
    reviewActive = false;
    document.body.classList.remove('mz-review');
    verses.forEach((v) => v.el.classList.remove('mz-rvcur'));
    let nextDue: string | null = null;
    for (const v of verses) {
      const r = prog.v[v.id];
      if (r && r.s === 2 && r.due && (!nextDue || r.due < nextDue)) nextDue = r.due;
    }
    setBarMode('chapter');
    setChapter(currentChapterIdx(), false);
    updateDue();
    openEndModal(reviewGraded, nextDue);
  }

  // reveal (or re-hide) an entire verse at once
  function toggleVerseReveal(rec: MzVerse): void {
    const { sadr, ajuz } = ensureUnits(rec);
    const hidden = sadr.concat(ajuz).filter((u) => u.classList.contains('mz-hide'));
    const anyHidden = hidden.some((u) => !u.classList.contains('mz-reveal'));
    hidden.forEach((u) => u.classList.toggle('mz-reveal', anyHidden));
    updateRevealed(rec);
  }
  const verseOf = (el: Element) => {
    const v = el.closest('.verse');
    return verses.find((x) => x.el === v);
  };

  // tap a blank / verse number
  main.addEventListener('click', (e) => {
    if (!active) return;
    const t = e.target as Element | null;
    const med = t?.closest?.('.medallion, .vn');
    if (med) {
      const rec = verseOf(med);
      if (rec) toggleVerseReveal(rec);
      return;
    }
    const blank = t?.closest?.('.mz-hide');
    if (blank) {
      e.stopPropagation();
      const rec2 = verseOf(blank);
      if (revealMode === 'line') { if (rec2) toggleVerseReveal(rec2); } // whole line at once
      else { blank.classList.toggle('mz-reveal'); if (rec2) updateRevealed(rec2); } // word by word
    }
  }, true);

  // ---------- button + practice bar ----------
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'mzbtn';
  btn.title = 'Memorize this matn'; btn.setAttribute('aria-label', 'Memorize this matn');
  btn.setAttribute('aria-pressed', 'false');
  btn.innerHTML = CAP + '<span class="mzbadge" aria-hidden="true"></span>';
  btn.addEventListener('click', () => { if (active) deactivate(); else activate(); });
  // The top-bar chapter dropdown (chapter-nav.ts) drives chapters in memorize
  // mode; notes and ?goto= (last-visit.ts) use it to open the right chapter.
  document.addEventListener('asl-mz-goto', (e) => {
    const d = (e as CustomEvent<{ id?: string } | null>).detail;
    if (!active || reviewActive || !d) return;
    const i = sections.findIndex((s) => s.id === d.id);
    if (i >= 0) setChapter(i, true);
  });
  const navMenus = navInner.querySelector('.nav-menus');
  const viewMenu = document.getElementById('viewMenu');
  if (navMenus) navInner.insertBefore(btn, navMenus);
  else if (viewMenu) navInner.insertBefore(btn, viewMenu); else navInner.appendChild(btn);
  badge = btn.querySelector<HTMLElement>('.mzbadge');

  const bar = document.createElement('div');
  bar.className = 'mzbar';
  bar.innerHTML =
    '<div class="mz-left">'
    + '<div class="lvlwrap"><span class="lvl-lbl">Hide</span><span class="lvl-end">less</span>'
    + '<div class="levels" role="group" aria-label="How much to hide">'
    + '<button type="button" data-l="1" title="Hide the last word">1</button>'
    + '<button type="button" data-l="2" title="Hide the second half">2</button>'
    + '<button type="button" data-l="3" title="Show only the first word">3</button>'
    + '<button type="button" data-l="4" title="Hide everything">4</button></div>'
    + '<span class="lvl-end">more</span></div>'
    + '<span class="mz-hint"></span>'
    + '</div>'
    + '<span class="mz-rvinfo"></span>'
    + '<button type="button" class="pill mz-more">Options ▾</button>'
    + '<button type="button" class="mz-done" title="Exit Memorize mode — back to reading" aria-label="Exit Memorize mode — back to reading">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button>'
    + '<button type="button" class="mz-endrev">End review</button>';
  navInner.appendChild(bar);

  const levelBtns = [...bar.querySelectorAll<HTMLElement>('.levels button')];
  const moreBtn = bar.querySelector<HTMLElement>('.mz-more')!;
  const rvInfo = bar.querySelector<HTMLElement>('.mz-rvinfo')!;
  const doneBtn = bar.querySelector<HTMLElement>('.mz-done')!;
  const endRvBtn = bar.querySelector<HTMLElement>('.mz-endrev')!;
  const hintEl = bar.querySelector<HTMLElement>('.mz-hint')!;

  levelBtns.forEach((b) => b.addEventListener('click', () => setLevel(Number(b.dataset.l) as Level)));
  // "Options ▾" menu — reveal toggles, hide-mastered, review-due, progress
  function openMzMenu(anchor: HTMLElement): void {
    const ex = document.querySelector('.mzmenu'); if (ex) { ex.remove(); return; }
    const m = document.createElement('div'); m.className = 'mzmenu';
    function render(): void {
      const due = dueList().length, c = counts();
      let h = '';
      h += '<button type="button" data-a="rev"><span>' + (revealAll ? 'Hide all' : 'Reveal all') + '</span></button>';
      h += '<button type="button" data-a="mode"><span>Tap reveals</span><span class="st">' + (revealMode === 'line' ? 'whole line' : 'word') + '</span></button>';
      if (!reviewActive) {
        h += '<button type="button" data-a="hm"><span>Hide mastered</span><span class="st">' + (hideMastered ? 'On' : 'Off') + '</span></button>';
        h += '<div class="mzm-div"></div>';
        h += '<button type="button" data-a="due"' + (due ? '' : ' disabled') + '><span>Review due</span><span class="st">' + due + '</span></button>';
        h += '<button type="button" data-a="prog"><span>Your progress</span><span class="st">' + c.m + '/' + c.t + '</span></button>';
      }
      m.innerHTML = h;
    }
    function place(): void {
      const w = m.offsetWidth, r = anchor.getBoundingClientRect();
      m.style.top = (r.bottom + 8) + 'px';
      m.style.left = Math.round(Math.min(Math.max(8, r.right - w), window.innerWidth - 8 - w)) + 'px';
    }
    render(); document.body.appendChild(m); place();
    function shut(): void { m.remove(); document.removeEventListener('click', onDoc, true); }
    function onDoc(ev: Event): void { if (!m.contains(ev.target as Node) && ev.target !== anchor) shut(); }
    m.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('button[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'rev') { setRevealAll(!revealAll); render(); place(); }
      else if (a === 'mode') { setRevealMode(revealMode === 'line' ? 'word' : 'line'); render(); place(); }
      else if (a === 'hm') { setHideMastered(!hideMastered); render(); place(); }
      else if (a === 'due') { shut(); startReview(); }
      else if (a === 'prog') { shut(); openPanel(); }
    });
    setTimeout(() => document.addEventListener('click', onDoc, true), 0);
  }
  moreBtn.addEventListener('click', (e) => { e.stopPropagation(); openMzMenu(moreBtn); });
  doneBtn.addEventListener('click', deactivate);
  endRvBtn.addEventListener('click', () => {
    reviewActive = false;
    document.body.classList.remove('mz-review');
    verses.forEach((v) => v.el.classList.remove('mz-rvcur'));
    setBarMode('chapter'); setChapter(currentChapterIdx(), false); updateDue();
  });
  refreshCounts(); updateDue();

  // ---------- panel / export-import / end-of-review ----------
  const pct = (m: number, t: number) => (t ? Math.round(m / t * 100) : 0);
  function overlay(): HTMLElement {
    const ov = document.createElement('div'); ov.className = 'mzov';
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));
    return ov;
  }
  function closeOv(ov: HTMLElement): void {
    ov.classList.remove('show');
    setTimeout(() => ov.remove(), 200);
  }

  function openEndModal(n: number, nextDue: string | null): void {
    const ov = overlay();
    ov.innerHTML = '<div class="mzcard mzend" role="dialog" aria-label="Review complete">'
      + '<div class="big">✓</div><h3 style="text-align:center">Review complete</h3>'
      + '<p class="sub" style="text-align:center">You reviewed ' + n + ' ' + (n === 1 ? 'bayt' : 'abyāt') + ' · ' + POEM_NAME + '</p>'
      + '<p style="text-align:center;color:var(--ink,#3a2a2b);font-size:.86rem;font-weight:600;margin:6px 0 2px">Next review due ' + (nextDue ? humanDue(nextDue) : 'when you master more') + '.</p>'
      + '<button type="button" class="mzclose">Done</button></div>';
    ov.querySelector('.mzclose')!.addEventListener('click', () => closeOv(ov));
    ov.addEventListener('click', (e) => { if (e.target === ov) closeOv(ov); });
  }

  function openPanel(): void {
    const all = counts();
    const due = dueList().length;
    const ov = overlay();
    const chRows = sections.map((sec, i) => {
      const c = counts(sec);
      return '<div class="mzchrow"><span class="nm">' + chapterLabel(i) + '</span>'
        + '<span class="mzbarline"><i style="width:' + pct(c.m, c.t) + '%"></i></span>'
        + '<span class="pc">' + c.m + '/' + c.t + '</span></div>';
    }).join('');
    ov.innerHTML =
      '<div class="mzcard" role="dialog" aria-label="Your progress">'
      + '<h3>Your progress</h3><p class="sub">' + POEM_NAME + '</p>'
      + '<div class="mzbig">' + all.m + ' <small>/ ' + all.t + ' abyāt mastered · ' + pct(all.m, all.t) + '%</small></div>'
      + '<div class="mzbarline"><i style="width:' + pct(all.m, all.t) + '%"></i></div>'
      + (due > 0
        ? '<button type="button" class="mzcta rvnow">Review ' + due + ' due now</button>'
        : '<div class="mzcta calm">All caught up — no reviews due</div>')
      + '<div class="mzstat">'
      + '<div><b>🔥 ' + (prog.streak.n || 0) + '</b><span>day streak</span></div>'
      + '<div><b>' + due + '</b><span>due now</span></div>'
      + '<div><b>' + (prog.goal.date === today ? prog.goal.done : 0) + '/' + goalTarget() + '</b><span>new today</span></div>'
      + '</div>'
      + '<div class="mzchlist">' + chRows + '</div>'
      + '<div class="mzbackup">'
      + '<div class="bk-title">Back up &amp; move your progress</div>'
      + '<p class="bk-help">Your progress is saved only on this device. Back it up so you don’t lose it, or move it to another phone or tablet.</p>'
      + '<div class="mzactions">'
      + '<button type="button" class="prime io-exp">↓ Back up</button>'
      + '<button type="button" class="io-imp">↑ Restore</button></div>'
      + '<div class="io-exp-area" style="display:none">'
      + '<p class="bk-note"></p>'
      + '<div class="mzactions">'
      + '<button type="button" class="io-share" style="display:none">Share…</button>'
      + '<button type="button" class="io-copy">Copy again</button>'
      + '<button type="button" class="io-file">Save as file</button></div>'
      + '<details class="io-details"><summary>Show backup code</summary><textarea class="mzio mzio-out" readonly spellcheck="false"></textarea></details>'
      + '</div>'
      + '<div class="io-imp-area" style="display:none">'
      + '<p class="bk-help">Paste a backup you saved earlier — or choose a backup file — then tap Apply.</p>'
      + '<textarea class="mzio mzio-in" spellcheck="false" placeholder="Paste your backup here…"></textarea>'
      + '<div class="mzactions">'
      + '<button type="button" class="io-choose">Choose file…</button>'
      + '<button type="button" class="prime io-apply">Apply</button></div>'
      + '<input type="file" class="io-fileinput" accept=".txt,.json,application/json,text/plain" hidden></div>'
      + '<div class="mzmsg"></div>'
      + '</div>'
      + '<div class="mzactions"><button type="button" class="danger rst-ch">Reset chapter</button>'
      + '<button type="button" class="danger rst-all">Reset all</button></div>'
      + '<button type="button" class="mzclose">Close</button></div>';

    const $ = <T extends HTMLElement = HTMLElement>(sel: string) => ov.querySelector<T>(sel)!;
    const msg = $('.mzmsg');
    const expArea = $('.io-exp-area');
    const impArea = $('.io-imp-area');
    const outBox = $<HTMLTextAreaElement>('.mzio-out');
    const inBox = $<HTMLTextAreaElement>('.mzio-in');
    const expNote = $('.bk-note');
    const shareBtn = $('.io-share');
    const fileInput = $<HTMLInputElement>('.io-fileinput');
    const closePanel = () => closeOv(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) closePanel(); });
    $('.mzclose').addEventListener('click', closePanel);

    ov.querySelector('.rvnow')?.addEventListener('click', () => { closePanel(); startReview(); });

    /* Notes and bookmarks ride along in the backup (notes.ts / bookmarks.ts
       own these keys and refresh on the events dispatched after a restore). */
    const notesKey = 'asl-notes-' + poem;
    const bmKey = 'asl-bm-' + poem;
    function readNotes(): Record<string, unknown> {
      try {
        const o: unknown = JSON.parse(localStorage.getItem(notesKey) || 'null');
        return o && typeof o === 'object' ? (o as Record<string, unknown>) : {};
      } catch { return {}; }
    }
    function readBm(): unknown[] {
      try {
        const a: unknown = JSON.parse(localStorage.getItem(bmKey) || 'null');
        return Array.isArray(a) ? a : [];
      } catch { return []; }
    }
    const hasProgress = () => Object.keys(prog.v).length > 0 || Object.keys(readNotes()).length > 0 || readBm().length > 0;
    function backupText(): string {
      const b: { v: Progress['v']; streak: Progress['streak']; goal: Progress['goal']; notes?: Record<string, unknown>; bookmarks?: unknown[] } =
        { v: prog.v, streak: prog.streak, goal: prog.goal };
      const nt = readNotes(); if (Object.keys(nt).length) b.notes = nt;
      const bm = readBm(); if (bm.length) b.bookmarks = bm;
      return JSON.stringify(b);
    }
    function setMsg(text: string, good?: boolean): void {
      msg.style.color = good ? '#a9791f' : good === false ? '#a23b3b' : '#6c585a';
      msg.textContent = text;
    }
    function copyOut(): boolean {
      try {
        outBox.removeAttribute('readonly'); outBox.select();
        const ok = document.execCommand('copy');
        outBox.setAttribute('readonly', '');
        return ok;
      } catch { return false; }
    }

    $('.io-exp').addEventListener('click', () => {
      if (!hasProgress()) {
        expArea.style.display = 'none'; impArea.style.display = 'none';
        setMsg('You have no saved progress yet — memorize a few abyāt first, then back up.', false);
        return;
      }
      impArea.style.display = 'none'; expArea.style.display = 'block'; setMsg('');
      outBox.value = backupText();
      if (typeof navigator.share === 'function') shareBtn.style.display = '';
      expNote.textContent = copyOut()
        ? '✓ Copied. Paste it into your Notes app, or send it to yourself in a message — that is your backup.'
        : 'Tap “Show backup code” below, then select all and copy it to keep it safe.';
    });
    shareBtn.addEventListener('click', () => {
      if (typeof navigator.share === 'function') {
        navigator.share({ title: SITE.appName + ' progress — ' + POEM_NAME, text: backupText() }).catch(() => { /* dismissed */ });
      }
    });
    $('.io-copy').addEventListener('click', () => {
      expNote.textContent = copyOut() ? '✓ Copied again.' : 'Select the code below and copy it.';
    });
    $('.io-file').addEventListener('click', () => {
      try {
        const blob = new Blob([backupText()], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = SITE.appName.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + poem + '-progress.txt';
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 600);
        expNote.textContent = '✓ Saved as a file on your device.';
      } catch { setMsg('Could not save a file — use Copy instead.', false); }
    });
    $('.io-imp').addEventListener('click', () => {
      expArea.style.display = 'none'; impArea.style.display = 'block'; setMsg(''); inBox.value = ''; inBox.focus();
    });
    $('.io-choose').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { inBox.value = String(r.result || ''); setMsg('File loaded — tap Apply.'); };
      r.readAsText(f);
    });
    $('.io-apply').addEventListener('click', () => {
      try {
        const obj = JSON.parse(inBox.value) as Partial<Progress> & { notes?: unknown; bookmarks?: unknown } | null;
        if (!obj || typeof obj !== 'object' || !obj.v) throw new Error('not a backup');
        prog.v = obj.v || {}; prog.streak = obj.streak || prog.streak; prog.goal = obj.goal || prog.goal;
        save(); verses.forEach(applyRing); refreshCounts(); updateDue();
        if (obj.notes && typeof obj.notes === 'object') {
          lsSet(notesKey, JSON.stringify(obj.notes));
          document.dispatchEvent(new Event('asl-notes-updated'));
        }
        if (Array.isArray(obj.bookmarks)) {
          lsSet(bmKey, JSON.stringify(obj.bookmarks));
          document.dispatchEvent(new Event('asl-bm-updated'));
        }
        setMsg('Progress restored.', true);
        setTimeout(() => { closePanel(); openPanel(); }, 800);
      } catch { setMsg('That backup could not be read. Make sure you pasted the whole code.', false); }
    });
    $('.rst-ch').addEventListener('click', () => {
      if (!confirm('Reset progress for ' + chapterLabel(chIdx) + '?')) return;
      verses.forEach((v) => { if (v.section === sections[chIdx]) { delete prog.v[v.id]; applyRing(v); } });
      save(); refreshCounts(); updateDue(); closePanel(); openPanel();
    });
    $('.rst-all').addEventListener('click', () => {
      if (!confirm('Reset ALL memorization progress for ' + POEM_NAME + '? This cannot be undone.')) return;
      prog.v = {}; save(); verses.forEach(applyRing); refreshCounts(); updateDue(); closePanel(); openPanel();
    });
  }

  // ---------- mode entry ----------
  // ?mode=memorize (home buttons / bottom tab) opens straight into Memorize;
  // ?mode=read forces the reading view; with no param, the matn reopens in
  // whatever mode it was last used in on this device (asl-mode-<poem>).
  {
    const q = location.search;
    const want = /[?&]mode=memorize\b/.test(q) ? 'memorize'
      : /[?&]mode=read\b/.test(q) ? 'read' : lsGet('asl-mode-' + poem);
    if (want === 'memorize') activate();
    else if (want === 'read') rememberMode('read');
  }
}
