import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

/* Tests run inside workerd, against the worker as configured in
   wrangler.jsonc, with a throwaway R2 bucket per test file. The example matn
   is compiled in so the poem routes have something registered to accept. */
export default defineConfig({
  define: { __INCLUDE_EXAMPLE__: 'true' },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { bindings: { ADMIN_PASSWORD: 'test-password' } },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'] },
});
