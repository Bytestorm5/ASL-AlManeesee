/* First-run animated walkthrough for the reading pages.
   A moving fingertip demonstrates the key gestures (tap a word for its meaning,
   open the Translation menu, bookmark a verse, search) so new users discover
   them. Runs automatically once per device, and can be replayed anytime from
   the ⋯ More button in the top bar. Skip / Next / Got it.

   The ⋯ More menu itself lives here too: the PDF downloads (when the matn has
   them), "Show me around", the User Guide, the edition (nuskha) picker on a
   matn with more than one, and Appearance (Auto / Light / Dark). */
import { currentPoem, esc, listedPoems, lsGet, lsSet } from '../page.ts';
import type { PoemConfig, WordCell } from '../../poems/types.ts';
import { sectionOf } from '../../poems/index.ts';
import { BTN as EXP_BTN } from './explanation.ts';
import { current as currentSwitches } from './content-switches.ts';

const KEY = 'asl-tour';

const RIBBON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4z"/></svg>';
const MAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';
const CAP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 2 9l10 5 10-5-10-5z"/><path d="M5 11.2V16c0 1.6 3.1 3 7 3s7-1.4 7-3v-4.8"/></svg>';
const HELP = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
const LIST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>';
const PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>';
/* the explanation button's own book icon, so the scene shows the real button */
const BOOK = (EXP_BTN.match(/<svg[\s\S]*<\/svg>/) || [''])[0];

