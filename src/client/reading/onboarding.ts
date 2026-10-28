/* First-run animated walkthrough for the reading pages.
   A moving fingertip demonstrates the key gestures (tap a word for its meaning,
   open the Translation menu, bookmark a verse, search) so new users discover
   them. Runs automatically once per device, and can be replayed anytime from
   the ⋯ More button in the top bar. Skip / Next / Got it.

   The ⋯ More menu itself lives here too: the PDF downloads (when the matn has
   them), "Show me around", the User Guide, the edition (nuskha) picker on a
   matn with more than one, and Appearance (Auto / Light / Dark). */
import { currentPoem, esc, listedPoems, lsGet, lsSet } from '../page.ts';
import type { PoemConfig } from '../../poems/types.ts';

const KEY = 'asl-tour';

const RIBBON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4z"/></svg>';
const MAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';
const CAP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 2 9l10 5 10-5-10-5z"/><path d="M5 11.2V16c0 1.6 3.1 3 7 3s7-1.4 7-3v-4.8"/></svg>';
const HELP = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
const LIST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>';
const PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>';

const CSS = [
  '.helpbtn{cursor:pointer;display:inline-grid;place-items:center;width:34px;height:34px;padding:0;',
  'border-radius:50%;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447);',
  'flex:0 0 auto;transition:background .15s,border-color .15s;-webkit-tap-highlight-color:transparent}',
  '.helpbtn:hover{border-color:var(--gilt,#c0973c);background:var(--paper,#f7f2e5)}',
  '.helpbtn svg{width:18px;height:18px}',
  '.help-menu{position:fixed;z-index:410;background:var(--surface,#fff);border:1px solid var(--paper-edge,#e8dcc7);border-radius:12px;box-shadow:0 14px 34px rgba(14,38,56,.18);padding:5px;min-width:196px;font-family:"Montserrat",sans-serif}',
  '.help-menu button,.help-menu a{display:flex;align-items:center;gap:9px;width:100%;box-sizing:border-box;text-align:left;text-decoration:none;border:0;background:transparent;cursor:pointer;color:var(--ink-soft,#6c585a);font-family:inherit;font-size:.82rem;font-weight:600;padding:10px 12px;border-radius:8px}',
  '.help-menu button:hover,.help-menu a:hover{background:var(--paper,#f7f2e5);color:var(--madder,#8a4447)}',
  '.help-menu .hm-head{padding:8px 12px 3px;font-size:.62rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--sage,#9c7f80)}',
  '.help-menu .hm-div{height:1px;background:var(--paper-edge,#e8dcc7);margin:5px 4px}',
  '.help-menu .hm-theme{display:flex;gap:5px;padding:2px 8px 6px}',
  '.help-menu .hm-theme button{flex:1;width:auto;justify-content:center;padding:7px 4px;border:1px solid var(--paper-edge,#e8dcc7);border-radius:8px;font-size:.72rem;font-weight:700;color:var(--ink-soft,#6c585a);background:var(--surface,#fff)}',
  '.help-menu .hm-theme button.on{background:var(--madder,#8a4447);color:#fbeee8;border-color:var(--madder,#8a4447)}',
  /* Nuskha (edition) picker — shown only on pages exporting window.AslNuskha */
  '.help-menu .hm-nuskha{display:flex;flex-wrap:wrap;gap:5px;padding:2px 8px 6px}',
  '.help-menu .hm-nuskha button{flex:1 1 40%;width:auto;justify-content:center;padding:7px 4px;border:1px solid var(--paper-edge,#e8dcc7);border-radius:8px;font-size:.72rem;font-weight:700;color:var(--ink-soft,#6c585a);background:var(--surface,#fff)}',
  '.help-menu .hm-nuskha button.on{background:var(--madder,#8a4447);color:#fbeee8;border-color:var(--madder,#8a4447)}',
  '.tour-ov{position:fixed;inset:0;z-index:400;background:rgba(58,42,43,.55);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .25s}',
  '.tour-ov.show{opacity:1}',
  '.tour-card{width:100%;max-width:360px;background:var(--paper,#f9f4ea);border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.45);overflow:hidden;font-family:"Montserrat",sans-serif}',
  '.tour-stage{position:relative;height:190px;background:linear-gradient(180deg,#fff,#faf5ec);border-bottom:1px solid var(--paper-edge,#e8dcc7);overflow:hidden}',
  '.scene{position:absolute;inset:0}',
  '.tour-hand{position:absolute;width:30px;height:30px;margin:-6px 0 0 -6px;border-radius:50%;background:rgba(94,44,48,.32);border:2.5px solid #5e2c30;box-shadow:0 3px 8px rgba(0,0,0,.3);opacity:0;z-index:6;pointer-events:none;transition:transform .15s}',
  '.tour-hand.press{transform:scale(.78)}',
  '.tour-ripple{position:absolute;width:38px;height:38px;border-radius:50%;border:2px solid var(--madder,#8a4447);opacity:0;z-index:5;pointer-events:none;transform:translate(-50%,-50%) scale(.4)}',
  '.tour-ripple.go{animation:tourRip .6s ease-out}',
  '@keyframes tourRip{0%{opacity:.85;transform:translate(-50%,-50%) scale(.4)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.7)}}',
  /* scene 1: word meaning */
  '.m-verse{position:absolute;left:0;right:0;top:86px;text-align:center;font-family:"Scheherazade New","Amiri",serif;font-size:1.75rem;color:var(--ink,#3a2a2b);direction:rtl}',
  '.m-word{border-radius:6px;padding:1px 5px;transition:background .25s}',
  '.scene.revealed .m-word{background:#f0ddcf}',
  '.m-tip{position:absolute;left:50%;top:40px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;background:#5e2c30;color:#fbeee8;font-size:.82rem;font-weight:600;padding:6px 12px;border-radius:9px;white-space:nowrap}',
  '.m-tip::after{content:"";position:absolute;top:100%;left:50%;transform:translateX(-50%);border:6px solid transparent;border-top-color:#5e2c30}',
  '.scene.revealed .m-tip{opacity:1;transform:translateX(-50%)}',
  /* scene 2: translation */
  '.m-pill{position:absolute;left:50%;top:52px;transform:translateX(-50%);border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--gilt-deep,#a97b21);font-weight:700;font-size:.82rem;border-radius:22px;padding:8px 15px}',
  '.m-drop{position:absolute;left:50%;top:96px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;background:var(--surface,#fff);border:1px solid var(--paper-edge,#e8dcc7);border-radius:12px;box-shadow:0 12px 26px rgba(14,38,56,.18);padding:5px;min-width:150px}',
  '.scene.revealed .m-drop{opacity:1;transform:translateX(-50%)}',
  '.m-opt{display:block;text-align:left;font-size:.8rem;font-weight:600;color:var(--ink-soft,#6c585a);padding:8px 12px;border-radius:8px}',
  '.m-opt.on{background:var(--madder,#8a4447);color:#fbeee8}',
  /* scene 3: bookmark */
  '.m-row{position:absolute;left:0;right:0;top:78px;display:flex;align-items:center;justify-content:center;gap:12px}',
  '.m-line{font-family:"Scheherazade New","Amiri",serif;font-size:1.35rem;color:var(--ink,#3a2a2b);direction:rtl}',
  '.m-ribbon{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447)}',
  '.m-ribbon svg{width:15px;height:15px}',
  '.scene.revealed .m-ribbon{background:var(--madder,#8a4447);color:#fff;border-color:var(--madder,#8a4447)}',
  '.scene.revealed .m-ribbon svg{fill:currentColor}',
  '.m-saved{position:absolute;left:50%;top:38px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;background:#3f7a55;color:#fff;font-size:.76rem;font-weight:700;padding:5px 12px;border-radius:9px}',
  '.scene.revealed .m-saved{opacity:1;transform:translateX(-50%)}',
  /* scene 4: search */
  '.m-mag{position:absolute;left:50%;top:60px;transform:translateX(-50%);display:inline-grid;place-items:center;width:36px;height:36px;border-radius:50%;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447)}',
  '.m-mag svg{width:18px;height:18px}',
  '.m-field{position:absolute;left:50%;top:104px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;min-width:180px;text-align:center;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);border-radius:22px;padding:9px 16px;font-family:"Scheherazade New","Amiri",serif;font-size:1.15rem;color:var(--ink,#3a2a2b);direction:rtl}',
  '.scene.revealed .m-field{opacity:1;transform:translateX(-50%)}',
  /* scene: jump to chapter */
  '.j-btn{position:absolute;left:50%;top:42px;transform:translateX(-50%);display:inline-flex;align-items:center;gap:6px;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447);border-radius:20px;padding:6px 12px;font-family:"Montserrat",sans-serif;font-weight:700;font-size:.78rem}',
  '.j-btn svg{width:15px;height:15px}',
  /* the stage clips at 190px: this list has to start high and its rows must
     not wrap, or the last chapter is cut off the bottom. The rows are the
     matn's own chapters, so a long name is cut short rather than let the list
     outgrow the 360px card. */
  '.j-list{position:absolute;left:50%;top:78px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;background:var(--surface,#fff);border:1px solid var(--paper-edge,#e8dcc7);border-radius:11px;box-shadow:0 12px 26px rgba(14,38,56,.18);padding:5px;min-width:214px;max-width:290px}',
  '.scene.revealed .j-list{opacity:1;transform:translateX(-50%)}',
  '.j-it{display:flex;align-items:center;gap:9px;padding:5px 10px;border-radius:8px;font-family:"Montserrat",sans-serif;font-size:.74rem;font-weight:600;color:var(--ink-soft,#6c585a);white-space:nowrap}',
  '.j-it .jn{flex:0 0 auto;min-width:19px;height:19px;border-radius:50%;background:var(--paper-2,#f3eada);color:var(--madder,#8a4447);display:grid;place-items:center;font-size:.66rem;font-weight:700}',
  '.j-it .jt{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}',
  '.j-it .jt.ar{font-family:"Scheherazade New","Amiri",serif;font-size:.98rem;font-weight:400;line-height:1.2;direction:rtl;text-align:right}',
  '.j-it.on{background:var(--madder,#8a4447);color:#fff}',
  '.j-it.on .jn{background:rgba(255,255,255,.9);color:var(--madder,#8a4447)}',
  /* scene: listen & repeat (audio) */
  '.a-line{position:absolute;left:0;right:0;top:64px;text-align:center;font-family:"Scheherazade New","Amiri",serif;font-size:1.5rem;color:var(--ink,#3a2a2b);direction:rtl}',
  '.a-play{position:absolute;left:50%;top:120px;transform:translateX(-50%);display:inline-grid;place-items:center;width:46px;height:46px;border-radius:50%;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447);transition:background .25s,color .25s,border-color .25s}',
  '.a-play svg{width:22px;height:22px}',
  '.scene.revealed .a-play{background:var(--madder,#8a4447);color:#fff;border-color:var(--madder,#8a4447)}',
  '.a-tag{position:absolute;left:50%;top:34px;transform:translateX(-50%) translateY(6px);opacity:0;transition:opacity .25s,transform .25s;background:#5e2c30;color:#fbeee8;font-size:.72rem;font-weight:700;padding:4px 10px;border-radius:8px;white-space:nowrap}',
  '.scene.revealed .a-tag{opacity:1;transform:translateX(-50%)}',
  /* scene 5: memorize */
  '.h-hat{position:absolute;left:50%;top:44px;transform:translateX(-50%);display:inline-grid;place-items:center;width:48px;height:48px;border-radius:50%;background:var(--surface,#fff);border:1px solid var(--paper-edge,#e8dcc7);color:var(--madder,#8a4447);transition:background .25s,color .25s,border-color .25s}',
  '.h-hat svg{width:26px;height:26px}',
  '.scene.revealed .h-hat{background:var(--madder,#8a4447);color:#fbeee8;border-color:var(--madder,#8a4447)}',
  '.h-tag{position:absolute;left:50%;top:2px;transform:translateX(-50%) translateY(6px);opacity:0;transition:opacity .25s,transform .25s;background:#5e2c30;color:#fbeee8;font-size:.72rem;font-weight:700;padding:4px 10px;border-radius:8px;white-space:nowrap}',
  '.scene.revealed .h-tag{opacity:1;transform:translateX(-50%)}',
  '.h-line{position:absolute;left:0;right:0;top:118px;text-align:center;font-family:"Scheherazade New","Amiri",serif;font-size:1.55rem;color:var(--ink,#3a2a2b);direction:rtl}',
  '.h-w{border-radius:5px;padding:1px 5px;transition:color .3s,background .3s,box-shadow .3s}',
  '.scene.revealed .h-w{color:transparent;background:#efe3d3;box-shadow:inset 0 -2px 0 rgba(201,180,143,.95)}',
  /* scene 5b: hide less / more (level dial) */
  '.l-dial{position:absolute;left:50%;top:50px;transform:translateX(-50%);display:flex;align-items:center;gap:6px}',
  '.l-dial .l-cap{font-family:"Montserrat",sans-serif;font-size:.6rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--sage,#9c7f80)}',
  '.l-b{display:grid;place-items:center;min-width:26px;height:26px;border:1px solid var(--paper-edge,#e8dcc7);border-radius:7px;font-family:"Montserrat",sans-serif;font-weight:700;font-size:.82rem;color:var(--ink-soft,#6c585a);background:var(--surface,#fff);transition:background .25s,color .25s,border-color .25s}',
  '.scene.revealed .l-b.sc-target{background:var(--madder,#8a4447);color:#fbeee8;border-color:var(--madder,#8a4447)}',
  '.l-line{position:absolute;left:0;right:0;top:120px;text-align:center;font-family:"Scheherazade New","Amiri",serif;font-size:1.5rem;color:var(--ink,#3a2a2b);direction:rtl}',
  '.l-w{border-radius:5px;padding:1px 5px;transition:color .3s,background .3s}',
  '.l-w.last{color:transparent;background:#efe3d3}',
  '.scene.revealed .l-w{color:transparent;background:#efe3d3;box-shadow:inset 0 -2px 0 rgba(201,180,143,.95)}',
  /* scene 6: progress / rating */
  '.p-med{position:absolute;left:50%;top:62px;transform:translateX(-50%);width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:var(--surface,#fff);border:1px solid var(--paper-edge,#e8dcc7);font-family:"Cormorant Garamond",serif;font-weight:700;color:var(--madder,#8a4447);font-size:1.15rem;transition:box-shadow .3s}',
  '.scene.revealed .p-med{box-shadow:0 0 0 2px #b58a2e,0 0 0 4px rgba(181,138,46,.26)}',
  '.p-rate{position:absolute;left:50%;top:118px;transform:translateX(-50%);display:flex;gap:9px}',
  '.p-rate span{border-radius:20px;padding:6px 14px;font-size:.78rem;font-weight:700;background:var(--surface,#fff)}',
  '.p-got{border:1px solid #e6d5a8;color:#a9791f;transition:background .25s,color .25s}',
  '.scene.revealed .p-got{background:#b58a2e;color:#fff;border-color:#b58a2e}',
  '.p-rev{border:1px solid var(--paper-edge,#e8dcc7);color:var(--ink-soft,#6c585a)}',
  '.p-badge{position:absolute;left:50%;top:34px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;background:#b58a2e;color:#fff;font-size:.76rem;font-weight:700;padding:5px 12px;border-radius:9px}',
  '.scene.revealed .p-badge{opacity:1;transform:translateX(-50%)}',
  /* scene 7: spaced-repetition review */
  '.r-cap{position:absolute;left:50%;top:60px;transform:translateX(-50%);display:inline-grid;place-items:center;width:54px;height:54px;border-radius:50%;background:var(--madder,#8a4447);color:#fbeee8}',
  '.r-cap svg{width:29px;height:29px}',
  '.r-badge{position:absolute;top:-4px;right:-4px;min-width:21px;height:21px;padding:0 4px;border-radius:11px;background:#a23b3b;color:#fff;font-family:"Montserrat",sans-serif;font-size:.72rem;font-weight:700;display:grid;place-items:center;box-shadow:0 0 0 2px #fff;transition:transform .2s}',
  '.scene.revealed .r-badge{transform:scale(1.15)}',
  '.r-note{position:absolute;left:50%;top:130px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;background:#a23b3b;color:#fff;font-size:.8rem;font-weight:700;padding:6px 13px;border-radius:9px}',
  '.scene.revealed .r-note{opacity:1;transform:translateX(-50%)}',
  /* scene 8: export / import progress */
  '.e-row{position:absolute;left:50%;top:92px;transform:translateX(-50%);display:flex;gap:10px}',
  '.e-row span{border:1px solid var(--paper-edge,#e8dcc7);border-radius:10px;padding:9px 18px;font-family:"Montserrat",sans-serif;font-size:.8rem;font-weight:700;background:var(--surface,#fff);color:var(--ink,#3a2a2b)}',
  '.e-exp{transition:background .25s,color .25s,border-color .25s}',
  '.scene.revealed .e-exp{background:var(--madder,#8a4447);color:#fbeee8;border-color:var(--madder,#8a4447)}',
  '.e-badge{position:absolute;left:50%;top:44px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;background:#3f7a55;color:#fff;font-size:.76rem;font-weight:700;padding:5px 12px;border-radius:9px}',
  '.scene.revealed .e-badge{opacity:1;transform:translateX(-50%)}',
  /* scene: switch matn */
  '.s-pill{position:absolute;left:50%;top:18px;transform:translateX(-50%);border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--gilt-deep,#a97b21);font-weight:700;font-size:.82rem;border-radius:22px;padding:8px 15px}',
  /* at most six mutūn, so the list is tight and starts high — the stage
     clips at 190px and looser spacing pushes the last ones off it */
  '.s-list{position:absolute;left:50%;top:56px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;background:var(--surface,#fff);border:1px solid var(--paper-edge,#e8dcc7);border-radius:12px;box-shadow:0 12px 26px rgba(14,38,56,.18);padding:5px;min-width:172px}',
  '.s-list span{display:block;padding:0 10px;border-radius:7px;color:var(--ink-soft,#6c585a);text-align:right;font-family:"Scheherazade New","Amiri",serif;font-size:.86rem;line-height:1.26}',
  '.s-list span.on{background:var(--paper,#f7f2e5);color:var(--madder,#8a4447);font-weight:700}',
  '.scene.revealed .s-list{opacity:1;transform:translateX(-50%)}',
  /* scene: notes */
  '.n-row{position:absolute;left:50%;top:56px;transform:translateX(-50%);display:flex;align-items:center;gap:9px}',
  '.n-pen{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447)}',
  '.n-pen svg{width:15px;height:15px}',
  '.n-line{font-family:"Scheherazade New","Amiri",serif;font-size:1.4rem;color:var(--ink,#3a2a2b);direction:rtl}',
  '.n-box{position:absolute;left:50%;top:106px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;background:#fdf7e8;border:1px solid var(--gilt,#c0973c);border-radius:10px;padding:8px 13px;font-size:.78rem;color:var(--ink-soft,#6c585a);max-width:250px;text-align:center}',
  '.scene.revealed .n-box{opacity:1;transform:translateX(-50%)}',
  /* scene: explanation / qiraat card */
  '.x-btn{position:absolute;left:50%;top:26px;transform:translateX(-50%);display:inline-grid;place-items:center;width:32px;height:32px;border-radius:50%;border:1px solid var(--paper-edge,#e8dcc7);background:var(--surface,#fff);color:var(--madder,#8a4447);font-size:1rem}',
  '.x-card{position:absolute;left:50%;top:68px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;background:var(--surface,#fff);border:1px solid var(--paper-edge,#e8dcc7);border-radius:12px;box-shadow:0 12px 26px rgba(14,38,56,.16);padding:8px 12px;min-width:238px}',
  '.x-card .xh{font-size:.6rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--sage,#9c7f80);margin-bottom:3px}',
  '.x-card .xa{font-family:"Scheherazade New","Amiri",serif;font-size:1.15rem;direction:rtl;color:var(--ink,#3a2a2b)}',
  '.x-card .xt{font-size:.72rem;color:var(--ink-soft,#6c585a);margin-top:3px}',
  '.scene.revealed .x-card{opacity:1;transform:translateX(-50%)}',
  /* scene: light or dark */
  '.t-row{position:absolute;left:50%;top:78px;transform:translateX(-50%);display:flex;gap:7px}',
  '.t-row span{border:1px solid var(--paper-edge,#e8dcc7);border-radius:9px;padding:8px 15px;font-family:"Montserrat",sans-serif;font-size:.76rem;font-weight:700;background:var(--surface,#fff);color:var(--ink-soft,#6c585a);transition:background .3s,color .3s,border-color .3s}',
  '.scene.revealed .t-dark{background:#241a1b;color:#f4e9d8;border-color:#241a1b}',
  '.t-note{position:absolute;left:50%;top:130px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;font-size:.74rem;color:var(--sage,#9c7f80)}',
  '.scene.revealed .t-note{opacity:1;transform:translateX(-50%)}',
  /* caption + footer */
  '.tour-cap{padding:16px 20px 2px;text-align:center}',
  '.tour-cap h3{font-family:"Cormorant Garamond",Georgia,serif;color:var(--madder,#8a4447);font-size:1.32rem;margin:0 0 5px}',
  '.tour-cap p{color:var(--ink-soft,#6c585a);font-size:.85rem;line-height:1.5;margin:0;min-height:38px}',
  '.tour-foot{display:flex;align-items:center;justify-content:space-between;padding:12px 16px 16px}',
  '.tour-dots{display:flex;gap:6px}',
  '.tour-dots i{width:7px;height:7px;border-radius:50%;background:var(--paper-edge,#e8dcc7);transition:background .2s}',
  '.tour-dots i.on{background:var(--madder,#8a4447)}',
  '.tour-skip{background:none;border:0;color:var(--sage,#9c7f80);font-size:.78rem;font-weight:600;cursor:pointer;padding:8px}',
  '.tour-next{background:var(--madder,#8a4447);color:#fbeee8;border:0;border-radius:22px;padding:9px 20px;font-size:.8rem;font-weight:700;cursor:pointer}',
  '@media (prefers-reduced-motion:reduce){.tour-hand,.tour-ripple{display:none}.scene .m-tip,.scene .m-drop,.scene .m-saved,.scene .m-field,.scene .m-word{transition:none}}',
].join('');

