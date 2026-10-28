# al-Asl AlManeesee

The al-Asl reader for classical mutūn: each text verse by verse, with word
meanings, translations, commentary, recitations, search, bookmarks, notes and
a memorization mode with spaced repetition — on the web, offline, and as an
installed app.

This repository is the platform. It carries no texts yet: mutūn are
registered in `src/poems/registry.ts` and their text is imported through the
admin tools (see [docs/adding-a-matn.md](docs/adding-a-matn.md)).

## Stack

| | |
| --- | --- |
| Pages | [Astro 7](https://astro.build), static output, TypeScript |
| API | [Hono](https://hono.dev) on Cloudflare Workers (`src/worker/`) |
| Storage | Cloudflare R2 — verse data, switches, recordings |
| Hosting | One Worker serving `dist/` as static assets plus the API |
| Offline | A generated service worker (`src/sw/sw.ts`) |
| Tests | Vitest inside workerd (`tests/`), Playwright end to end |

## Getting started

Node 24 (`.node-version`).

```bash
npm install
cp .dev.vars.example .dev.vars        # local admin password
npm run dev:example                   # worker on :8787, site on :4321
npm run seed:example                  # in a second terminal: load the fixture matn
```

Open <http://localhost:4321/example> to read the fixture matn and
<http://localhost:4321/admin> for the tools (password from `.dev.vars`).
`npm run dev` is the same without the fixture — the production view, an
empty collection.

## Commands

| | |
| --- | --- |
| `npm run dev` / `dev:example` | Worker + Astro dev server (with the fixture matn) |
| `npm run seed:example` | Load the fixture's text into the local bucket |
| `npm run preview` | Production build served by the real worker on :8787 |
| `npm run check` | Typecheck pages, worker, service worker, tests, scripts |
| `npm test` | Worker and shared-logic tests (in workerd) |
| `npm run test:e2e` | Build with the fixture, serve it, drive it in Chromium |
| `npm run build` | Production build into `dist/` |
| `npm run deploy` | Build and `wrangler deploy` ([docs/deploying.md](docs/deploying.md)) |
| `npm run pdf` | Regenerate the downloadable PDFs from the live pages |
| `node scripts/load.ts` | Bulk-load word meanings, translations or explanations ([formats](docs/data-formats.md)) |

## Layout

```
src/
  config/site.ts     site-wide names, links, colours — rebrand here
  poems/             the matn registry, its types, the dev fixture registration
  pages/             index, [poem] (every reading page), guide, privacy, admin/*
  client/            browser code: reading/ features, admin/ tools, entries/
  styles/            reading, home, guide, theme (dark mode), fonts
  worker/            the API (Hono) and /media/ (recordings with byte ranges)
  shared/            rules both sides enforce: validation, markup, media keys
  sw/                the service worker
integrations/        build step: service worker, _headers, _redirects
scripts/             dev runner, seeding, e2e, PDFs, bulk loading
fixtures/            the example matn's text (development only)
apps/                Android TWA and iOS shell
docs/                adding a matn, deploying, data formats
```

## How a reading page works

`/<id>` is built once per registered matn from `src/pages/[poem].astro`. Its
text is not in the HTML: a blocking script, `/api/poems/<id>/data.js`, defines
it before the page's module runs, the renderer (`src/client/reading/render.ts`)
builds the chapters, and each feature module's `init()` runs in the order set
by `src/client/entries/reading.ts`. The service worker keeps the last good copy
of the data for offline. A data loader then checks the manifest and patches in
any newer version of a bayt without a reload, so an edit made in the admin
tools reaches readers without a deploy.

## The API

| Route | |
| --- | --- |
| `GET /api/manifest` | Versions of every stored dataset |
| `GET /api/poems/:id/data.js` | A matn's verses, as the reading page loads them |
| `GET /api/poems/:id` · `PUT` | The document; merge edited abyāt (optimistic concurrency) |
| `PUT /api/poems/:id/document` | Create or replace a whole matn (the importer) |
| `GET /api/qiraat/:id` · `/index` · `PUT` | Qirāʾāt panels |
| `GET /api/switches/:id` · `PUT` | Per-bayt visibility of translations and explanations |
| `GET /api/audio/:set` | Recordings of a matn (or an edition's set), per reciter |
| `GET/POST /api/recordings` | Next bayt to record · upload one |
| `GET/DELETE /api/files` · `GET/PUT /api/reciters` | Recitation manager |
| `GET /api/auth` | Password probe for the admin tools |
| `GET /media/<key>` | A recording, with byte ranges |

Writes need the `x-admin-password` header (`ADMIN_PASSWORD` secret). Every
write is validated against `src/shared/poem-data.ts`, versioned, backs up what
it replaces and uses an R2 etag compare-and-swap.

## Migrating from the Mutūn site

This was set up from the Mutūn site (Vercel + Blob, hand-written pages per
matn). What changed, for anyone who knew that codebase:

- seven per-matn HTML pages → one template driven by the registry;
- Vercel functions + Blob → a Hono worker + R2; Blob's eventual-consistency
  workarounds are gone (R2 is strongly consistent), and saves are
  compare-and-swap;
- all browser code is TypeScript modules bundled by Astro, not loose scripts;
- the service worker's version and precache list are generated;
- clean URLs (`/guide`, `/admin/editor`) instead of `.html` files;
- recordings play same-origin from `/media/`, not from a storage CDN;
- the three content-specific loaders became one bulk loader taking JSON files.
