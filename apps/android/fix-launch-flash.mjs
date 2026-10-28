#!/usr/bin/env node
// Stop the black flash when the Android app opens.
//
// The generated TWA gives the whole application this theme:
//
//     android:theme="@android:style/Theme.Translucent.NoTitleBar"
//
// and LauncherActivity declares no theme of its own, so it inherits it. A
// translucent window paints nothing, so in the moment between Android's splash
// being dismissed and Chrome drawing the page, what shows through is black.
// iPhone never shows this: apps/ios/App/Info.plist gives the app a UILaunchScreen
// of LaunchBackground — #F9F4EA, the same cream as the manifest's
// background_color — which covers the whole wait however long it runs.
//
// This gives LauncherActivity a theme of its own with that same cream as an
// opaque window background, and on Android 12+ as the system splash background
// too, so the chain is one colour end to end: system splash → launcher → the
// page's own splash. The rest of the app keeps the translucent theme, which the
// helper activities (FocusActivity, ManageDataLauncherActivity) rely on.
//
// The colour is not hard-coded here: @color/backgroundColor is emitted by the
// generated app/build.gradle from backgroundColor in apps/android/twa-manifest.json,
// so it follows that file.
//
// The Android Gradle project is generated at build time and is not committed to
// this repo, so this has to be re-applied whenever the project is regenerated.
// It is safe to re-run (idempotent).
//
//   Usage:  node apps/android/fix-launch-flash.mjs [projectRoot]
//           projectRoot defaults to the current directory.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] || process.cwd());
const manifestPath = join(root, 'app', 'src', 'main', 'AndroidManifest.xml');
const resDir = join(root, 'app', 'src', 'main', 'res');
const STYLE = 'Theme.AlAslLauncher';
const changes = [];

function fail(msg) {
  console.error('✗ ' + msg + '\n');
  console.error('Apply it manually instead:');
  console.error('  1. app/src/main/res/values/styles.xml — add');
  console.error(`       <style name="${STYLE}" parent="@android:style/Theme.Material.Light.NoActionBar">`);
  console.error('         <item name="android:windowBackground">@color/backgroundColor</item>');
  console.error('       </style>');
  console.error('  2. the same in res/values-v31/styles.xml, plus');
  console.error('         <item name="android:windowSplashScreenBackground">@color/backgroundColor</item>');
  console.error('  3. AndroidManifest.xml — on <activity android:name="LauncherActivity" …> add');
  console.error(`         android:theme="@style/${STYLE}"`);
  process.exit(1);
}

/* Material.Light rather than AppCompat: the generated project's dependencies
   are assembled from the build config and AppCompat is not guaranteed to be
   among them, while the platform themes always are. minSdkVersion is 21, and
   Theme.Material arrived in 21. */
const base = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<!-- Written by android/fix-launch-flash.mjs. The launcher window is opaque and',
  '     the app\'s cream, so no part of the launch shows through as black. -->',
  '<resources>',
  `    <style name="${STYLE}" parent="@android:style/Theme.Material.Light.NoActionBar">`,
  '        <item name="android:windowBackground">@color/backgroundColor</item>',
  '    </style>',
  '</resources>',
  '',
].join('\n');

/* Android 12 draws its own splash screen from the launched activity's theme,
   and without this it uses the platform default — the white behind the icon
   before the cream arrives. */
const v31 = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<!-- Written by android/fix-launch-flash.mjs. Android 12+ draws the system',
  '     splash from this theme, so it gets the same cream as everything after it. -->',
  '<resources>',
  `    <style name="${STYLE}" parent="@android:style/Theme.Material.Light.NoActionBar">`,
  '        <item name="android:windowBackground">@color/backgroundColor</item>',
  '        <item name="android:windowSplashScreenBackground">@color/backgroundColor</item>',
  '    </style>',
  '</resources>',
  '',
].join('\n');

if (!existsSync(manifestPath)) {
  fail(`No app/src/main/AndroidManifest.xml under ${root}. Pass the generated project root as the argument.`);
}

// --- the two style files ---
for (const [dir, body, label] of [['values', base, 'values'], ['values-v31', v31, 'values-v31']]) {
  const path = join(resDir, dir, 'styles.xml');
  if (existsSync(path)) {
    const cur = readFileSync(path, 'utf8');
    if (cur.includes(`name="${STYLE}"`)) continue;          // already ours
    if (!cur.includes('</resources>')) fail(`res/${dir}/styles.xml exists but has no </resources> to add to.`);
    const style = body.slice(body.indexOf('    <style'), body.indexOf('</resources>'));
    writeFileSync(path, cur.replace('</resources>', style + '</resources>'));
    changes.push(`res/${label}/styles.xml: ${STYLE} added to the existing file`);
  } else {
    mkdirSync(join(resDir, dir), { recursive: true });
    writeFileSync(path, body);
    changes.push(`res/${label}/styles.xml: written`);
  }
}

// --- point LauncherActivity at it ---
let xml = readFileSync(manifestPath, 'utf8');
const tag = /<activity\b[^>]*android:name="\.?LauncherActivity"[^>]*>/.exec(xml);
if (!tag) fail('Could not find the LauncherActivity element in AndroidManifest.xml.');

if (/android:theme\s*=/.test(tag[0])) {
  if (!tag[0].includes(STYLE)) {
    console.warn(`! LauncherActivity already sets a theme, and it is not ${STYLE}:`);
    console.warn('  ' + /android:theme\s*=\s*"[^"]*"/.exec(tag[0])[0]);
    console.warn('  Left alone. Point it at the style above by hand if the flash is still there.');
  }
} else {
  const patched = tag[0].replace(/\s*>$/, `\n            android:theme="@style/${STYLE}">`);
  xml = xml.slice(0, tag.index) + patched + xml.slice(tag.index + tag[0].length);
  writeFileSync(manifestPath, xml);
  changes.push(`AndroidManifest.xml: LauncherActivity given android:theme="@style/${STYLE}"`);
}

// --- a last look, so a broken manifest is not handed to Gradle ---
const after = readFileSync(manifestPath, 'utf8');
const opens = (after.match(/<activity\b/g) || []).length;
const closes = (after.match(/<\/activity>/g) || []).length;
const selfClosed = (after.match(/<activity\b[^>]*\/>/g) || []).length;
if (opens !== closes + selfClosed) fail('The manifest no longer balances its <activity> elements — restore it and patch by hand.');
if ((after.match(new RegExp(`@style/${STYLE}`, 'g')) || []).length > 1) {
  fail(`${STYLE} is referenced more than once in the manifest — restore it and patch by hand.`);
}

if (changes.length) {
  console.log('✓ launch flash fixed on ' + root);
  for (const c of changes) console.log('  • ' + c);
  console.log('\nNext: rebuild the .aab, bump appVersionCode/appVersionName, upload a new release,');
  console.log('and check a cold start on a handset — this one can only be seen on a device.');
} else {
  console.log('✓ already applied on ' + root + ' — nothing to change.');
}