const CSS = [
  '.helpbtn{cursor:pointer;display:inline-grid;place-items:center;width:34px;height:34px;padding:0;',
  'border-radius:50%;border:1px solid var(--paper-edge,#CBDDEA);background:var(--surface,#fff);color:var(--madder,#0F63A8);',
  'flex:0 0 auto;transition:background .15s,border-color .15s;-webkit-tap-highlight-color:transparent}',
  '.helpbtn:hover{border-color:var(--gilt,#56A6DD);background:var(--paper,#EDF5FB)}',
  '.helpbtn svg{width:18px;height:18px}',
  '.help-menu{position:fixed;z-index:410;background:var(--surface,#fff);border:1px solid var(--paper-edge,#CBDDEA);border-radius:12px;box-shadow:0 14px 34px rgba(14,38,56,.18);padding:5px;min-width:196px;font-family:"Montserrat",sans-serif}',
  '.help-menu button,.help-menu a{display:flex;align-items:center;gap:9px;width:100%;box-sizing:border-box;text-align:left;text-decoration:none;border:0;background:transparent;cursor:pointer;color:var(--ink-soft,#33586F);font-family:inherit;font-size:.82rem;font-weight:600;padding:10px 12px;border-radius:8px}',
  '.help-menu button:hover,.help-menu a:hover{background:var(--paper,#EDF5FB);color:var(--madder,#0F63A8)}',
  '.help-menu .hm-head{padding:8px 12px 3px;font-size:.62rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--sage,#456E80)}',
  '.help-menu .hm-div{height:1px;background:var(--paper-edge,#CBDDEA);margin:5px 4px}',
  '.help-menu .hm-theme{display:flex;gap:5px;padding:2px 8px 6px}',
  '.help-menu .hm-theme button{flex:1;width:auto;justify-content:center;padding:7px 4px;border:1px solid var(--paper-edge,#CBDDEA);border-radius:8px;font-size:.72rem;font-weight:700;color:var(--ink-soft,#33586F);background:var(--surface,#fff)}',
  '.help-menu .hm-theme button.on{background:var(--madder,#0F63A8);color:var(--on-accent);border-color:var(--madder,#0F63A8)}',
  /* Nuskha (edition) picker — shown only on pages exporting window.AslNuskha */
  '.help-menu .hm-nuskha{display:flex;flex-wrap:wrap;gap:5px;padding:2px 8px 6px}',
  '.help-menu .hm-nuskha button{flex:1 1 40%;width:auto;justify-content:center;padding:7px 4px;border:1px solid var(--paper-edge,#CBDDEA);border-radius:8px;font-size:.72rem;font-weight:700;color:var(--ink-soft,#33586F);background:var(--surface,#fff)}',
  '.help-menu .hm-nuskha button.on{background:var(--madder,#0F63A8);color:var(--on-accent);border-color:var(--madder,#0F63A8)}',
  '.tour-ov{position:fixed;inset:0;z-index:400;background:rgba(6,32,58,.55);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .25s}',
  '.tour-ov.show{opacity:1}',
  '.tour-card{width:100%;max-width:360px;background:var(--paper,#F4F9FD);border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.45);overflow:hidden;font-family:"Montserrat",sans-serif}',
  '.tour-stage{position:relative;height:190px;background:linear-gradient(180deg,#fff,var(--surface));border-bottom:1px solid var(--paper-edge,#CBDDEA);overflow:hidden}',
  '.scene{position:absolute;inset:0}',
  '.tour-hand{position:absolute;width:30px;height:30px;margin:-6px 0 0 -6px;border-radius:50%;background:rgba(11,61,110,.32);border:2.5px solid var(--lapis);box-shadow:0 3px 8px rgba(0,0,0,.3);opacity:0;z-index:6;pointer-events:none;transition:transform .15s}',
  '.tour-hand.press{transform:scale(.78)}',
  '.tour-ripple{position:absolute;width:38px;height:38px;border-radius:50%;border:2px solid var(--madder,#0F63A8);opacity:0;z-index:5;pointer-events:none;transform:translate(-50%,-50%) scale(.4)}',
  '.tour-ripple.go{animation:tourRip .6s ease-out}',
  '@keyframes tourRip{0%{opacity:.85;transform:translate(-50%,-50%) scale(.4)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.7)}}',
  /* scene 1: word meaning */
  '.m-verse{position:absolute;left:0;right:0;top:86px;text-align:center;font-family:"Scheherazade New","Amiri",serif;font-size:1.75rem;color:var(--ink,#0B3D6E);direction:rtl}',
  '.m-word{border-radius:6px;padding:1px 5px;transition:background .25s}',
  '.scene.revealed .m-word{background:var(--cream)}',
  '.m-tip{position:absolute;left:50%;top:40px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;background:var(--lapis);color:var(--cream);font-size:.82rem;font-weight:600;padding:6px 12px;border-radius:9px;white-space:nowrap}',
  '.m-tip::after{content:"";position:absolute;top:100%;left:50%;transform:translateX(-50%);border:6px solid transparent;border-top-color:var(--lapis)}',
  '.scene.revealed .m-tip{opacity:1;transform:translateX(-50%)}',
  /* scene 2: translation */
  '.m-pill{position:absolute;left:50%;top:52px;transform:translateX(-50%);border:1px solid var(--paper-edge,#CBDDEA);background:var(--surface,#fff);color:var(--gilt-deep,#1A6F83);font-weight:700;font-size:.82rem;border-radius:22px;padding:8px 15px}',
  '.m-drop{position:absolute;left:50%;top:96px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;background:var(--surface,#fff);border:1px solid var(--paper-edge,#CBDDEA);border-radius:12px;box-shadow:0 12px 26px rgba(14,38,56,.18);padding:5px;min-width:150px}',
  '.scene.revealed .m-drop{opacity:1;transform:translateX(-50%)}',
  '.m-opt{display:block;text-align:left;font-size:.8rem;font-weight:600;color:var(--ink-soft,#33586F);padding:8px 12px;border-radius:8px}',
  '.m-opt.on{background:var(--madder,#0F63A8);color:var(--on-accent)}',
  /* scene 3: bookmark */
  '.m-row{position:absolute;left:0;right:0;top:78px;display:flex;align-items:center;justify-content:center;gap:12px}',
  '.m-line{font-family:"Scheherazade New","Amiri",serif;font-size:1.35rem;color:var(--ink,#0B3D6E);direction:rtl}',
  '.m-ribbon{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;border:1px solid var(--paper-edge,#CBDDEA);background:var(--surface,#fff);color:var(--madder,#0F63A8)}',
  '.m-ribbon svg{width:15px;height:15px}',
  '.scene.revealed .m-ribbon{background:var(--madder,#0F63A8);color:var(--on-accent,#fff);border-color:var(--madder,#0F63A8)}',
  '.scene.revealed .m-ribbon svg{fill:currentColor}',
  '.m-saved{position:absolute;left:50%;top:38px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;background:var(--ok-text);color:#fff;font-size:.76rem;font-weight:700;padding:5px 12px;border-radius:9px}',
  '.scene.revealed .m-saved{opacity:1;transform:translateX(-50%)}',
  /* scene 4: search */
  '.m-mag{position:absolute;left:50%;top:60px;transform:translateX(-50%);display:inline-grid;place-items:center;width:36px;height:36px;border-radius:50%;border:1px solid var(--paper-edge,#CBDDEA);background:var(--surface,#fff);color:var(--madder,#0F63A8)}',
  '.m-mag svg{width:18px;height:18px}',
  '.m-field{position:absolute;left:50%;top:104px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;min-width:180px;text-align:center;border:1px solid var(--paper-edge,#CBDDEA);background:var(--surface,#fff);border-radius:22px;padding:9px 16px;font-family:"Scheherazade New","Amiri",serif;font-size:1.15rem;color:var(--ink,#0B3D6E);direction:rtl}',
  '.scene.revealed .m-field{opacity:1;transform:translateX(-50%)}',
  /* scene: jump to chapter */
  '.j-btn{position:absolute;left:50%;top:42px;transform:translateX(-50%);display:inline-flex;align-items:center;gap:6px;border:1px solid var(--paper-edge,#CBDDEA);background:var(--surface,#fff);color:var(--madder,#0F63A8);border-radius:20px;padding:6px 12px;font-family:"Montserrat",sans-serif;font-weight:700;font-size:.78rem}',
  '.j-btn svg{width:15px;height:15px}',
  /* the stage clips at 190px: this list has to start high and its rows must
     not wrap, or the last chapter is cut off the bottom. The rows are the
     matn's own chapters, so a long name is cut short rather than let the list
     outgrow the 360px card. */
  '.j-list{position:absolute;left:50%;top:78px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;background:var(--surface,#fff);border:1px solid var(--paper-edge,#CBDDEA);border-radius:11px;box-shadow:0 12px 26px rgba(14,38,56,.18);padding:5px;min-width:214px;max-width:290px}',
  '.scene.revealed .j-list{opacity:1;transform:translateX(-50%)}',
  '.j-it{display:flex;align-items:center;gap:9px;padding:5px 10px;border-radius:8px;font-family:"Montserrat",sans-serif;font-size:.74rem;font-weight:600;color:var(--ink-soft,#33586F);white-space:nowrap}',
  '.j-it .jn{flex:0 0 auto;min-width:19px;height:19px;border-radius:50%;background:var(--paper-2,#E6F0F8);color:var(--madder,#0F63A8);display:grid;place-items:center;font-size:.66rem;font-weight:700}',
  '.j-it .jt{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}',
  '.j-it .jt.ar{font-family:"Scheherazade New","Amiri",serif;font-size:.98rem;font-weight:400;line-height:1.2;direction:rtl;text-align:right}',
  '.j-it.on{background:var(--madder,#0F63A8);color:var(--on-accent,#fff)}',
  '.j-it.on .jn{background:rgba(255,255,255,.9);color:var(--madder,#0F63A8)}',
  /* scene: listen & repeat (audio) */
  '.a-line{position:absolute;left:0;right:0;top:64px;text-align:center;font-family:"Scheherazade New","Amiri",serif;font-size:1.5rem;color:var(--ink,#0B3D6E);direction:rtl}',
  '.a-play{position:absolute;left:50%;top:120px;transform:translateX(-50%);display:inline-grid;place-items:center;width:46px;height:46px;border-radius:50%;border:1px solid var(--paper-edge,#CBDDEA);background:var(--surface,#fff);color:var(--madder,#0F63A8);transition:background .25s,color .25s,border-color .25s}',
  '.a-play svg{width:22px;height:22px}',
  '.scene.revealed .a-play{background:var(--madder,#0F63A8);color:var(--on-accent,#fff);border-color:var(--madder,#0F63A8)}',
  '.a-tag{position:absolute;left:50%;top:34px;transform:translateX(-50%) translateY(6px);opacity:0;transition:opacity .25s,transform .25s;background:var(--lapis);color:var(--cream);font-size:.72rem;font-weight:700;padding:4px 10px;border-radius:8px;white-space:nowrap}',
  '.scene.revealed .a-tag{opacity:1;transform:translateX(-50%)}',
  /* scene 5: memorize */
  '.h-hat{position:absolute;left:50%;top:44px;transform:translateX(-50%);display:inline-grid;place-items:center;width:48px;height:48px;border-radius:50%;background:var(--surface,#fff);border:1px solid var(--paper-edge,#CBDDEA);color:var(--madder,#0F63A8);transition:background .25s,color .25s,border-color .25s}',
  '.h-hat svg{width:26px;height:26px}',
  '.scene.revealed .h-hat{background:var(--madder,#0F63A8);color:var(--on-accent);border-color:var(--madder,#0F63A8)}',
  '.h-tag{position:absolute;left:50%;top:2px;transform:translateX(-50%) translateY(6px);opacity:0;transition:opacity .25s,transform .25s;background:var(--lapis);color:var(--cream);font-size:.72rem;font-weight:700;padding:4px 10px;border-radius:8px;white-space:nowrap}',
  '.scene.revealed .h-tag{opacity:1;transform:translateX(-50%)}',
  '.h-line{position:absolute;left:0;right:0;top:118px;text-align:center;font-family:"Scheherazade New","Amiri",serif;font-size:1.55rem;color:var(--ink,#0B3D6E);direction:rtl}',
  '.h-w{border-radius:5px;padding:1px 5px;transition:color .3s,background .3s,box-shadow .3s}',
  '.scene.revealed .h-w{color:transparent;background:var(--paper-2);box-shadow:inset 0 -2px 0 rgba(180,205,222,.95)}',
  /* scene 5b: hide less / more (level dial) */
  '.l-dial{position:absolute;left:50%;top:50px;transform:translateX(-50%);display:flex;align-items:center;gap:6px}',
  '.l-dial .l-cap{font-family:"Montserrat",sans-serif;font-size:.6rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--sage,#456E80)}',
  '.l-b{display:grid;place-items:center;min-width:26px;height:26px;border:1px solid var(--paper-edge,#CBDDEA);border-radius:7px;font-family:"Montserrat",sans-serif;font-weight:700;font-size:.82rem;color:var(--ink-soft,#33586F);background:var(--surface,#fff);transition:background .25s,color .25s,border-color .25s}',
  '.scene.revealed .l-b.sc-target{background:var(--madder,#0F63A8);color:var(--on-accent);border-color:var(--madder,#0F63A8)}',
  '.l-line{position:absolute;left:0;right:0;top:120px;text-align:center;font-family:"Scheherazade New","Amiri",serif;font-size:1.5rem;color:var(--ink,#0B3D6E);direction:rtl}',
  '.l-w{border-radius:5px;padding:1px 5px;transition:color .3s,background .3s}',
  '.l-w.last{color:transparent;background:var(--paper-2)}',
  '.scene.revealed .l-w{color:transparent;background:var(--paper-2);box-shadow:inset 0 -2px 0 rgba(180,205,222,.95)}',
  /* scene 6: progress / rating */
  '.p-med{position:absolute;left:50%;top:62px;transform:translateX(-50%);width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:var(--surface,#fff);border:1px solid var(--paper-edge,#CBDDEA);font-family:"Cormorant Garamond",serif;font-weight:700;color:var(--madder,#0F63A8);font-size:1.15rem;transition:box-shadow .3s}',
  '.scene.revealed .p-med{box-shadow:0 0 0 2px var(--gilt),0 0 0 4px rgba(86,166,221,.26)}',
  '.p-rate{position:absolute;left:50%;top:118px;transform:translateX(-50%);display:flex;gap:9px}',
  '.p-rate span{border-radius:20px;padding:6px 14px;font-size:.78rem;font-weight:700;background:var(--surface,#fff)}',
  '.p-got{border:1px solid var(--paper-edge);color:var(--gilt-deep);transition:background .25s,color .25s}',
  '.scene.revealed .p-got{background:var(--gilt);color:var(--on-gilt,#072B4F);border-color:var(--gilt)}',
  '.p-rev{border:1px solid var(--paper-edge,#CBDDEA);color:var(--ink-soft,#33586F)}',
  '.p-badge{position:absolute;left:50%;top:34px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;background:var(--gilt);color:var(--on-gilt,#072B4F);font-size:.76rem;font-weight:700;padding:5px 12px;border-radius:9px}',
  '.scene.revealed .p-badge{opacity:1;transform:translateX(-50%)}',
  /* scene 7: spaced-repetition review */
  '.r-cap{position:absolute;left:50%;top:60px;transform:translateX(-50%);display:inline-grid;place-items:center;width:54px;height:54px;border-radius:50%;background:var(--madder,#0F63A8);color:var(--on-accent)}',
  '.r-cap svg{width:29px;height:29px}',
  '.r-badge{position:absolute;top:-4px;right:-4px;min-width:21px;height:21px;padding:0 4px;border-radius:11px;background:#a23b3b;color:#fff;font-family:"Montserrat",sans-serif;font-size:.72rem;font-weight:700;display:grid;place-items:center;box-shadow:0 0 0 2px #fff;transition:transform .2s}',
  '.scene.revealed .r-badge{transform:scale(1.15)}',
  '.r-note{position:absolute;left:50%;top:130px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;background:#a23b3b;color:#fff;font-size:.8rem;font-weight:700;padding:6px 13px;border-radius:9px}',
  '.scene.revealed .r-note{opacity:1;transform:translateX(-50%)}',
  /* scene 8: export / import progress */
  '.e-row{position:absolute;left:50%;top:92px;transform:translateX(-50%);display:flex;gap:10px}',
  '.e-row span{border:1px solid var(--paper-edge,#CBDDEA);border-radius:10px;padding:9px 18px;font-family:"Montserrat",sans-serif;font-size:.8rem;font-weight:700;background:var(--surface,#fff);color:var(--ink,#0B3D6E)}',
  '.e-exp{transition:background .25s,color .25s,border-color .25s}',
  '.scene.revealed .e-exp{background:var(--madder,#0F63A8);color:var(--on-accent);border-color:var(--madder,#0F63A8)}',
  '.e-badge{position:absolute;left:50%;top:44px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;background:var(--ok-text);color:#fff;font-size:.76rem;font-weight:700;padding:5px 12px;border-radius:9px}',
  '.scene.revealed .e-badge{opacity:1;transform:translateX(-50%)}',
  /* scene: switch matn */
  '.s-pill{position:absolute;left:50%;top:18px;transform:translateX(-50%);border:1px solid var(--paper-edge,#CBDDEA);background:var(--surface,#fff);color:var(--gilt-deep,#1A6F83);font-weight:700;font-size:.82rem;border-radius:22px;padding:8px 15px}',
  /* at most six mutūn, so the list is tight and starts high — the stage
     clips at 190px and looser spacing pushes the last ones off it */
  '.s-list{position:absolute;left:50%;top:56px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;background:var(--surface,#fff);border:1px solid var(--paper-edge,#CBDDEA);border-radius:12px;box-shadow:0 12px 26px rgba(14,38,56,.18);padding:5px;min-width:172px}',
  '.s-list span{display:block;padding:0 10px;border-radius:7px;color:var(--ink-soft,#33586F);text-align:right;font-family:"Scheherazade New","Amiri",serif;font-size:.86rem;line-height:1.26}',
  '.s-list span.on{background:var(--paper,#EDF5FB);color:var(--madder,#0F63A8);font-weight:700}',
  '.scene.revealed .s-list{opacity:1;transform:translateX(-50%)}',
  /* scene: notes */
  '.n-row{position:absolute;left:50%;top:56px;transform:translateX(-50%);display:flex;align-items:center;gap:9px}',
  '.n-pen{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;border:1px solid var(--paper-edge,#CBDDEA);background:var(--surface,#fff);color:var(--madder,#0F63A8)}',
  '.n-pen svg{width:15px;height:15px}',
  '.n-line{font-family:"Scheherazade New","Amiri",serif;font-size:1.4rem;color:var(--ink,#0B3D6E);direction:rtl}',
  '.n-box{position:absolute;left:50%;top:106px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;background:var(--surface);border:1px solid var(--gilt,#56A6DD);border-radius:10px;padding:8px 13px;font-size:.78rem;color:var(--ink-soft,#33586F);max-width:250px;text-align:center}',
  '.scene.revealed .n-box{opacity:1;transform:translateX(-50%)}',
  /* scene: explanation / qiraat card */
  '.x-btn{position:absolute;left:50%;top:26px;transform:translateX(-50%);display:inline-grid;place-items:center;width:32px;height:32px;border-radius:50%;border:1px solid var(--paper-edge,#CBDDEA);background:var(--surface,#fff);color:var(--madder,#0F63A8);font-size:1rem}',
  '.x-card{position:absolute;left:50%;top:68px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;background:var(--surface,#fff);border:1px solid var(--paper-edge,#CBDDEA);border-radius:12px;box-shadow:0 12px 26px rgba(14,38,56,.16);padding:8px 12px;min-width:238px}',
  '.x-card .xh{font-size:.6rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--sage,#456E80);margin-bottom:3px}',
  '.x-card .xa{font-family:"Scheherazade New","Amiri",serif;font-size:1.15rem;direction:rtl;color:var(--ink,#0B3D6E)}',
  '.x-card .xt{font-size:.72rem;line-height:1.4;color:var(--ink-soft,#33586F);margin-top:3px}',
  '.x-card{max-width:292px}',
  /* centred with left:50%, these rows would otherwise shrink to half the
     stage and wrap their buttons onto two or three lines */
  '.p-rate,.e-row,.t-row,.l-dial,.n-row{width:max-content}',
  '.p-rate span,.e-row span,.t-row span{white-space:nowrap}',
  /* a short list of mutūn has room to breathe; six stay tight to fit */
  '.s-list.roomy span{line-height:1.75}',
  '.x-btn svg{width:17px;height:17px}',
  '.scene.revealed .x-card{opacity:1;transform:translateX(-50%)}',
  /* scene: light or dark */
  '.t-row{position:absolute;left:50%;top:78px;transform:translateX(-50%);display:flex;gap:7px}',
  '.t-row span{border:1px solid var(--paper-edge,#CBDDEA);border-radius:9px;padding:8px 15px;font-family:"Montserrat",sans-serif;font-size:.76rem;font-weight:700;background:var(--surface,#fff);color:var(--ink-soft,#33586F);transition:background .3s,color .3s,border-color .3s}',
  '.scene.revealed .t-dark{background:#0B3D6E;color:var(--paper-2);border-color:#0B3D6E}',
  '.t-note{position:absolute;left:50%;top:130px;transform:translateX(-50%) translateY(8px);opacity:0;transition:opacity .25s,transform .25s;font-size:.74rem;color:var(--sage,#456E80)}',
  '.scene.revealed .t-note{opacity:1;transform:translateX(-50%)}',
  /* caption + footer */
  '.tour-cap{padding:16px 20px 2px;text-align:center}',
  '.tour-cap h3{font-family:"Cormorant Garamond",Georgia,serif;color:var(--madder,#0F63A8);font-size:1.32rem;margin:0 0 5px}',
  '.tour-cap p{color:var(--ink-soft,#33586F);font-size:.85rem;line-height:1.5;margin:0;min-height:38px}',
  '.tour-foot{display:flex;align-items:center;justify-content:space-between;padding:12px 16px 16px}',
  '.tour-dots{display:flex;gap:6px}',
  '.tour-dots i{width:7px;height:7px;border-radius:50%;background:var(--paper-edge,#CBDDEA);transition:background .2s}',
  '.tour-dots i.on{background:var(--madder,#0F63A8)}',
  '.tour-skip{background:none;border:0;color:var(--sage,#456E80);font-size:.78rem;font-weight:600;cursor:pointer;padding:8px}',
  '.tour-next{background:var(--madder,#0F63A8);color:var(--on-accent);border:0;border-radius:22px;padding:9px 20px;font-size:.8rem;font-weight:700;cursor:pointer}',
  '@media (prefers-reduced-motion:reduce){.tour-hand,.tour-ripple{display:none}.scene .m-tip,.scene .m-drop,.scene .m-saved,.scene .m-field,.scene .m-word{transition:none}}',
].join('');

