/* End-to-end smoke test: the real worker serving a real build, driven in
   Chromium. Self-contained — its own build directory, its own empty local
   bucket, its own password — so it runs the same on a laptop and in CI.

     npm run test:e2e

   1. builds the site with the example matn compiled in;
   2. starts `wrangler dev` on that build with a fresh R2 state;
   3. loads the fixture through the admin API (scripts/seed-example.ts);
   4. checks the pages a reader and an editor depend on, failing on any
      console error or failed request. */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Page } from 'playwright';

const PORT = Number(process.env.E2E_PORT || 8790);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'e2e-password';
const root = path.join(import.meta.dirname, '..');
const work = await mkdtemp(path.join(tmpdir(), 'asl-e2e-'));
const outDir = path.join(work, 'dist');

function run(cmd: string, args: string[], env: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
    p.on('exit', (code) => (code ? reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)) : resolve()));
  });
}

async function waitFor(url: string, ms = 60000): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${url}`);
}

const failures: string[] = [];
function check(ok: unknown, what: string): void {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failures.push(what);
}

/** Open a page, collecting console errors and failed same-origin requests. */
async function open(page: Page, url: string): Promise<string[]> {
  const problems: string[] = [];
  page.removeAllListeners('console');
  page.removeAllListeners('pageerror');
  page.removeAllListeners('requestfailed');
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (r.url().startsWith(ORIGIN)) problems.push(`request failed: ${r.url()}`); });
  await page.goto(ORIGIN + url, { waitUntil: 'networkidle' });
  return problems;
}

let worker: ChildProcess | undefined;
try {
  await run('npx', ['astro', 'build', '--outDir', outDir], { MUTUN_EXAMPLE: '1' });
  /* Run wrangler itself (not through npx) as the head of its own process
     group, so stopping it below also stops the workerd it starts. */
  worker = spawn(path.join(root, 'node_modules/.bin/wrangler'), ['dev', '--port', String(PORT), '--assets', outDir,
    '--persist-to', path.join(work, 'state'), '--define', '__INCLUDE_EXAMPLE__:true', '--var', `ADMIN_PASSWORD:${PASSWORD}`],
  { cwd: root, stdio: 'ignore', detached: true });
  await waitFor(`${ORIGIN}/api/manifest`);
  await run('node', ['scripts/seed-example.ts', '--origin', ORIGIN], { ADMIN_PASSWORD: PASSWORD });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // ── the reading page ──
  let problems = await open(page, '/example');
  check(problems.length === 0, `/example loads cleanly ${problems.join(' | ')}`);
  check(await page.locator('#main .verse').count() === 8, '/example renders all 8 abyāt');
  check(await page.locator('#tocGrid .toc-card').count() === 2, 'contents lists both chapters');
  check(await page.locator('.hemi .ann[data-tp]').count() >= 1, 'a ramz is drawn above its word');
  check(await page.locator('.nk-mark').count() === 1, 'the bayt that differs between editions carries ⇄');
  await page.locator('#ch1').scrollIntoViewIfNeeded();
  await page.waitForSelector('#ch1 .hemi .seg[data-g]');
  check(true, 'word-gloss spans are built as the chapter comes into view');
  await page.locator('#viewBtn').click();
  await page.locator('#viewDrop [data-k="en"]').click();
  check(await page.locator('#main .verse .translation').first().isVisible(), 'the Translation menu shows English');

  // ── the home page (the example is a draft, so the collection is empty) ──
  problems = await open(page, '/');
  check(problems.length === 0, `/ loads cleanly ${problems.join(' | ')}`);
  check(await page.locator('a[href^="/example"]').count() === 0, 'drafts are not listed on the home page');

  for (const url of ['/guide', '/privacy', '/layout-check', '/does-not-exist']) {
    problems = await open(page, url);
    check(problems.filter((p) => !(url === '/does-not-exist' && p.includes('404'))).length === 0, `${url} loads cleanly ${problems.join(' | ')}`);
  }

  // ── the admin tools load, and the password gate accepts the password ──
  for (const url of ['/admin', '/admin/editor', '/admin/content', '/admin/import', '/admin/recordings', '/admin/upload', '/admin/loader', '/admin/orthography']) {
    problems = await open(page, url);
    check(problems.length === 0, `${url} loads cleanly ${problems.join(' | ')}`);
  }

  // ── headers ──
  const head = await fetch(`${ORIGIN}/admin/editor`);
  check(head.headers.get('x-robots-tag')?.includes('noindex'), '/admin pages are served noindex');
  const sw = await fetch(`${ORIGIN}/sw.js`);
  check(sw.ok && (await sw.text()).includes('asl-shell-'), 'the service worker is built');

  await browser.close();
} finally {
  if (worker?.pid) { try { process.kill(-worker.pid, 'SIGTERM'); } catch { /* already gone */ } }
  await rm(work, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exitCode = 1;
} else console.log('\nAll end-to-end checks passed.');
