import { beforeEach, describe, expect, it } from 'vitest';
import { env, exports } from 'cloudflare:workers';
import fixture from '../fixtures/example-poem.json';

const ORIGIN = 'https://site.test';
const PW = { 'x-admin-password': 'test-password' };
const JSON_PW = { ...PW, 'content-type': 'application/json' };

/* Storage is shared by every test in a file, so each test starts from an empty bucket. */
beforeEach(async () => {
  let cursor: string | undefined;
  do {
    const page = await env.STORE.list({ cursor });
    if (page.objects.length) await env.STORE.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
});

function call(path: string, init: RequestInit = {}) {
  return exports.default.fetch(new Request(ORIGIN + path, init));
}
async function importFixture() {
  const r = await call('/api/poems/example/document', { method: 'PUT', headers: JSON_PW, body: JSON.stringify({ doc: fixture }) });
  expect(r.status).toBe(200);
  return r.json() as Promise<{ version: number }>;
}

describe('auth', () => {
  it('probes the password', async () => {
    expect((await call('/api/auth')).status).toBe(401);
    expect((await call('/api/auth', { headers: { 'x-admin-password': 'nope' } })).status).toBe(401);
    expect((await call('/api/auth', { headers: PW })).status).toBe(200);
  });
  it('gates every write', async () => {
    const r = await call('/api/poems/example', { method: 'PUT', body: '{}' });
    expect(r.status).toBe(401);
  });
});

describe('verse data', () => {
  it('reports a matn that is not stored yet', async () => {
    const r = await call('/api/poems/example/data.js');
    expect(r.status).toBe(404);
    expect(await r.text()).toContain('not stored');
  });

  it('imports a whole document, then refuses to overwrite it unless asked', async () => {
    const created = await importFixture();
    expect(created.version).toBe(1);
    const again = await call('/api/poems/example/document', { method: 'PUT', headers: JSON_PW, body: JSON.stringify({ doc: fixture }) });
    expect(again.status).toBe(409);
    const over = await call('/api/poems/example/document?overwrite=1', { method: 'PUT', headers: JSON_PW, body: JSON.stringify({ doc: fixture }) });
    expect(((await over.json()) as { version: number }).version).toBe(2);
    expect(await env.STORE.head('data/backup/poem-example-v1.json')).not.toBeNull();
  });

  it('rejects a document with the wrong verse count', async () => {
    const bad = structuredClone(fixture);
    bad.chapters[0]!.verses.pop();
    const r = await call('/api/poems/example/document', { method: 'PUT', headers: JSON_PW, body: JSON.stringify({ doc: bad }) });
    expect(r.status).toBe(422);
    expect(JSON.stringify(await r.json())).toMatch(/expected 8 verses/);
  });

  it('serves the verses as a script and in the manifest', async () => {
    await importFixture();
    const js = await (await call('/api/poems/example/data.js')).text();
    expect(js.startsWith('window.ASL_CH=')).toBe(true);
    expect(js).toContain('window.ASL_CH_V=1');
    expect(js).toContain('window.ASL_VARIANTS={"2"');
    const m = (await (await call('/api/manifest')).json()) as { poems: Record<string, { version: number }> };
    expect(m.poems.example?.version).toBe(1);
  });

  it('merges a bayt, bumps the version and refuses a stale base', async () => {
    await importFixture();
    const save = (baseVersion: number) => call('/api/poems/example', {
      method: 'PUT', headers: JSON_PW, body: JSON.stringify({ baseVersion, bayts: [{ n: 3, tr: 'Edited' }] }),
    });
    const ok = await save(1);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { version: number }).version).toBe(2);
    const stale = await save(1);
    expect(stale.status).toBe(409);
    const doc = (await (await call('/api/poems/example')).json()) as { chapters: { verses: { n: number; tr?: string }[] }[] };
    expect(doc.chapters[0]!.verses[2]!.tr).toBe('Edited');
  });

  it('refuses unknown matn ids', async () => {
    expect((await call('/api/poems/nope/data.js')).status).toBe(404);
    expect((await call('/api/poems/nope')).status).toBe(400);
  });
});

describe('switches', () => {
  it('answers with the registered defaults, then keeps unsent maps on save', async () => {
    const d = (await (await call('/api/switches/example')).json()) as { source: string; enabled: Record<string, boolean> };
    expect(d.source).toBe('default');
    expect(d.enabled['1']).toBe(true); // example registers its explanations as checked
    const put = await call('/api/switches/example', { method: 'PUT', headers: JSON_PW, body: JSON.stringify({ trHidden: { 2: true } }) });
    expect(put.status).toBe(200);
    await call('/api/switches/example', { method: 'PUT', headers: JSON_PW, body: JSON.stringify({ urHidden: { 1: true } }) });
    const s = (await (await call('/api/switches/example')).json()) as { trHidden: Record<string, boolean>; urHidden: Record<string, boolean> };
    expect(s.trHidden).toEqual({ 2: true });
    expect(s.urHidden).toEqual({ 1: true });
  });
});

