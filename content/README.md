# content/

The first import of each matn, bundled into the worker. A matn listed in
`index.ts` whose text is not stored yet is stored from its file here the
first time the API is asked for it (`src/worker/seed.ts`), so its text is
live on the deploy that adds it. The write is create-only: once a copy is
stored in R2 (`data/poem/<id>.json`) that copy is the live text, edited in
`/not-an-admin`, and the file here is not updated. It is a starting point, not the
current version.

| File | Matn | Source |
| --- | --- | --- |
| `zad-al-huffaz.json` | Zād al-Ḥuffāẓ (`/zad-al-huffaz`) | *Zād al-Ḥuffāẓ: Provision for the Memorisers*, Abdullah Badat's commentary on two poems of Shaykh Dr Waleed Idris al-Meneese (Athar Publishing). The verse text, the translations and the commentary are the book's. The word-by-word meanings follow the commentary's own word studies. |

To store one on a site (it is checked first, and nothing is sent without
`--write`):

```bash
ASL_PASSWORD=… node scripts/import.ts --file content/zad-al-huffaz.json --write
```

Or load the file at `/not-an-admin/import`, which accepts a finished `.json`.
