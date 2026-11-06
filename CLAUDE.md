# al-Asl AlMenesi (المنيسي) — project notes

The al-Asl reader for classical mutūn (didactic poems), carried over from the
Mutūn site (Bytestorm5/ASL-Jazariyyah) with its poems removed and its tooling
kept. Astro 7 builds a static site; a Hono worker on Cloudflare Workers serves
`/api/*` and `/media/*` from one R2 bucket; the whole thing deploys as one
Worker (`wrangler.jsonc`). Also shipped as an installed app (PWA, Android TWA,
iOS shell in `apps/`). Reader progress (bookmarks, notes, memorization) lives
per device in localStorage; there are no accounts.

Node 24 (`.node-version`). `npm run dev:example` + `npm run seed:example` gives
a working local stack with a fixture matn; `npm run check` and `npm test` must
pass before a push. See README.md for the full command list.

## Standing rule: keep the User Guide in sync
`src/pages/guide.astro` is the user-facing User Guide. **Whenever a
reader-facing feature is added, changed or removed, update the guide in the
same change** so it always describes what the app actually does. Update the
walkthrough (`src/client/reading/onboarding.ts`) when it makes sense too.

## Mutūn come from the registry — never hard-code one
`src/poems/registry.ts` lists every matn; `PoemConfig` (`src/poems/types.ts`)
says which features each uses. Pages, menus, editors, the API's validation,
the sitemap and the service worker's precache all read it. No file outside
the registry (and the content folders, `fixtures/` for the dev fixture and
`content/` for real mutūn) may name a particular matn. How to add one:
`docs/adding-a-matn.md`. Verse text is content, not code: it lives at
`data/poem/<id>.json` in R2 and is edited through `/not-an-admin`. A matn's first
text can ship in `content/` (listed in `content/index.ts`): the worker stores
it, create-only, the first time the matn is asked for (`src/worker/seed.ts`).

## Sections: poems, explanations, lectures
`src/config/sections.ts` names the site's three sections: the Shaykh's own
poems (`mutun`), his explanations of classical mutūn (`shuruh`, set with
`section: 'shuruh'` on a registry entry) and his lectures (their own
registry, `src/lectures/registry.ts`, shown on `/lectures`; a written one,
`written: true`, has its Arabic and English in `content/lectures/` and its own
page, `/lectures/<id>`). Home and the
app's sheets show **one section at a time** behind a switch, never one list
after another; keep it that way when adding to them. An empty section shows
its "being prepared" text from `sections.ts`. Explanations (`shuruh`) is
`hidden: true` for now: pages read `SHOWN_SECTIONS`, so it has no tab, menu
link or guide entry until that line is removed (the tests refuse a listed
matn in a hidden section).

## One reading page
`src/pages/[poem].astro` + `src/client/reading/render.ts` render every matn.
Feature modules under `src/client/` export `init()` and are called, in order,
by `src/client/entries/*.ts` once the page is rendered — never do DOM work at
import time.

## Rumūz annotations (small letters above words)
Qirāʾāt rumūz are marked up as `<span class="rmz ann" data-tp="ب">ب</span>`
around a word's first letter; the small letter above is drawn purely by CSS
(`.hemi .ann::after` in `src/styles/reading.css`). It is absolutely positioned
with `top:-.35em` against the span's content box, whose top already sits at
Scheherazade New's full 1.34em ascent above the baseline. **Keep the letter
snug to its word: small negative `top` offsets only (≈ -.35em).** Larger
offsets like `-1em` push the ramz mid-air into the descenders of the line
above. Use the same approach (and offset) for any new above-word annotation.
The markup vocabulary verse text may use is enforced by
`src/shared/poem-data.ts` (`ALLOWED_CLASSES`) — extend it there and style the
class in `reading.css` together.

## Service worker
`src/sw/sw.ts`, built by `integrations/site-output.ts` after the site. Its
version is a hash of the files it precaches and the precache list is the built
output itself, so there is nothing to bump by hand. Installed users pick up a
new version after fully closing and reopening the app. Admin pages, drafts and
PDFs are never precached.

## API and storage
Routes are in `src/worker/routes/`; the browser's side of every route is in
`src/client/api.ts` — add both together. Writes are password-gated
(`ADMIN_PASSWORD` secret, `x-admin-password` header), validated whole, versioned
with a backup of what they replace, and use an R2 etag compare-and-swap so two
editors can never overwrite each other. Tests for the worker run inside workerd
(`tests/*.test.ts`, `npm test`).

## The editing tools live at an unguessable path
They are served from `ADMIN_PATH` (`/not-an-admin`, `src/config/site.ts`),
not `/admin`. Never link them from a public page, never list them in
robots.txt or the sitemap (that would advertise them), and keep them
`noindex, nofollow` and `no-referrer` (`integrations/site-output.ts`). The
end-to-end test checks all of this. The password is still what protects
them; the path only keeps them out of sight.

## Colours: tokens only, WCAG AA always
The palette lives in `src/styles/tokens.css`; DESIGN.md says what each colour
is for. Use `var(--token)` in stylesheets and modules, never a new hex. Every
text/background pair, light and dark, must pass WCAG AA (4.5:1, or 3:1 for the
large verse text). Rumūz, red ink, Qurʾān green and error/warning colours are
content colours and stay as they are.

## Key files
- `src/config/site.ts` — every site-wide name and link, and the platform
  colours (theme-color, manifest) that must be literals
- `src/poems/` — the registry, types, and the dev fixture registration
- `src/pages/` — home, `[poem]` reading page, guide, privacy, and the editing
  tools in `not-an-admin/` (see below)
- `src/client/` — browser code (`reading/` features, `admin/` tool scripts)
- `src/styles/` — `tokens.css` (the whole palette: light and dark tokens, the
  six accents, app-area accents), `reading.css`, `home.css`, `theme.css`
  (dark mode's component overrides, keyed off `<html data-theme="dark">`;
  light is the default)
- `src/worker/` — the API; `src/shared/` — rules shared by worker and pages
- `src/sw/sw.ts` — service worker; `integrations/site-output.ts` — builds it,
  plus `_headers`/`_redirects`
- `scripts/` — dev runner, fixture seeding, PDF generation, bulk loading
- `apps/` — Android TWA and iOS shell
