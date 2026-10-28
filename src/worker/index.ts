/* The worker: every /api/* and /media/* request (wrangler.jsonc routes them
   here first); everything else is the static site, served straight from the
   assets without waking this code. */
import { Hono } from 'hono';
import type { AppEnv } from './env.ts';
import { isAuthed } from './auth.ts';
import { serveMedia } from './media.ts';
import { poems } from './routes/poems.ts';
import { qiraat } from './routes/qiraat.ts';
import { switches } from './routes/switches.ts';
import { recordings } from './routes/recordings.ts';

const app = new Hono<AppEnv>();

/* The API is fetched by the pages, never read by a search engine — but the
   verse data must stay crawlable as a script the page loads, so it is not
   disallowed in robots.txt; this header keeps the responses themselves out of
   the index instead. Writes and reads that set no cache policy are no-store. */
app.use('/api/*', async (c, next) => {
  await next();
  // A response read back from the cache has immutable headers — copy first.
  const res = new Response(c.res.body, c.res);
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (!res.headers.has('Cache-Control')) res.headers.set('Cache-Control', 'no-store');
  c.res = undefined;
  c.res = res;
});

/** Password probe for the admin pages. */
app.get('/api/auth', async (c) =>
  (await isAuthed(c)) ? c.json({ ok: true, authed: true }) : c.json({ error: 'Wrong password' }, 401));

app.route('/api', poems);
app.route('/api', qiraat);
app.route('/api', switches);
app.route('/api', recordings);

app.on(['GET', 'HEAD'], '/media/*', serveMedia);

app.notFound((c) =>
  c.req.path.startsWith('/api/') ? c.json({ error: 'Not found' }, 404) : c.env.ASSETS.fetch(c.req.raw));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Server error' }, 500);
});

export default app;
