/* A written lecture's page: the common scripts and its language switch. */
import * as theme from '../theme.ts';
import * as storageGuard from '../storage-guard.ts';
import * as lesson from '../lesson.ts';
import '../sw-register.ts';

theme.init();
storageGuard.init();
lesson.init();
