/* Regenerate the downloadable PDFs straight from the live reading pages, so
   they can never drift from the on-screen text. One run per matn registered
   with `pdf` (src/poems/registry.ts):

     pdf.whole     → public/pdf/<id>/<id>-ar.pdf and <id>-ar-en.pdf
     pdf.chapters  → public/pdf/<id>/ch-NN.pdf and ch-NN-en.pdf, one per chapter

   The pages need the worker for their text, so run against a full local stack
   with the real data (or a deployed site):

     npm run preview                 # builds dist/ and serves it with the API on :8787
     npm run pdf                     # in another terminal

   With the development fixture (npm run preview:example), run
   `MUTUN_EXAMPLE=1 npm run pdf`; its PDFs are gitignored.

   Commit the PDFs under public/pdf/ — they are served as static files.
   PDF_BASE_URL   where the site is (default http://127.0.0.1:8787)
   PDF_ONLY       a filter on the job label, e.g. "example" or "example ch02"
   PW_CHROMIUM    a Chromium binary (default: Playwright's own)
   PDF_CONCURRENCY  parallel pages (default 4) */
import { chromium, type Browser } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_POEMS } from '../src/poems/index.ts';
import type { PoemConfig } from '../src/poems/types.ts';
import { SITE } from '../src/config/site.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE_URL = process.env.PDF_BASE_URL || 'http://127.0.0.1:8787';
const CHROMIUM_PATH = process.env.PW_CHROMIUM || undefined;
const CONCURRENCY = Number(process.env.PDF_CONCURRENCY || 4);
const PRINT_CSS = path.join(ROOT, 'src/styles/pdf-print.css');
const ORG_HOST = SITE.org.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
/** The line under the cover page's chips. */
const CREDIT = `Prepared for the al-Asl ${SITE.collection.en.replace(/^The /, '')} · ${ORG_HOST}`;

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function headerTemplate(emblem: string, title: string): string {
  return `<div style="width:100%; box-sizing:border-box; font-size:9px; padding:0 16mm 6px; margin:0; display:flex; align-items:center; justify-content:space-between; font-family:Georgia,'Times New Roman',serif; color:#3a2a2b; border-bottom:1px solid #e8dcc7">
    <span style="display:flex; align-items:center; gap:6px">
      <img src="${emblem}" style="width:12px; height:12px" />
      <span style="font-family:Arial,Helvetica,sans-serif; font-weight:700; letter-spacing:2px; font-size:8px; color:#8a4447">${esc(SITE.org.name.toUpperCase())}</span>
    </span>
    <span style="font-style:italic; color:#6c585a">${esc(title)}</span>
  </div>`;
}

function footerTemplate(subject: string): string {
  return `<div style="width:100%; box-sizing:border-box; font-size:8px; padding:6px 16mm 0; margin:0; display:flex; align-items:center; justify-content:space-between; font-family:Arial,Helvetica,sans-serif; color:#6c585a; border-top:1px solid #e8dcc7">
    <span>${esc(subject)}</span>
    <span style="font-weight:700; color:#8a4447">${esc(ORG_HOST)}</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`;
}

const VARIANTS = [
  { key: 'ar', tr: '' },
  { key: 'ar-en', tr: 'en' },
] as const;

interface Job { poem: PoemConfig; url: string; tr: string; outPath: string; chapter: number | null; label: string }

/** How many chapters a matn has, read from its live page. */
async function chapterCount(browser: Browser, url: string): Promise<number> {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('section.chapter', { timeout: 30000 });
    return await page.evaluate(() => document.querySelectorAll('section.chapter').length);
  } finally { await page.close(); }
}

