import { defineConfig } from 'astro/config';
import { SITE } from './src/config/site.ts';
import { siteOutput } from './integrations/site-output.ts';

/* The example matn (src/poems/example.ts) is a development fixture. It is
   compiled in only when asked for — `npm run dev:example`, the end-to-end
   tests — and never into a production build. */
const includeExample = process.env.MUTUN_EXAMPLE === '1';

/* Where `astro dev` forwards the API and recordings: a `wrangler dev` running
   the worker against its local R2 bucket (npm run dev starts both). */
const API = process.env.API_ORIGIN || 'http://127.0.0.1:8787';

export default defineConfig({
  site: process.env.SITE_URL || SITE.url,
  output: 'static',
  /* /guide is built as dist/guide.html and served at /guide (Workers static
     assets drop the extension); the reading pages are /<matn id>. */
  build: { format: 'file' },
  trailingSlash: 'never',
  devToolbar: { enabled: false },
  integrations: [siteOutput()],
  vite: {
    define: { __INCLUDE_EXAMPLE__: JSON.stringify(includeExample) },
    server: {
      proxy: {
        '/api': { target: API, changeOrigin: false },
        '/media': { target: API, changeOrigin: false },
      },
    },
  },
});
