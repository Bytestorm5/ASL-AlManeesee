/* The reading page's scripts, in the order they must run. The verses are
   already in window.ASL_CH (data.js is a blocking script ahead of this
   module), so the renderer goes first and every feature after it finds the
   page built — as the per-matn pages' deferred scripts used to. */
import { currentPoem } from '../page.ts';
import * as theme from '../theme.ts';
import { renderPoem } from '../reading/render.ts';
import * as explanation from '../reading/explanation.ts';
import * as storageGuard from '../storage-guard.ts';
import * as lastVisit from '../reading/last-visit.ts';
import * as search from '../reading/search.ts';
import * as bookmarks from '../reading/bookmarks.ts';
import * as notes from '../reading/notes.ts';
import * as memorize from '../reading/memorize.ts';
import * as onboarding from '../reading/onboarding.ts';
import * as readingUx from '../reading/reading-ux.ts';
import * as chapterNav from '../reading/chapter-nav.ts';
import * as audio from '../reading/audio.ts';
import * as hemiFit from '../reading/hemi-fit.ts';
import * as matnSwitch from '../reading/matn-switch.ts';
import * as offline from '../offline.ts';
import * as contentSwitches from '../reading/content-switches.ts';
import * as qiraat from '../reading/qiraat.ts';
import * as dataLoader from '../reading/data-loader.ts';
import * as appShell from '../app-shell.ts';
import '../sw-register.ts';

theme.init();
const poem = currentPoem();
if (poem) {
  renderPoem(poem);
  explanation.init();
  storageGuard.init();
  lastVisit.init();
  search.init();
  bookmarks.init();
  notes.init();
  memorize.init();
  onboarding.init();
  readingUx.init();
  chapterNav.init();
  audio.init();
  hemiFit.init();
  matnSwitch.init();
  offline.init();
  contentSwitches.init();
  qiraat.init();
  dataLoader.init();
}
appShell.init();
