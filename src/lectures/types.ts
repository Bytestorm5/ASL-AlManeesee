/* A recorded lesson or lecture by the Shaykh, listed in src/lectures/registry.ts
   and shown on /lectures and in the home page's Lectures section. */
export interface Lecture {
  /** Lowercase latin letters, digits and dashes; unique. */
  id: string;
  /** English title. */
  title: string;
  /** Arabic title, if it has one. */
  titleAr?: string;
  /** The course or series it belongs to, e.g. "Explanation of al-Jazariyyah". */
  series?: string;
  /** When it was given, yyyy-mm-dd. Newest first on the page. */
  date?: string;
  /** Length in minutes. */
  minutes?: number;
  /** One or two sentences: what it covers. */
  description?: string;
  /** Where it plays: a YouTube link (opens there), or an audio/video file —
      a same-origin /media/… path or any https URL — played on the page. */
  media: { kind: 'youtube' | 'audio' | 'video'; url: string };
  /** A matn on this site the lecture explains (its registry id), if any. */
  matn?: string;
}
