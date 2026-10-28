/* GET /media/<key> — a stored recording, served same-origin with byte ranges.

   An <audio> element asks for ranges (iOS will not play a 200 sent in reply
   to one), and the service worker caches these URLs for offline listening.
   A recording's key carries its upload time, so the bytes behind a URL never
   change: it can be cached as immutable everywhere. Only recordings are
   served here; documents go through the API. */
import type { Context } from 'hono';
import type { AppEnv } from './env.ts';
import { parseRecordingKey } from '../shared/media.ts';

export async function serveMedia(c: Context<AppEnv>): Promise<Response> {
  const path = new URL(c.req.url).pathname.replace(/^\/media\//, '');
  let key: string;
  try { key = path.split('/').map(decodeURIComponent).join('/'); } catch { return c.text('Bad path', 400); }
  if (!parseRecordingKey(key)) return c.text('Not found', 404);

  const req = c.req.raw;
  const obj = await c.env.STORE.get(key, { range: req.headers, onlyIf: req.headers });
  if (!obj) return c.text('Not found', 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('ETag', obj.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Robots-Tag', 'noindex');

  // onlyIf failed (If-None-Match matched, etc.): the body is absent
  if (!('body' in obj)) return new Response(null, { status: 304, headers });

  const range = obj.range as { offset?: number; length?: number; suffix?: number } | undefined;
  if (range && req.headers.has('range')) {
    const size = obj.size;
    let start: number, length: number;
    if (range.suffix != null) { length = Math.min(range.suffix, size); start = size - length; }
    else { start = range.offset ?? 0; length = range.length ?? size - start; }
    headers.set('Content-Range', `bytes ${start}-${start + length - 1}/${size}`);
    headers.set('Content-Length', String(length));
    return new Response(req.method === 'HEAD' ? null : obj.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(obj.size));
  return new Response(req.method === 'HEAD' ? null : obj.body, { status: 200, headers });
}
