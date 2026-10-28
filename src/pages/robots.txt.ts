/* Nothing is disallowed, deliberately. The admin tools must stay out of
   search, and the way to do that is a noindex header (see _headers), which a
   crawler only reads if it is let in: a Disallowed URL is never fetched, so its
   noindex is never seen, and a bare listing can still appear. /api/ stays open
   for the same reason it always did — every reading page loads its verses from
   it as a script, and blocking it would index each matn blank. */
import type { APIRoute } from 'astro';
import { SITE } from '../config/site.ts';

export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', site ?? SITE.url).toString()}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
