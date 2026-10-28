/* The web app manifest, from the site config and the registry (one shortcut
   per listed matn, as the Android app's long-press menu shows them). */
import type { APIRoute } from 'astro';
import { SITE } from '../config/site.ts';
import { POEMS } from '../poems/index.ts';

export const GET: APIRoute = () => {
  const names = POEMS.map((p) => p.shortEn);
  const manifest = {
    name: SITE.appName,
    short_name: SITE.appName,
    description: SITE.collection.description + (names.length ? ` ${names.join(', ')}.` : ''),
    lang: 'en',
    dir: 'ltr',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: SITE.theme.background,
    theme_color: SITE.theme.color,
    categories: ['education', 'books', 'reference'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: POEMS.slice(0, 4).map((p) => ({
      name: p.titleEn, short_name: p.shortEn, url: `/${p.id}`,
      icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    })),
  };
  return new Response(JSON.stringify(manifest, null, 2), { headers: { 'Content-Type': 'application/manifest+json' } });
};
