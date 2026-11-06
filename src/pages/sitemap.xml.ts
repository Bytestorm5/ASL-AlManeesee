/* Every public page: home, the listed mutūn (never drafts), the lectures,
   the guide and the privacy policy. */
import type { APIRoute } from 'astro';
import { SITE } from '../config/site.ts';
import { POEMS } from '../poems/index.ts';
import { LECTURES_PATH } from '../config/sections.ts';

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL(SITE.url);
  const paths = ['/', ...POEMS.map((p) => '/' + p.id), LECTURES_PATH, '/guide', '/privacy'];
  const urls = paths.map((p) => `  <url><loc>${new URL(p, base).toString()}</loc></url>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