interface Scene { title: string; text: string; html: string }

/* The switcher scene shows the mutūn this site actually serves, up to six
   (the stage's height), always including the one being read. */
function switchList(here: PoemConfig | null): string | null {
  const all: PoemConfig[] = [...listedPoems()];
  if (here && !all.some((p) => p.id === here.id)) all.push(here); // a draft being proofed
  if (all.length < 2) return null; // nothing to switch to
  const at = Math.max(0, all.findIndex((p) => p.id === here?.id));
  const start = Math.max(0, Math.min(at - 2, all.length - 6));
  return all.slice(start, start + 6)
    .map((p) => `<span${p.id === here?.id ? ' class="on"' : ''}>${esc(p.shortAr)}</span>`).join('');
}

/* The chapter-jump scene lists the first three chapters of this matn. */
function chapterRows(sections: HTMLElement[]): { rows: string; num: string } {
  let num = '';
  const rows = sections.slice(0, 3).map((sec, i) => {
    const n = (sec.id || '').replace('ch', '');
    const en = (sec.querySelector('.ch-en')?.textContent || '').trim();
    const ar = (sec.querySelector('.ch-ar')?.textContent || '').trim();
    const on = i === 1;
    if (on) num = n;
    const label = en ? `<span class="jt">${esc(en)}</span>` : `<span class="jt ar">${esc(ar || 'Chapter ' + n)}</span>`;
    return `<span class="j-it${on ? ' on' : ''}"><span class="jn">${esc(n)}</span>${label}</span>`;
  }).join('');
  return { rows, num };
}

