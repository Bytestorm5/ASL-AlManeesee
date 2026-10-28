/* The home page's scripts. */
import * as theme from '../theme.ts';
import * as storageGuard from '../storage-guard.ts';
import * as home from '../home.ts';
import * as appShell from '../app-shell.ts';
import * as offline from '../offline.ts';
import '../sw-register.ts';

theme.init();
storageGuard.init();
home.init();
appShell.init();
offline.init();
