/* What the worker is given by Cloudflare. The binding names here must match
   wrangler.jsonc; `npm run types` regenerates worker-configuration.d.ts from
   that file, and this type checks the two agree. */
export interface Bindings {
  /** Everything stored: verse data, switches, recordings, the reciter list. */
  STORE: R2Bucket;
  /** The built site (dist/). */
  ASSETS: Fetcher;
  /** Gate for every write and for the admin tools. A secret: `wrangler secret put`. */
  ADMIN_PASSWORD?: string;
}

export type AppEnv = { Bindings: Bindings };
