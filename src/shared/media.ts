/* Recordings: where they live in R2, which formats are accepted, and how a key
   is read back. Shared by the upload/file-manager routes and the admin pages.

   Layout: mutun/<set>/<bayt>/<reciter>/<timestamp>.<ext>
     <set> is a recording set — a matn id, or "<id>-n<k>" for edition k (see
     audioSetsOf in src/poems). The timestamp sorts chronologically, so for any
     (reciter, bayt) the newest upload wins and a re-recorded bayt replaces the
     old one without any cleanup.

   Everything a reader can play is served same-origin from /media/<key>. */

export const RECORDINGS_PREFIX = 'mutun/';
/** Registry of who may be selected on the upload form, edited in the file manager. */
export const RECITERS_KEY = 'mutun/reciters.json';
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Lower-case latin slug for ids and path segments. */
export function slug(s: unknown): string {
  return String(s ?? '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

/** Accepted (browser-playable) audio formats, with aliases normalised. */
export const AUDIO_EXTS: Record<string, string> = {
  mp3: 'mp3', mpeg: 'mp3', mpga: 'mp3', m4a: 'm4a', m4b: 'm4a', aac: 'aac',
  mp4: 'mp4', wav: 'wav', ogg: 'ogg', oga: 'ogg', opus: 'opus', webm: 'webm', weba: 'webm', flac: 'flac',
};
export const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', mp4: 'audio/mp4', wav: 'audio/wav',
  ogg: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac',
};
/** The canonical extension, or null when the format is unsupported. */
export function extOk(e: unknown): string | null {
  return AUDIO_EXTS[String(e ?? '').toLowerCase()] ?? null;
}
export function mimeOk(m: unknown, ext?: string | null): string {
  const s = String(m ?? '');
  if (/^[-\w.+]+\/[-\w.+]+$/.test(s)) return s;
  return (ext && AUDIO_MIME[ext]) || 'application/octet-stream';
}

export interface RecordingKey { set: string; bayt: number; reciter: string; file: string }
const KEY_RE = /^mutun\/([^/]+)\/(\d+)\/([^/]+)\/([^/]+)$/;
export function parseRecordingKey(key: string): RecordingKey | null {
  const m = KEY_RE.exec(String(key || ''));
  if (!m) return null;
  return { set: m[1]!, bayt: parseInt(m[2]!, 10), reciter: m[3]!, file: m[4]! };
}
export function recordingKey(set: string, bayt: number, reciter: string, ext: string, when = new Date()): string {
  const stamp = when.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 20);
  return `${RECORDINGS_PREFIX}${set}/${bayt}/${reciter}/${stamp}.${ext}`;
}

/** The URL a stored object is served at. Keys are path-safe by construction. */
export function mediaUrl(key: string): string {
  return '/media/' + key.split('/').map(encodeURIComponent).join('/');
}