/* Whether the matn carries English word glosses — from its data, since the
   renderer builds a chapter's gloss spans only as it nears the viewport. */
function hasWordGlosses(): boolean {
  if (document.querySelector('.hemi .seg[data-g]')) return true;
  for (const ch of window.ASL_POEM?.snapshot ?? []) {
    for (const v of ch.verses) {
      if (v.sadrW?.some((c) => c.g) || v.ajuzW?.some((c) => c.g)) return true;
    }
  }
  return false;
}

export function init(): void {
  if (!document.querySelector('.navbar')) return; // reading pages only
  // The tour also teaches the Translation menu, so suppress the small coach mark.
  lsSet('asl-trhint', '1');

  const here = currentPoem();
  const st = document.createElement('style');
  st.appendChild(document.createTextNode(CSS));
  document.head.appendChild(st);

  const hasPdf = !!document.querySelector('#pdfDrop a');
  /* One short line per scene. Every label here is the label the app really
     uses — the captions were checked against the running app, not written
     from memory, so "Export/Import" and "Theme" are gone: the buttons say
     ↓ Back up / ↑ Restore, and the menu section is Appearance. */
  const scenes: Scene[] = [];
  /* A matn with no translation at all has no Translation menu to teach. */
  if (!document.getElementById('viewMenu')?.hidden) {
    scenes.push({ title: 'Choose a translation',
      text: 'Translation ▾ — English, and Urdu where it exists. Arabic is always shown.',
      html: '<button class="sc-target m-pill">Translation ▾</button><div class="m-drop"><span class="m-opt on">✓ English</span><span class="m-opt">Urdu</span></div>' });
  }
  scenes.push(
    { title: 'Bookmark a bayt',
      text: 'Tap the ribbon. Bookmarks lists every one you have saved.',
      html: '<div class="m-row"><button class="sc-target m-ribbon">' + RIBBON + '</button><span class="m-line">وَبَعْدُ فَحَبْلُ اللهِ</span></div><div class="m-saved">Saved</div>' },
    { title: 'Write a note',
      text: 'Tap the pen. Your note sits under the bayt; Notes lists them all.',
      html: '<div class="n-row"><button class="sc-target n-pen">' + PEN + '</button><span class="n-line">وَبَعْدُ فَحَبْلُ اللهِ</span></div><div class="n-box">Shaykh: read this one slowly</div>' },
    { title: 'Search',
      text: 'Any part of a bayt, in Arabic. No diacritics needed.',
      html: '<button class="sc-target m-mag">' + MAG + '</button><div class="m-field">القُرآن</div>' },
  );
  const mutun = switchList(here);
  if (mutun) {
    scenes.push({ title: 'Move between the mutūn',
      text: 'Mutūn ▾ switches matn, and each remembers where you were.',
      html: '<button class="sc-target s-pill">Mutūn ▾</button><div class="s-list">' + mutun + '</div>' });
  }
  scenes.push(
    { title: 'Memorize',
      text: 'The words hide. Recite from memory, then tap a blank to check.',
      html: '<span class="sc-target h-hat">' + CAP + '</span><div class="h-tag">Memorize mode</div><div class="h-line">أَقولُ <span class="h-w">مَقالاً</span> <span class="h-w">مُعجِباً</span></div>' },
    { title: 'Hide less or more',
      text: '1 hides the last word · 4 hides the whole bayt. Raise it as abyāt stick.',
      html: '<div class="l-dial"><span class="l-cap">less</span><span class="l-b">1</span><span class="l-b">2</span><span class="l-b">3</span><span class="sc-target l-b">4</span><span class="l-cap">more</span></div><div class="l-line">أَقولُ <span class="l-w">مَقالاً</span> <span class="l-w last">مُعجِباً</span> <span class="l-w">لِأُولِي</span></div>' },
    { title: 'Rate each bayt',
      text: 'Two ✓ Got it master it — one is enough at level 4. The number earns a ring.',
      html: '<span class="p-med">١</span><div class="p-rate"><span class="sc-target p-got">✓ Got it</span><span class="p-rev">↺ Review</span></div><div class="p-badge">Mastered ✓</div>' },
    { title: 'Review comes back',
      text: 'After 1, 3, 7, 16, 35 then 90 days. The badge counts what is due.',
      html: '<span class="sc-target r-cap">' + CAP + '<span class="r-badge">3</span></span><div class="r-note">3 due for review</div>' },
    { title: 'Move to a new device',
      text: 'Options ▾ → Your progress → ↓ Back up here, ↑ Restore there.',
      html: '<div class="e-row"><span class="sc-target e-exp">↓ Back up</span><span class="e-imp">↑ Restore</span></div><div class="e-badge">Copied ✓</div>' },
    { title: 'The ⋯ More menu',
      text: 'Appearance, ' + (hasPdf ? 'the PDF, ' : '') + 'this walkthrough and the User Guide.',
      html: '<div class="t-row"><span>Auto</span><span>Light</span><span class="sc-target t-dark">Dark</span></div><div class="t-note">⋯ More → Appearance</div>' },
  );

  const titles = () => scenes.map((x) => x.title);
  const putBefore = (title: string, scene: Scene) => {
    const at = titles().indexOf(title);
    scenes.splice(at < 0 ? scenes.length : at, 0, scene);
  };

  let open = false;   // guard against opening a second overlay
  let syncDots: (() => void) | null = null; // set while the tour is on screen, so a scene added
                                            // after it opened (the audio one) still gets a dot

  /* Word meanings come from a matn's own word-by-word data (.seg[data-g]),
     and not every matn carries it — so this scene is added when the tour
     opens, once the page has actually drawn its abyāt. */
  let wordSceneAdded = false;
  function maybeAddWordScene(): void {
    if (wordSceneAdded || !hasWordGlosses()) return;
    wordSceneAdded = true;
    scenes.unshift({ title: 'Tap a word',
      text: 'Any highlighted word gives its meaning.',
      html: '<div class="m-verse">أَقولُ <span class="sc-target m-word">مَقالاً</span> مُعجِباً</div><div class="m-tip">a saying</div>' });
    syncDots?.();
  }

  // The chapter-jump scene is only relevant on the multi-chapter mutūn.
  const sections = [...document.querySelectorAll<HTMLElement>('section.chapter')];
  if (sections.length >= 2) {
    const { rows, num } = chapterRows(sections);
    // right after Search: ahead of the switcher, or of Memorize without one
    putBefore(mutun ? 'Move between the mutūn' : 'Memorize', {
      title: 'Jump to a chapter',
      text: 'Pick or search any chapter — or type a bayt number to land on it.',
      html: '<button class="sc-target j-btn">' + LIST + ' ' + esc(num) + '</button><div class="j-list">' + rows + '</div>',
    });
  }

  // Only the mutūn that carry commentary or Qurʾānic examples.
  /* qiraat.ts draws its buttons only for bayts as they come into view, so the
     DOM is no guide while this runs; the matn's registration is. Decide when
     the tour actually opens. */
  let explSceneAdded = false;
  function maybeAddExplScene(): void {
    if (explSceneAdded) return;
    const isQx = !!here?.qiraat;
    if (!(isQx || document.querySelector('.explanation'))) return;
    explSceneAdded = true;
    /* Two different cards wear this button. On the qirāʾāt mutūn it opens a
       Qurʾānic example; elsewhere it is a plain explanation of the bayt —
       so the scene says whichever the reader is actually looking at. */
    putBefore('Bookmark a bayt', isQx ? {
      title: 'See who reads it how',
      text: 'The āyah, the disputed word, and each reader’s wording. Arabic, English or Urdu.',
      html: '<button class="sc-target x-btn">۞</button>'
        + '<div class="x-card"><div class="xh">Qurʾānic example</div><div class="xa">مَٰلِكِ يَوْمِ ٱلدِّينِ</div><div class="xt">ʿĀṣim: <b>Māliki</b> · the rest: <b>Maliki</b></div></div>',
    } : {
      title: 'See why, not just what',
      text: 'The book button opens a plain explanation of that bayt.',
      html: '<button class="sc-target x-btn">۞</button>'
        + '<div class="x-card"><div class="xh">Explanation</div><div class="xa">وَاللَّامُ لِلتَّعْرِيفِ</div>'
        + '<div class="xt">Lām before a sun letter is not pronounced.</div></div>',
    });
    syncDots?.();
  }

  // The audio scene depends on the (async) audio manifest, so it's added when
  // audio.ts signals it's ready — before the tour is built or replayed.
  let audioSceneAdded = false;
  function maybeAddAudioScene(): void {
    if (audioSceneAdded || !window.AslAudio?.available) return;
    audioSceneAdded = true;
    putBefore('Memorize', {
      title: 'Listen & repeat',
      text: '▶ plays on through the abyāt. 🎧 loops a range for ḥifẓ — speed, repeats, a gap to recite.',
      html: '<div class="a-tag">▶ Playing bayt 3</div><div class="a-line">وَعِتْرَتِهِ ثُمَّ الصَّحابَةِ</div><button class="sc-target a-play">' + PLAY_ICON + '</button>',
    });
    syncDots?.();
  }
  if (window.AslAudio?.available) maybeAddAudioScene();
  document.addEventListener('asl-audio-ready', maybeAddAudioScene);

  function startTour(): void {
    if (open) return;
    open = true;
    maybeAddWordScene();
    maybeAddExplScene();

    const ov = document.createElement('div');
    ov.className = 'tour-ov';
    ov.innerHTML =
      '<div class="tour-card" role="dialog" aria-label="How to use the app">'
      + '<div class="tour-stage"></div>'
      + '<div class="tour-cap"><h3></h3><p></p></div>'
      + '<div class="tour-foot"><button type="button" class="tour-skip">Skip</button>'
      + '<div class="tour-dots"></div>'
      + '<button type="button" class="tour-next">Next</button></div></div>';
    document.body.appendChild(ov);

    const stage = ov.querySelector<HTMLElement>('.tour-stage')!;
    const capH = ov.querySelector<HTMLElement>('.tour-cap h3')!;
    const capP = ov.querySelector<HTMLElement>('.tour-cap p')!;
    const dotsEl = ov.querySelector<HTMLElement>('.tour-dots')!;
    const nextBtn = ov.querySelector<HTMLElement>('.tour-next')!;
    const skipBtn = ov.querySelector<HTMLElement>('.tour-skip')!;
    let dots: Element[] = [];
    let idx = 0, cancelled = false, autoT: number | undefined;
    syncDots = () => {
      if (dots.length === scenes.length) return;
      dotsEl.innerHTML = scenes.map(() => '<i></i>').join('');
      dots = [...dotsEl.children];
      dots.forEach((d, i) => d.classList.toggle('on', i === idx));
    };

    const hand = document.createElement('div'); hand.className = 'tour-hand';
    const ripple = document.createElement('div'); ripple.className = 'tour-ripple';

    syncDots();
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    function close(): void {
      cancelled = true; clearTimeout(autoT);
      lsSet(KEY, '1');
      syncDots = null;
      ov.classList.remove('show');
      setTimeout(() => { ov.remove(); open = false; }, 300);
    }

    async function playCurrent(): Promise<void> {
      const myGen = idx;
      const scene = stage.querySelector<HTMLElement>('.scene');
      const target = scene?.querySelector<HTMLElement>('.sc-target');
      if (!scene || !target) return;
      const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
      if (reduce) { scene.classList.add('revealed'); return; }
      while (!cancelled && idx === myGen) {
        scene.classList.remove('revealed');
        const sr = stage.getBoundingClientRect();
        const tr = target.getBoundingClientRect();
        const tx = tr.left - sr.left + tr.width / 2;
        const ty = tr.top - sr.top + tr.height / 2;
        hand.style.transition = 'none'; hand.style.opacity = '0';
        hand.style.left = (tx + 20) + 'px'; hand.style.top = (ty + 52) + 'px';
        void hand.offsetWidth;
        hand.style.transition = 'left .7s ease, top .7s ease, opacity .3s ease, transform .15s';
        hand.style.opacity = '1'; hand.style.left = tx + 'px'; hand.style.top = ty + 'px';
        await sleep(760); if (cancelled || idx !== myGen) break;
        ripple.style.left = tx + 'px'; ripple.style.top = ty + 'px';
        ripple.classList.remove('go'); void ripple.offsetWidth; ripple.classList.add('go');
        hand.classList.add('press');
        await sleep(170); hand.classList.remove('press');
        scene.classList.add('revealed');
        await sleep(1900); if (cancelled || idx !== myGen) break;
        hand.style.opacity = '0';
        await sleep(650);
      }
    }

    function render(): void {
      clearTimeout(autoT);
      const s = scenes[idx];
      if (!s) return;
      stage.innerHTML = '<div class="scene">' + s.html + '</div>';
      stage.appendChild(hand); stage.appendChild(ripple);
      capH.textContent = s.title; capP.textContent = s.text;
      dots.forEach((d, i) => d.classList.toggle('on', i === idx));
      nextBtn.textContent = idx === scenes.length - 1 ? 'Got it' : 'Next';
      void playCurrent();
      autoT = window.setTimeout(advance, 4600); // captions are one line now
    }
    function advance(): void {
      if (idx < scenes.length - 1) { idx++; render(); }
      else close();
    }

    nextBtn.addEventListener('click', advance);
    skipBtn.addEventListener('click', close);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });

    requestAnimationFrame(() => { ov.classList.add('show'); render(); });
  }

  // ⋯ More menu: PDF downloads, replay the walkthrough, the written user
  // guide, the edition picker and Appearance.
  function openHelpMenu(anchor: HTMLElement): void {
    const ex = document.querySelector('.help-menu');
    if (ex) { ex.remove(); return; }
    const m = document.createElement('div');
    m.className = 'help-menu';
    let html = '';
    const links = [...document.querySelectorAll<HTMLAnchorElement>('#pdfDrop a')];
    if (links.length) {
      html += '<div class="hm-head">Download PDF</div>';
      for (const a of links) {
        html += '<a class="hm-pdf" href="' + esc(a.getAttribute('href')) + '" download>⤓ ' + esc(a.textContent) + '</a>';
      }
      html += '<div class="hm-div"></div>';
    }
    html += '<button type="button" class="hm-tour">▶ Show me around</button>'
      + '<a class="hm-guide" href="/guide">📖 User guide</a>';
    // Nuskha (edition) picker — a matn registered with more than one nuskha
    // exports window.AslNuskha ({names, active, set}) from the renderer; one
    // button per nuskha, so a future Nuskh 3 appears here automatically.
    const nk = window.AslNuskha;
    const nkOn = !!(nk && nk.names && nk.names.length > 1);
    if (nk && nkOn) {
      html += '<div class="hm-div"></div><div class="hm-head">Nuskha (edition)</div>'
        + '<div class="hm-nuskha" role="group" aria-label="Nuskha">'
        + nk.names.map((nm, i) => '<button type="button" data-nk="' + (i + 1) + '">' + esc(nm) + '</button>').join('')
        + '</div>';
    }
    html += '<div class="hm-div"></div><div class="hm-head">Appearance</div>'
      + '<div class="hm-theme" role="group" aria-label="Appearance">'
      + '<button type="button" data-th="auto">Auto</button>'
      + '<button type="button" data-th="light">Light</button>'
      + '<button type="button" data-th="dark">Dark</button></div>';
    m.innerHTML = html;
    document.body.appendChild(m);
    if (nk && nkOn) {
      m.querySelectorAll<HTMLElement>('.hm-nuskha button').forEach((b) => {
        if (Number(b.dataset.nk) === nk.active) b.classList.add('on');
        b.addEventListener('click', (e) => { e.stopPropagation(); nk.set(Number(b.dataset.nk)); });
      });
    }
    const curTh = window.AppTheme?.mode() || 'auto';
    const themeBtns = [...m.querySelectorAll<HTMLElement>('.hm-theme button')];
    for (const b of themeBtns) {
      if (b.dataset.th === curTh) b.classList.add('on');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const th = b.dataset.th;
        if (th === 'auto' || th === 'light' || th === 'dark') window.AppTheme?.set(th);
        themeBtns.forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
      });
    }
    const r = anchor.getBoundingClientRect();
    const w = m.offsetWidth;
    m.style.top = (r.bottom + 8) + 'px';
    m.style.left = Math.round(Math.min(Math.max(8, r.right - w), window.innerWidth - 8 - w)) + 'px';
    function shut(): void { m.remove(); document.removeEventListener('click', onDoc, true); }
    function onDoc(ev: Event): void { if (!m.contains(ev.target as Node) && ev.target !== anchor) shut(); }
    m.querySelector('.hm-tour')!.addEventListener('click', () => { shut(); startTour(); });
    setTimeout(() => document.addEventListener('click', onDoc, true), 0);
  }

  // "⋯ More" button in the top bar — PDF download, user guide, replay tour.
  const navInner = document.querySelector('.navbar-inner');
  if (navInner) {
    const help = document.createElement('button');
    help.type = 'button'; help.className = 'helpbtn';
    help.title = 'More'; help.setAttribute('aria-label', 'More options');
    help.innerHTML = HELP;
    help.addEventListener('click', (e) => { e.stopPropagation(); openHelpMenu(help); });
    const navMenus = navInner.querySelector('.nav-menus');
    const viewMenu = document.getElementById('viewMenu');
    if (navMenus) navInner.insertBefore(help, navMenus);
    else if (viewMenu) navInner.insertBefore(help, viewMenu); else navInner.appendChild(help);
    // PDF downloads now live inside the More menu — hide the standalone PDF menu
    const pdfMenu = document.getElementById('pdfMenu');
    if (pdfMenu) pdfMenu.style.display = 'none';
  }

  // Auto-play once per device on first visit — or right away if this page
  // was opened via "Show me around" (Home's More menu, in the app), which
  // links here with ?tour=1. Strip the flag from the URL immediately so a
  // later refresh of this same page doesn't replay it.
  const forced = /[?&]tour=1(&|$)/.test(location.search);
  if (forced) {
    try {
      const qs = location.search.replace(/([?&])tour=1(&|$)/, '$1').replace(/[?&]$/, '');
      history.replaceState(null, '', location.pathname + qs + location.hash);
    } catch { /* ignore */ }
  }
  const seen = !!lsGet(KEY);
  if (forced || !seen) {
    let launched = false;
    const go = () => { if (launched) return; launched = true; startTour(); };
    document.addEventListener('asl-audio-ready', () => { maybeAddAudioScene(); go(); });
    setTimeout(go, 800);
  }
}
