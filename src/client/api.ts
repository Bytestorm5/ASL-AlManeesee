/* The browser's side of the API (src/worker/routes/*): one function per
   endpoint, so a route is spelled in exactly one place on each side.

   Public reads return parsed JSON or throw ApiError. Admin calls take the
   password from the admin session (src/client/admin/auth.ts) via `pw`. */
import type {
  AudioManifest, Manifest, PoemDoc, QiraatDoc, QiraatIndex, Reciter, Switches,
} from '../poems/types.ts';

export const PASSWORD_HEADER = 'x-admin-password';

export class ApiError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown> | null;
  constructor(status: number, body: Record<string, unknown> | null) {
    super(typeof body?.error === 'string' ? body.error : `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
  /** Validation problems listed by a 422. */
  get problems(): string[] {
    return Array.isArray(this.body?.problems) ? (this.body.problems as string[]) : [];
  }
}

interface CallOptions { pw?: string; method?: string; json?: unknown; body?: BodyInit; headers?: Record<string, string>; cache?: RequestCache }

async function call<T>(path: string, o: CallOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...(o.headers ?? {}) };
  if (o.pw) headers[PASSWORD_HEADER] = o.pw;
  let body = o.body;
  if (o.json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(o.json); }
  const r = await fetch(path, { method: o.method ?? 'GET', headers, body, cache: o.cache ?? 'no-store' });
  let parsed: Record<string, unknown> | null = null;
  try { parsed = (await r.json()) as Record<string, unknown>; } catch { /* not JSON */ }
  if (!r.ok) throw new ApiError(r.status, parsed);
  return parsed as T;
}

const enc = encodeURIComponent;

/* ── public ───────────────────────────────────────────────────────────── */

export const getManifest = () => call<Manifest>('/api/manifest');
/** The stored document. weld=true matches what the reading page rendered. */
export const getPoemDoc = (id: string, weld = false) => call<PoemDoc>(`/api/poems/${enc(id)}${weld ? '?weld=1' : ''}`);
export const poemScriptUrl = (id: string) => `/api/poems/${enc(id)}/data.js`;
export const getSwitches = (id: string) => call<Switches & { ok: true; poem: string; source: string }>(`/api/switches/${enc(id)}`);
export const getQiraat = (id: string) => call<QiraatDoc>(`/api/qiraat/${enc(id)}`);
export const getQiraatIndex = (id: string) => call<QiraatIndex>(`/api/qiraat/${enc(id)}/index`);
/** `set` is a recording set: a matn id, or <id>-n<k> for edition k. */
export const getAudioManifest = (set: string) => call<AudioManifest>(`/api/audio/${enc(set)}`, { cache: 'default' });

/* ── admin ────────────────────────────────────────────────────────────── */

/** Resolves true when the password is right, false when it is wrong; throws when unreachable. */
export async function checkPassword(pw: string): Promise<boolean> {
  try { await call('/api/auth', { pw }); return true; }
  catch (e) { if (e instanceof ApiError && e.status === 401) return false; throw e; }
}

export interface SaveResult { ok: true; poem?: string; version: number; applied: number[]; skipped?: number[]; note?: string }
export const saveBayts = (pw: string, id: string, baseVersion: number | null, bayts: unknown[]) =>
  call<SaveResult>(`/api/poems/${enc(id)}`, { pw, method: 'PUT', json: { baseVersion, bayts } });

export interface CreateResult { ok: true; poem: string; version: number; created: boolean; replaced: boolean; verses: number; chapters: number }
export const putPoemDocument = (pw: string, id: string, doc: unknown, overwrite = false) =>
  call<CreateResult>(`/api/poems/${enc(id)}/document${overwrite ? '?overwrite=1' : ''}`, { pw, method: 'PUT', json: { doc } });

export interface QiraatSaveResult { ok: true; version: number; applied: number[]; removed: number[]; skipped: number[]; note?: string }
export const saveQiraat = (pw: string, id: string, baseVersion: number | null, cards: Record<string, unknown[] | null>) =>
  call<QiraatSaveResult>(`/api/qiraat/${enc(id)}`, { pw, method: 'PUT', json: { baseVersion, cards } });

export const saveSwitches = (pw: string, id: string, maps: Partial<Switches>) =>
  call<Switches & { ok: true; count: number; on: number; hidden: { tr: number; ur: number } }>(`/api/switches/${enc(id)}`, { pw, method: 'PUT', json: maps });

export const getReciters = (pw: string) => call<{ ok: true; reciters: Reciter[]; source: string }>('/api/reciters', { pw });
export const saveReciters = (pw: string, reciters: Reciter[]) =>
  call<{ ok: true; reciters: Reciter[] }>('/api/reciters', { pw, method: 'PUT', json: { reciters } });

/** The first bayt this reciter has not recorded yet in a set, and how many are done. */
export const nextRecording = (pw: string, set: string, reciter: string) =>
  call<{ ok: true; next: number | null; populated: number | null }>(`/api/recordings?poem=${enc(set)}&reciter=${enc(reciter)}`, { pw });

export interface StoredFile { key: string; url: string; size: number; uploadedAt: string }
export const listFiles = (pw: string, prefix = 'mutun/') => call<{ ok: true; files: StoredFile[] }>(`/api/files?prefix=${enc(prefix)}`, { pw });
export const deleteFiles = (pw: string, keys: string[]) =>
  call<{ ok: true; deleted: number }>('/api/files', { pw, method: 'DELETE', json: { keys } });

/** Upload query for one recording; the body is sent separately (XHR, for progress). */
export function recordingUploadUrl(set: string, bayt: number, reciter: string, ext: string, mime: string): string {
  return `/api/recordings?poem=${enc(set)}&bayt=${bayt}&reciter=${enc(reciter)}&ext=${enc(ext)}&mime=${enc(mime)}`;
}