async function buildJobs(browser: Browser): Promise<Job[]> {
  const jobs: Job[] = [];
  for (const p of ALL_POEMS.filter((x) => x.pdf?.whole || x.pdf?.chapters)) {
    const url = `${BASE_URL}/${p.id}`;
    const chapters = p.pdf?.chapters ? await chapterCount(browser, url) : 0;
    for (const v of VARIANTS) {
      if (p.pdf?.whole) jobs.push({ poem: p, url, tr: v.tr, outPath: `public/pdf/${p.id}/${p.id}-${v.key}.pdf`, chapter: null, label: `${p.id} whole ${v.key}` });
      for (let c = 1; c <= chapters; c++) {
        const num = String(c).padStart(2, '0');
        jobs.push({ poem: p, url, tr: v.tr, outPath: `public/pdf/${p.id}/ch-${num}${v.key === 'ar' ? '' : '-en'}.pdf`, chapter: c, label: `${p.id} ch${num} ${v.key}` });
      }
    }
  }
  return jobs;
}

async function renderOne(browser: Browser, job: Job, emblem: string): Promise<void> {
  const page = await browser.newPage();
  try {
    // Verses fade in on scroll, which page.pdf() never does — with reduced
    // motion the page skips that, so every verse renders at full opacity.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((trVal: string) => {
      try {
        localStorage.setItem('asl-tr', trVal);
        // The first-run walkthrough's overlay would be captured as blank pages.
        localStorage.setItem('asl-tour', '1');
      } catch { /* ignore */ }
    }, job.tr);
    await page.goto(job.url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('section.chapter', { timeout: 30000 });
    // Chapters are content-visibility:auto and their gloss spans are built
    // lazily; neither may be left half-done in print.
    await page.evaluate(() => {
      document.querySelectorAll<HTMLElement>('section.chapter').forEach((s) => {
        s.style.contentVisibility = 'visible';
        s.dispatchEvent(new CustomEvent('asl-need-glosses', { bubbles: true }));
      });
      return document.fonts.ready;
    });
    if (job.chapter != null) {
      await page.evaluate((cid: number) => {
        document.querySelectorAll('section.chapter').forEach((s) => { if (s.id !== 'ch' + cid) s.remove(); });
      }, job.chapter);
    }
    // The cover page and decorative pages, built on the page's own markup.
    await page.addStyleTag({ path: PRINT_CSS });
    await page.addStyleTag({ content: `:root{--pdf-credit:${JSON.stringify(CREDIT)}}` });

    const outAbs = path.join(ROOT, job.outPath);
    await mkdir(path.dirname(outAbs), { recursive: true });
    await page.pdf({
      path: outAbs,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: headerTemplate(emblem, job.poem.titleEn),
      footerTemplate: footerTemplate(job.poem.subject ?? job.poem.titleEn),
      margin: { top: '24mm', bottom: '18mm', left: '16mm', right: '16mm' },
    });
  } finally {
    await page.close();
  }
}

async function pool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let next = 0, done = 0;
  const errors: { item: T; error: string }[] = [];
  async function runner() {
    while (next < items.length) {
      const item = items[next++]!;
      try { await worker(item); } catch (e) { errors.push({ item, error: (e as Error)?.message ?? String(e) }); }
      done++;
      if (done % 10 === 0 || done === items.length) console.log(`${done}/${items.length} (${errors.length} failed so far)`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runner));
  return errors;
}

const browser = await chromium.launch(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {});
try {
  // Header templates cannot fetch anything, so the emblem travels inline.
  const emblem = 'data:image/png;base64,' + (await readFile(path.join(ROOT, 'public/brand/emblem.png'))).toString('base64');
  let jobs = await buildJobs(browser);
  if (process.env.PDF_ONLY) {
    const filter = process.env.PDF_ONLY.toLowerCase();
    jobs = jobs.filter((j) => j.label.toLowerCase().includes(filter));
  }
  if (!jobs.length) console.log('No matn is registered with `pdf` (src/poems/registry.ts) — nothing to do.');
  else {
    console.log(`Generating ${jobs.length} PDFs from ${BASE_URL} …`);
    const errors = await pool(jobs, CONCURRENCY, (job) => renderOne(browser, job, emblem));
    if (errors.length) {
      console.error(`\n${errors.length} FAILURE(S):`);
      for (const e of errors) console.error(`  ${e.item.label} -> ${e.item.outPath}: ${e.error}`);
      process.exitCode = 1;
    } else console.log('\nAll PDFs generated successfully.');
  }
} finally {
  await browser.close();
}
