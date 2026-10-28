/* The admin index (/admin): which storage this copy of the site writes to,
   and what is stored right now. Runs as the page's module script. */
import { ALL_POEMS } from '../../poems/index.ts';
import { siteHost } from '../../config/site.ts';
import { getManifest } from '../api.ts';
import { esc } from '../page.ts';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from the page`);
  return el;
}

/* Every DEPLOYED copy of the site — the live host, a workers.dev preview, a
   staging hostname — runs the same worker against the same R2 bucket, so a
   save made on any of them shows up on all. A local `wrangler dev` (and
   `astro dev`, which forwards /api to it) uses its own bucket under
   .wrangler/state instead. Worth saying plainly at the top of a page whose
   every link publishes something. */
const host = location.hostname;
const isLocal = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(host) || host.endsWith('.localhost');
const isLive = !isLocal && location.host === siteHost();
const where = $('where');
$('whereT').textContent = isLocal
  ? 'Local — wrangler dev’s own R2 bucket, not the live one'
  : isLive
    ? 'Live site — changes are public immediately'
    : 'Staging — but the same storage as the live app';
if (isLive) where.className = 'where live';
$('shared').textContent = isLocal
  ? 'This local copy reads and writes its own R2 bucket (in .wrangler/state), so nothing saved here reaches the live site.'
  : 'Every deployed copy of the site shares one R2 bucket, so a change made on any of them appears on all.';

/* Every registered matn (drafts too) and whether its text has been imported
   yet — the question this page gets opened to answer more than any other. */
function ago(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 5400) return Math.round(s / 60) + ' min ago';
  if (s < 172800) return Math.round(s / 3600) + ' h ago';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const stored = $('stored');
const unreadable = '<div class="msg">The manifest could not be read.</div>';

if (!ALL_POEMS.length) {
  stored.innerHTML = '<div class="msg">No matn is registered yet. To add one, give it an entry in '
    + '<code>src/poems/registry.ts</code> (its id, titles and number of abyāt) and deploy; then bring its '
    + 'text in with <a href="/admin/import">Import a matn</a>.</div>';
} else {
  getManifest()
    .then((m) => {
      // `source: 'unavailable'` is the worker saying the bucket could not be
      // read — its empty list would otherwise claim nothing is stored.
      if (!m || !m.poems || m.source === 'unavailable') { stored.innerHTML = unreadable; return; }
      const rows = ALL_POEMS.map((p) => {
        const e = m.poems[p.id];
        return '<tr><td>' + esc(p.shortEn) + (p.draft ? ' <span class="pill draft">draft</span>' : '') + '</td>'
          + '<td>' + (e ? '<span class="pill ok">stored</span>' : '<span class="pill no">not uploaded</span>') + '</td>'
          + '<td class="v">' + (e ? 'v' + e.version : '—') + '</td>'
          + '<td class="when">' + (e ? ago(e.updatedAt) : '—') + '</td></tr>';
      }).join('');
      stored.innerHTML = '<table><tr><th>Matn</th><th>State</th><th>Version</th><th>Last saved</th></tr>'
        + rows + '</table>';
    })
    .catch(() => { stored.innerHTML = unreadable; });
}