describe('recordings', () => {
  const upload = (bayt: number, bytes: Uint8Array, set = 'example') =>
    call(`/api/recordings?poem=${set}&bayt=${bayt}&reciter=Test Voice&ext=mp3&mime=audio/mpeg`, { method: 'POST', headers: PW, body: bytes });

  it('stores an upload, lists it in the audio manifest and serves byte ranges', async () => {
    const bytes = new Uint8Array(1000).map((_, i) => i % 251);
    const r = await upload(2, bytes);
    expect(r.status).toBe(200);
    const { url } = (await r.json()) as { url: string };
    expect(url).toMatch(/^\/media\/mutun\/example\/2\/test-voice\//);

    const m = (await (await call('/api/audio/example')).json()) as { reciters: { id: string; abyat: number[]; urls: Record<string, string> }[] };
    expect(m.reciters[0]!.id).toBe('test-voice');
    expect(m.reciters[0]!.abyat).toEqual([2]);

    const part = await call(url, { headers: { range: 'bytes=10-19' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 10-19/1000');
    expect([...new Uint8Array(await part.arrayBuffer())]).toEqual([...bytes.slice(10, 20)]);
    expect((await call(url)).status).toBe(200);
  });

  it('suggests the first bayt this reciter has not recorded', async () => {
    await upload(1, new Uint8Array([1, 2, 3]));
    const r = (await (await call('/api/recordings?poem=example&reciter=test-voice', { headers: PW })).json()) as { next: number };
    expect(r.next).toBe(2);
  });

  it('accepts edition recording sets and refuses out-of-range bayts', async () => {
    expect((await upload(1, new Uint8Array([1]), 'example-n2')).status).toBe(200);
    expect((await upload(9, new Uint8Array([1]))).status).toBe(400);
    expect((await upload(1, new Uint8Array([1]), 'example-n3')).status).toBe(400);
  });

  it('lists and deletes only recordings', async () => {
    await upload(3, new Uint8Array([1, 2]));
    await call('/api/reciters', { method: 'PUT', headers: JSON_PW, body: JSON.stringify({ reciters: [{ name: 'Test Voice' }] }) });
    const list = (await (await call('/api/files?prefix=mutun/', { headers: PW })).json()) as { files: { key: string }[] };
    expect(list.files.map((f) => f.key).some((k) => k.endsWith('reciters.json'))).toBe(false);
    const keys = list.files.map((f) => f.key);
    const del = await call('/api/files', { method: 'DELETE', headers: JSON_PW, body: JSON.stringify({ keys: [...keys, 'mutun/reciters.json', 'data/poem/example.json'] }) });
    expect(((await del.json()) as { deleted: number }).deleted).toBe(keys.length);
    expect(await env.STORE.head('mutun/reciters.json')).not.toBeNull();
  });

  it('never serves anything but a recording from /media/', async () => {
    await env.STORE.put('data/poem/example.json', '{}');
    expect((await call('/media/data/poem/example.json')).status).toBe(404);
  });
});

describe('qirāʾāt', () => {
  const card = { word: 'مَٰلِكِ', sura: 'al-Fātiḥah', ayah: 4, ayahText: '<b>مَٰلِكِ</b> يَوۡمِ ٱلدِّينِ', readings: [{ who: 'ʿĀṣim', how: 'with an alif' }] };
  const save = (baseVersion: number, cards: unknown) =>
    call('/api/qiraat/example', { method: 'PUT', headers: JSON_PW, body: JSON.stringify({ baseVersion, cards }) });

  it('creates the dataset on the first save and keeps the index in step', async () => {
    expect(((await (await call('/api/qiraat/example/index')).json()) as { bayts: number[] }).bayts).toEqual([]);
    const r = await save(0, { 2: [card], 5: [card] });
    expect(r.status).toBe(200);
    const idx = (await (await call('/api/qiraat/example/index')).json()) as { bayts: number[]; version: number };
    expect(idx).toMatchObject({ bayts: [2, 5], version: 1 });
    const m = (await (await call('/api/manifest')).json()) as { qiraat: Record<string, { version: number }> };
    expect(m.qiraat.example?.version).toBe(1);
  });

  it('removes a panel, refuses a stale base and a bayt past the end', async () => {
    await save(0, { 2: [card] });
    expect((await save(1, { 2: null })).status).toBe(200);
    expect((await save(1, { 3: [card] })).status).toBe(409);
    expect((await save(2, { 99: [card] })).status).toBe(422);
  });

  it('is refused for an unknown matn', async () => {
    expect((await call('/api/qiraat/nope/index')).status).toBe(400);
  });
});
