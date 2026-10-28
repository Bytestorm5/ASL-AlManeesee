/* Pages that are neither home nor a matn (the guide, privacy): theme and the
   storage guard, and the service worker so they are kept for offline. */
import * as theme from '../theme.ts';
import * as storageGuard from '../storage-guard.ts';
import '../sw-register.ts';

theme.init();
storageGuard.init();
