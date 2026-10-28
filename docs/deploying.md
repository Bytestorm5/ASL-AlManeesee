# Deploying to Cloudflare Workers

The whole site is one Worker: Astro builds the pages into `dist/`, which
Workers serves as static assets; `/api/*` and `/media/*` run the worker in
`src/worker/` against one R2 bucket. `wrangler.jsonc` is the configuration.

## Once per Cloudflare account

```bash
npx wrangler login
npx wrangler r2 bucket create asl-almaneesee
npx wrangler secret put ADMIN_PASSWORD
```

The bucket name must match `r2_buckets[0].bucket_name` in `wrangler.jsonc`.
`ADMIN_PASSWORD` gates every write and every page under `/admin`.

## Deploy

```bash
npm run deploy
```

which is `astro build && wrangler deploy`. To deploy on every push instead,
connect the repository in the Cloudflare dashboard (Workers → the worker →
Settings → Builds) with build command `npm run build` and deploy command
`npx wrangler deploy`; `.node-version` pins Node 24, which Astro 7 needs.

Then attach the domain (Workers → the worker → Domains) and set it as
`SITE.url` in `src/config/site.ts` — canonical links, the sitemap, the share
text under a copied bayt and the app wrappers all use it.

## A staging copy

Add an environment to `wrangler.jsonc` with its own bucket, deploy it with
`wrangler deploy --env staging`, and list its host in `SITE.noindexHosts`
so it is never indexed. Build it with `SITE_URL=https://staging-host npm run build`
so its canonical links point at itself. (On the old Vercel setup staging and
live shared one store; here they do not unless you point them at the same
bucket.)

## Backups and storage

Every save keeps the previous five versions of a document under
`data/backup/`. To copy everything out of the bucket:

```bash
npx wrangler r2 object get asl-almaneesee/data/poem/<id>.json --file <id>.json
```

or use rclone/aws-cli against R2's S3 API for a full sync.

## Caching, briefly

- `/_astro/*` bundles are content-hashed and cached for a year.
- The manifest, a matn's `data.js` and the qirāʾāt index are cached at the
  edge for 10 s, the audio manifest for 60 s; a save purges them in its own
  data centre at once.
- Recordings under `/media/` never change (their key carries the upload
  time) and are cached as immutable.
- The service worker's version is a hash of the files it precaches, so any
  deploy that changes the site ships a new one. Installed apps pick it up
  after being fully closed and reopened.
