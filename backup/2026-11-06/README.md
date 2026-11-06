# Backup taken before the sections change (2026-11-06)

Taken just before the app was restructured into sections (the Shaykh's own
poems, his explanations of classical mutūn, and his lectures).

## What is here

| | |
|---|---|
| Code | the branch `backup/pre-sections-2026-11-06-code`, which points at `6f0157b` — exactly what main and the live site ran (this branch's parent commit) |
| Live data | the files in this folder, read from https://almenesi.al-asl.com the same minute: every stored matn (`poem-<id>.json`, all at version 1), each matn's visibility switches (`switches-<id>.json`) and the manifest |

The stored texts were still the first imports from `content/`, so the copies
in `content/` at that commit are the same text.

## How to revert

**Code** — put main back to that commit (a revert commit keeps history;
nothing is force-pushed), and the deploy follows main:

```bash
git fetch origin
git checkout main
git revert --no-edit 6f0157b..origin/main
git push origin main
```

Or roll the Worker back to the earlier deployment in the Cloudflare
dashboard (Workers → asl-almaneesee → Deployments), which is immediate.

**Data** (only if a stored text was changed and must be restored) — with the
admin password:

```bash
ASL_PASSWORD=… node scripts/import.ts --file backup/2026-11-06/poem-<id>.json --write --overwrite
```

The write backs up whatever it replaces, as every write does.
