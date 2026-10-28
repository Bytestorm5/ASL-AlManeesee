#!/usr/bin/env node
// Enable R8 optimization on a generated TWA Android project (Bubblewrap / PWABuilder).
//
// The Android Gradle project is generated at build time and is not committed to
// this repo, so R8 has to be switched on in the generated project. This applies
// the change for you, and is safe to re-run (idempotent).
//
//   Usage:  node apps/android/enable-r8.mjs [projectRoot]
//           projectRoot defaults to the current directory.
//
// It sets, in the release build:  minifyEnabled true + shrinkResources true, points
// ProGuard at proguard-android-optimize.txt, writes android.enableR8.fullMode=true
// to gradle.properties, and installs the TWA-safe keep-rules from
// apps/android/proguard-rules.pro. Then rebuild the .aab and upload a new release.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.argv[2] || process.cwd());
const propsPath = join(root, 'gradle.properties');
const keepSrc = join(here, 'proguard-rules.pro');
const keepDst = join(root, 'app', 'proguard-rules.pro');
const MARK = '# === al-Asl TWA R8 keep-rules ===';
const changes = [];

function fail(msg) {
  console.error('✗ ' + msg + '\n');
  console.error('Apply it manually instead — in app/build.gradle, release build type:');
  console.error("    minifyEnabled true");
  console.error("    shrinkResources true");
  console.error("    proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'");
  console.error('and add to gradle.properties:');
  console.error('    android.enableR8.fullMode=true');
  process.exit(1);
}

// Return {open, close} indices of the { } block whose header matches headerRe,
// searching from fromIdx. Brace-matched so nested braces are handled.
function findBlock(text, headerRe, fromIdx = 0) {
  const re = new RegExp(headerRe.source, 'g');
  re.lastIndex = fromIdx;
  const m = re.exec(text);
  if (!m) return null;
  const open = text.indexOf('{', m.index);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return { open, close: i };
  }
  return null;
}

// --- locate the app build file ---
let bg = join(root, 'app', 'build.gradle');
let isKts = false;
if (!existsSync(bg)) {
  const kts = join(root, 'app', 'build.gradle.kts');
  if (existsSync(kts)) { bg = kts; isKts = true; }
  else fail(`No app/build.gradle(.kts) under ${root}. Pass the generated project root as the argument.`);
}

let src = readFileSync(bg, 'utf8');

// Scope the search to buildTypes { ... } so we don't match a `release` elsewhere.
const bt = findBlock(src, /buildTypes\s*\{/);
const rel = findBlock(src, /release\s*\{/, bt ? bt.open : 0);
if (!rel || (bt && rel.close > bt.close)) fail("Couldn't find a release { } build type in the build file.");

let inner = src.slice(rel.open + 1, rel.close);
const before = inner;

// minifyEnabled true
if (/minifyEnabled\s+false/.test(inner)) {
  inner = inner.replace(/minifyEnabled\s+false/, 'minifyEnabled true');
  changes.push('minifyEnabled: false → true');
} else if (!/minifyEnabled\s+true/.test(inner)) {
  inner = '\n            minifyEnabled true' + inner;
  changes.push('minifyEnabled: added (true)');
}

// shrinkResources true
if (/shrinkResources\s+false/.test(inner)) {
  inner = inner.replace(/shrinkResources\s+false/, 'shrinkResources true');
  changes.push('shrinkResources: false → true');
} else if (!/shrinkResources/.test(inner)) {
  inner = inner.replace(/(minifyEnabled\s+true)/, '$1\n            shrinkResources true');
  changes.push('shrinkResources: added (true)');
}

// ProGuard optimize config
if (/proguard-android\.txt/.test(inner)) {
  inner = inner.replace(/proguard-android\.txt/g, 'proguard-android-optimize.txt');
  changes.push('proguard: proguard-android.txt → proguard-android-optimize.txt');
} else if (!/proguardFiles/.test(inner)) {
  const pf = isKts
    ? '\n            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")'
    : "\n            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'";
  inner = inner.replace(/(minifyEnabled\s+true)/, '$1' + pf);
  changes.push('proguardFiles: added (optimize)');
}

if (inner !== before) {
  src = src.slice(0, rel.open + 1) + inner + src.slice(rel.close);
  writeFileSync(bg, src);
}

// --- gradle.properties: R8 full mode ---
let props = existsSync(propsPath) ? readFileSync(propsPath, 'utf8') : '';
if (/android\.enableR8\.fullMode\s*=\s*false/.test(props)) {
  props = props.replace(/android\.enableR8\.fullMode\s*=\s*false/, 'android.enableR8.fullMode=true');
  writeFileSync(propsPath, props);
  changes.push('gradle.properties: enableR8.fullMode false → true');
} else if (!/android\.enableR8\.fullMode\s*=/.test(props)) {
  if (props.length && !props.endsWith('\n')) props += '\n';
  props += 'android.enableR8.fullMode=true\n';
  writeFileSync(propsPath, props);
  changes.push('gradle.properties: android.enableR8.fullMode=true');
}

// --- proguard-rules.pro keep-rules (safety net) ---
if (existsSync(keepSrc)) {
  const rules = readFileSync(keepSrc, 'utf8');
  let dst = existsSync(keepDst) ? readFileSync(keepDst, 'utf8') : '';
  if (!dst.includes(MARK)) {
    if (!existsSync(dirname(keepDst))) mkdirSync(dirname(keepDst), { recursive: true });
    if (dst.length && !dst.endsWith('\n')) dst += '\n';
    dst += (dst.length ? '\n' : '') + rules;
    writeFileSync(keepDst, dst);
    changes.push('app/proguard-rules.pro: keep-rules installed');
  }
}

if (changes.length) {
  console.log('✓ R8 optimization enabled on ' + root);
  for (const c of changes) console.log('  • ' + c);
  console.log('\nNext: rebuild the .aab, bump appVersionCode/appVersionName, and upload a new release.');
} else {
  console.log('✓ R8 already enabled on ' + root + ' — nothing to change.');
}
