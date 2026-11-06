# Design: colour system

The reader uses an arctic palette of deep blues, glacier teals and ice-white,
chosen to stay calm and readable through long study sessions. This file
covers what each colour is for, where it is defined, and the rules a change
must keep. Typography, layout and components are as carried over from the
Mutūn site and are not covered here.

## The palette

| Colour | Hex | Used for |
|---|---|---|
| Deep Navy | `#0B3D6E` | Body text and headings in light mode, the app's top bar, browser/status bar, the launch splash, app icon ground |
| Royal Blue | `#0F63A8` | Actions: primary buttons, links, the active tab (light mode's default accent) |
| Sky Blue | `#56A6DD` | Secondary ornament: rules, progress bars, highlights, the inner petals of the star. **Never text on a light ground** (2.6:1) |
| Pale Ice Blue | `#A6D8F7` | Card tints and selection in light mode; **the text colour of dark mode** |
| Glacier Grey-Teal | `#7FAEBB` | Inspiration for dividers and secondary text. Too pale for text as is, so the text roles use deepened versions (`--ink-soft #33586F`, `--sage #456E80`) |
| Lagoon Teal | `#3E9E9B` | Success, bookmarks, audio. Text uses the deepened `--ok-text #1B6966` |
| Deep Teal | `#1F7F95` | Section accents, toggles when on |
| Midnight Green | `#0A4042` | Dark-mode surfaces, the footer (both themes), the app top bar in dark mode |

## Where colours live

- **`src/styles/tokens.css`** is the only place the palette is defined: the brand
  colours, the light and dark role tokens, the six accents in both modes and
  the app-area accents. Both layouts import it first.
- **`src/styles/theme.css`** holds dark mode's *component* overrides only
  (plates that recast from pale to deep, surfaces drawn white), never palette
  values.
- Page stylesheets and feature modules use `var(--token)`. A hex literal in
  them is either a content colour (below) or an error/warning red or amber.
- Outside CSS, the same colours appear where the platform needs a literal:
  `SITE.theme` in `src/config/site.ts` (meta theme-color, manifest),
  `apps/android/twa-manifest.json`, the iOS `StatusBarColor` and
  `LaunchBackground` colorsets, the splash canvas in `src/client/splash.ts`,
  the PDF header/footer in `scripts/generate-pdfs.ts`, and `#boot` in
  `src/styles/home.css` (which must equal the manifest's `background_color`).
  Change those together.

The token names are historical (`--madder`, `--lapis`, `--gilt`, `--paper`, …),
kept so the carried-over stylesheets work unchanged. Read them as roles:
`--madder` = accent/action, `--lapis` = deep plate, `--gilt` = ornament,
`--paper` = ground, `--ink` = text, `--on-accent` = text on an accent fill.

## Light and dark

- **Light** (default): very pale ice ground (`--paper #F4F9FD`), white
  surfaces, Deep Navy text, Royal Blue actions.
- **Dark**: near-black Midnight Green ground (`#05282A`), Midnight surfaces,
  Pale Ice Blue text, light-blue accents (`#7DBDEA` and per-accent lifts).
  Dark mode is keyed off `<html data-theme="dark">`, set by `src/client/theme.ts`.

## Six accents

The brief gives every section its own accent. Two kinds of section use them:

1. **Each matn** picks one in the registry (`accent` in `PoemConfig`, see
   `ACCENTS` in `src/poems/types.ts`): `navy`, `royal`, `sky`, `lagoon`,
   `teal`, `midnight`. The reading page gets `body.matn-<accent>`; home rows
   and cards get `.m-<accent>`. Each accent sets the action colour, deep plate,
   the hero/chapter panel tints and its own star emblem
   (`public/brand/emblem-<accent>.png` and `-dark.png`).
   Where an accent's literal colour is too light for text (sky, lagoon, deep
   teal), its text role uses a deepened shade of the same hue.
2. **The six app areas** (Home, Collection, Read, Memorize, Marginalia, More)
   each have an `--area-*` token. The active tab in the app's bottom bar, and
   the head of the sheet that tab opens, wear it. Inactive tabs stay `--sage`.

The app top bar and status bar are always Deep Navy (Midnight in dark mode),
whatever matn is open, so they stay continuous with the system status bar.

## Content colours (not brand)

Some colours carry meaning in the text itself and stay as they are:
the rumūz rubrication (`.rmz`…`.rmz7`, `.ann::after`, in red/brown inks),
a print edition's red words (`.rd`), Qurʾānic quotations in green (`.qur`),
error reds and warning amber. Each has a lifted dark-mode variant in
`theme.css`. Don't recolour these to the brand palette: a reader has to tell
them apart from the navy verse text at a glance.

## Brand artwork

The star emblem, the wordmark and the app icons are recoloured from the
original two-tone artwork: deep petals, light inner petals and the ground are
mapped to new inks, keeping the anti-aliasing. Light versions use Navy petals
with Sky inner petals; dark versions use Ice with Sky; app icons put the ice
star on a Deep Navy ground to match the navy launch splash.

## Contrast rules

Every text/background pair must meet WCAG AA: 4.5:1 for body text, 3:1 for
large text (the Arabic verse lines, ≥24px) and for icons that carry meaning.
Practical consequences:

- Sky Blue, Ice, Glacier and Lagoon are never text on a light ground. Use the
  deepened text tokens instead.
- `--on-accent` is the text colour for anything filled with an accent: white
  in light mode, Midnight in dark mode (the dark accents are light).
- Before changing a token, re-check the pairs it draws in both modes and for
  every accent, then run an automated pass over the rendered pages, e.g. axe-core's
  `color-contrast` rule via Playwright over home, a reading page (with
  translations on), the guide, privacy, every admin tool and the app shell with
  each sheet open, in light and dark.
