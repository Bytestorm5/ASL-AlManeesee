# content/

The first import of each matn, kept as the record of where its text came
from. The live text is the copy in R2 (`data/poem/<id>.json`): once a matn
is imported, it is edited in `/admin`, and the file here is not updated, so
it is a starting point, not the current version.

| File | Matn | Source |
| --- | --- | --- |
| `zad-al-huffaz.json` | Zād al-Ḥuffāẓ (`/zad-al-huffaz`) | *Zād al-Ḥuffāẓ: Provision for the Memorisers*, Abdullah Badat's commentary on two poems of Shaykh Dr Waleed Idris al-Meneese (Athar Publishing). The verse text, the translations and the commentary are the book's. The word-by-word meanings follow the commentary's own word studies. |

To store one on a site (it is checked first, and nothing is sent without
`--write`):

```bash
ASL_PASSWORD=… node scripts/import.ts --file content/zad-al-huffaz.json --write
```

Or load the file at `/admin/import`, which accepts a finished `.json`.