interface Scene { title: string; text: string; html: string }

/* The switcher scene shows the mutūn of this matn's section (the Mutūn ▾
   menu lists the same), up to six (the stage's height), always including
   the one being read. */
function switchList(here: PoemConfig | null): string | null {
  const all: PoemConfig[] = [...listedPoems(here ? sectionOf(here) : undefined)];
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

/* The scenes show the matn being read: its own words, a word's own meaning
   and its own explanation, so they always match the page — and no matn's
   lines are written into the code. The basmala stands in only when the page
   has no abyāt to draw from. */
const FALLBACK = ['بِسْمِ', 'اللَّهِ', 'الرَّحْمَٰنِ', 'الرَّحِيمِ'];
const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;

/** Plain text of a piece of verse or note markup, parsed inertly. */
function plain(html: string): string {
  return (new DOMParser().parseFromString(html, 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim();
}

interface Hemi { words: string[]; cells: WordCell[] | null }
/** Every hemistich of the matn as words, in reading order. With word cells,
    words[i] is cells[i], so a gloss stays with its word. */
function hemistichs(): Hemi[] {
  const out: Hemi[] = [];
  for (const ch of window.ASL_POEM?.snapshot ?? []) {
    for (const v of ch.verses) {
      for (const [text, cells] of [[v.sadr, v.sadrW], [v.ajuz, v.ajuzW]] as const) {
        const c = cells?.length ? cells : null;
        const words = c ? c.map((x) => plain(x.w)) : plain(text || '').split(' ').filter(Boolean);
        if (words.some(Boolean)) out.push({ words, cells: c });
      }
    }
  }
  return out;
}

/** Up to n words from the start, short enough for the 360px stage. */
function clip(words: string[], n: number, max = 22): string[] {
  const out: string[] = [];
  for (const w of words.filter(Boolean)) {
    if (out.length >= n) break;
    if (out.length && [...out, w].join(' ').replace(TASHKEEL, '').length > max) break;
    out.push(w);
  }
  return out;
}

/** The first plain sentence of an explanation, skipping its headings. */
const EXP_FIT = 92; // characters the scene's card shows without cutting
function firstSentence(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const para = [...doc.querySelectorAll('p')].find((x) => !x.className && (x.textContent || '').trim().length > 20);
  const text = (para?.textContent || doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  return (text.match(/^.*?[.!?](?=\s|$)/) || [text])[0]!;
}
const cut = (t: string) => (t.length <= EXP_FIT ? t : t.slice(0, EXP_FIT - 4).replace(/\s+\S*$/, '') + '…');

interface Samples {
  /** a short run of words: the bookmark, note and audio scenes */
  line: string;
  /** three words; the first stays and the rest hide */
  memo: string[];
  /** up to four words for the hide-level dial */
  dial: string[];
  /** one word as a reader types it, without diacritics */
  search: string;
  word: { before: string; w: string; after: string; g: string } | null;
}

type ExpSample = { ar: string; text: string } | null;
/** An explanation a reader can open (its bayt switched on): the first whose
    opening sentence fits the card whole, looking a dozen in; failing that,
    the first one, cut short. */
function expSample(on: (n: number) => boolean): ExpSample {
  let exp: ExpSample = null;
  let seen = 0;
  for (const ch of window.ASL_POEM?.snapshot ?? []) {
    for (const v of ch.verses) {
      const e = v.exp;
      if (!e || !on(v.n)) continue;
      const text = firstSentence(typeof e === 'string' ? e : e.en || e.ar || e.ur || '');
      if (!text) continue;
      const cand = { ar: clip(plain(v.sadr || '').split(' '), 3, 20).join(' '), text: cut(text) };
      if (!exp) exp = cand;
      // a whole sentence that says something, not a lead-in to a list
      if (text.length <= EXP_FIT && text.length >= 30 && /[.!?]$/.test(text)) return cand;
      if (++seen >= 12) return exp;
    }
  }
  return exp;
}

function samples(): Samples {
  const hs = hemistichs();
  const pick = (min: number): string[] =>
    (hs.find((h) => h.words.filter(Boolean).length >= min) ?? hs[0])?.words ?? FALLBACK;

  // one word as a reader would type it: a definite noun if there is one
  // early on (الحمد), else the first word of a useful length
  const pool = hs.slice(0, 6).flatMap((h) => h.words.join(' ').split(' '))
    .map((w) => w.replace(TASHKEEL, '').replace(/[^\u0621-\u064A]/g, ''))
    .filter((w) => w.length >= 4 && w.length <= 8);
  const search = pool.find((w) => w.startsWith('ال')) || pool[0] || FALLBACK[1]!.replace(TASHKEEL, '');

  // a glossed word, preferably with a word before it to read it in context
  let word: Samples['word'] = null;
  find: for (const h of hs) {
    if (!h.cells) continue;
    for (let i = 0; i < h.cells.length; i++) {
      const g = plain(h.cells[i]!.g || '');
      const w = h.words[i] || '';
      if (!g || !w || g.length > 26) continue;
      let before = h.words[i - 1] || '', after = h.words[i + 1] || '';
      if ([before, w, after].join(' ').replace(TASHKEEL, '').length > 24) after = '';
      if ([before, w].join(' ').replace(TASHKEEL, '').length > 24) before = '';
      const cand = { before, w, after, g };
      if (!word) word = cand;
      if (i > 0) { word = cand; break find; }
    }
  }

  return { line: clip(pick(3), 3, 20).join(' '), memo: clip(pick(3), 3), dial: clip(pick(4), 4), search, word };
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
  const S = samples();
  /* A matn with no translation at all has no Translation menu to teach; the
     scene lists the languages its menu really offers. */
  const trLangs = [...document.querySelectorAll('#viewDrop button')]
    .map((b) => (b.textContent || '').replace('✓', '').trim()).filter(Boolean);
  if (trLangs.length && !document.getElementById('viewMenu')?.hidden) {
    scenes.push({ title: 'Choose a translation',
      text: trLangs.length === 1
        ? 'Translation ▾ shows the ' + trLangs[0] + ' under each bayt, or hides it. Arabic is always shown.'
        : 'Translation ▾ — ' + trLangs.join(' or ') + ', or both. Arabic is always shown.',
      html: '<button class="sc-target m-pill">Translation ▾</button><div class="m-drop">'
        + trLangs.map((l, i) => '<span class="m-opt' + (i === 0 ? ' on' : '') + '">' + (i === 0 ? '✓ ' : '') + esc(l) + '</span>').join('')
        + '</div>' });
  }
  scenes.push(
    { title: 'Bookmark a bayt',
      text: 'Tap the ribbon. Bookmarks lists every one you have saved.',
      html: '<div class="m-row"><button class="sc-target m-ribbon">' + RIBBON + '</button><span class="m-line">' + esc(S.line) + '</span></div><div class="m-saved">Saved</div>' },
    { title: 'Write a note',
      text: 'Tap the pen. Your note sits under the bayt; Notes lists them all.',
      html: '<div class="n-row"><button class="sc-target n-pen">' + PEN + '</button><span class="n-line">' + esc(S.line) + '</span></div><div class="n-box">My note: revise this bayt tomorrow</div>' },
    { title: 'Search',
      text: 'Any part of a bayt, in Arabic. No diacritics needed.',
      html: '<button class="sc-target m-mag">' + MAG + '</button><div class="m-field">' + esc(S.search) + '</div>' },
  );
  const mutun = switchList(here);
  if (mutun) {
    const roomy = (mutun.match(/<span/g) || []).length <= 4;
    scenes.push({ title: 'Move between the mutūn',
      text: 'Mutūn ▾ switches matn, and each remembers where you were.',
      html: '<button class="sc-target s-pill">Mutūn ▾</button><div class="s-list' + (roomy ? ' roomy' : '') + '">' + mutun + '</div>' });
  }
  scenes.push(
    { title: 'Memorize',
      text: 'The words hide. Recite from memory, then tap a blank to check.',
      html: '<span class="sc-target h-hat">' + CAP + '</span><div class="h-tag">Memorize mode</div><div class="h-line">'
        + S.memo.map((w, i) => (i === 0 ? esc(w) : '<span class="h-w">' + esc(w) + '</span>')).join(' ') + '</div>' },
    { title: 'Hide less or more',
      text: '1 hides the last word · 4 hides the whole bayt. Raise it as abyāt stick.',
      html: '<div class="l-dial"><span class="l-cap">less</span><span class="l-b">1</span><span class="l-b">2</span><span class="l-b">3</span><span class="sc-target l-b">4</span><span class="l-cap">more</span></div><div class="l-line">'
        + S.dial.map((w, i, a) => '<span class="l-w' + (i === a.length - 1 ? ' last' : '') + '">' + esc(w) + '</span>').join(' ') + '</div>' },
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
    if (wordSceneAdded || !hasWordGlosses() || !S.word) return;
    wordSceneAdded = true;
    const wd = S.word;
    scenes.unshift({ title: 'Tap a word',
      text: 'Any highlighted word gives its meaning.',
      html: '<div class="m-verse">' + [esc(wd.before), '<span class="sc-target m-word">' + esc(wd.w) + '</span>', esc(wd.after)].filter(Boolean).join(' ')
        + '</div><div class="m-tip">' + esc(wd.g) + '</div>' });
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

  // Only the mutūn that carry explanations or Qurʾānic examples.
  /* qiraat.ts and the explanation cards draw only for bayts as they come into
     view, so the DOM is no guide while this runs; the matn's registration and
     its data are. Decide when the tour actually opens. */
  let explSceneAdded = false;
  function maybeAddExplScene(): void {
    if (explSceneAdded) return;
    const isQx = !!here?.qiraat;
    // the switches as the page shows them now: only an explanation the
    // reader can open is quoted
    const sw = here ? currentSwitches(here.id, here) : null;
    const ex = isQx ? null : expSample((n) => sw?.enabled[n] === true);
    if (!(isQx || ex)) return;
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
      text: 'The book button under a bayt opens its explanation.',
      html: '<button class="sc-target x-btn">' + BOOK + '</button>'
        + '<div class="x-card"><div class="xh">Explanation</div><div class="xa">' + esc(ex!.ar) + '</div>'
        + '<div class="xt">' + esc(ex!.text) + '</div></div>',
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
      html: '<div class="a-tag">▶ Playing bayt 3</div><div class="a-line">' + esc(S.line) + '</div><button class="sc-target a-play">' + PLAY_ICON + '</button>',
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
