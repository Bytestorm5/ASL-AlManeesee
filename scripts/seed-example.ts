/* Loads the development fixture matn into a running local worker, through the
   same API the admin tools use — so it also proves the write path works.

     npm run dev:example        (in one terminal: builds with the fixture, runs wrangler dev)
     npm run seed:example       (in another)

   Reads the password from ADMIN_PASSWORD, else .dev.vars. Pass --origin to aim elsewhere. */
import { readFile } from 'node:fs/promises';

const origin = process.argv.includes('--origin') ? process.argv[process.argv.indexOf('--origin') + 1]! : 'http://127.0.0.1:8787';
const vars = await readFile(new URL('../.dev.vars', import.meta.url), 'utf8').catch(() => '');
const password = process.env.ADMIN_PASSWORD || /^ADMIN_PASSWORD=(.*)$/m.exec(vars)?.[1]?.trim();
if (!password) throw new Error('No ADMIN_PASSWORD in the environment or .dev.vars (copy .dev.vars.example)');

async function call(method: string, path: string, body: unknown): Promise<unknown> {
  const r = await fetch(origin + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-admin-password': password! },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j)}`);
  return j;
}

const doc = JSON.parse(await readFile(new URL('../fixtures/example-poem.json', import.meta.url), 'utf8'));
console.log('matn', await call('PUT', '/api/poems/example/document?overwrite=1', { doc }));

const qx = JSON.parse(await readFile(new URL('../fixtures/example-qiraat.json', import.meta.url), 'utf8'));
const current = (await fetch(origin + '/api/qiraat/example/index').then((r) => r.json())) as { version: number };
console.log('qiraat', await call('PUT', '/api/qiraat/example', { baseVersion: current.version, cards: qx }));

console.log('switches', await call('PUT', '/api/switches/example', { trHidden: {}, urHidden: {} }));
console.log('reciters', await call('PUT', '/api/reciters', { reciters: [{ id: 'example-reciter', name: 'Example Reciter' }] }));
