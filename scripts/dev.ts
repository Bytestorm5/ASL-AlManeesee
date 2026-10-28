/* `npm run dev`: the worker (wrangler dev, :8787, local R2 under .wrangler/)
   and the site (astro dev, :4321, which forwards /api and /media to the
   worker). Open http://localhost:4321. Ctrl-C stops both.

   With MUTUN_EXAMPLE=1 (`npm run dev:example`) both sides compile in the
   example matn; load its text with `npm run seed:example`. */
import { spawn } from 'node:child_process';

const example = process.env.MUTUN_EXAMPLE === '1';
const procs = [
  spawn('npx', ['wrangler', 'dev', '--port', '8787', ...(example ? ['--define', '__INCLUDE_EXAMPLE__:true'] : [])], { stdio: 'inherit' }),
  spawn('npx', ['astro', 'dev', '--port', '4321'], { stdio: 'inherit', env: process.env }),
];
const stop = () => { for (const p of procs) p.kill('SIGINT'); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => { if (code) { stop(); process.exitCode = code; } });
