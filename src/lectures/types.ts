/* A lesson, lecture or khuṭbah by the Shaykh, listed in src/lectures/registry.ts
   and shown on /lectures and in the home page's Lectures section. One may be
   recorded (media), written (its text on its own page), or both. */
export interface Lecture {
  /** Lowercase latin letters, digits and dashes; unique. Also the written page's address, /lectures/<id>. */
  id: string;
  /** English title. */
  title: string;
  /** Arabic title, if it has one. */
  titleAr?: string;
  /** What it is, shown as its label: a khuṭbah, a lesson, a lecture. */
  kind?: 'khutbah' | 'lesson' | 'lecture';
  /** The course or series it belongs to, e.g. "Explanation of al-Jazariyyah". */
  series?: string;
  /** Where it was given, e.g. "AMJA Imams’ Conference, Dallas". */
  place?: string;
  /** When it was given, yyyy-mm-dd (Gregorian). Newest first on the page. */
  date?: string;
  /** The Hijri date as the Shaykh gave it, e.g. "15 Rabīʿ al-Awwal 1448 AH". */
  dateHijri?: string;
  /** Length in minutes. */
  minutes?: number;
  /** One or two sentences: what it covers. */
  description?: string;
  /** Where it plays: a YouTube link (opens there), or an audio/video file —
      a same-origin /media/… path or any https URL — played on the page. */
  media?: { kind: 'youtube' | 'audio' | 'video'; url: string };
  /** It has a written text, content/lectures/<id>.json, read at /lectures/<id>. */
  written?: boolean;
  /** A matn on this site the lecture explains (its registry id), if any. */
  matn?: string;
}

/** Arabic, with its English under it. */
export interface Bilingual { ar: string; en: string }
/** A piece of text: English always; the Arabic too in an 'ar+en' text. */
export interface Para { ar?: string; en: string }

/** One block of a written lecture, in reading order. */
export type LectureBlock =
  /** a major division: the first or second khuṭbah */
  | ({ t: 'part' } & Para)
  /** a section heading */
  | ({ t: 'head' } & Para)
  /** a heading within a section, e.g. one of the kinds of heart */
  | ({ t: 'sub' } & Para)
  /** a paragraph */
  | ({ t: 'p' } & Para)
  /** an āyah (its Arabic in ﴿ ﴾), with its reference (sūrah and verse) */
  | ({ t: 'ayah'; ref?: Para } & Para)
  /** a hadith or a saying, with its source; `verse` sets it as poetry, one line per hemistich */
  | ({ t: 'quote'; ref?: Para; verse?: boolean } & Para)
  /** a short list, e.g. the khuṭbah's own summary of its points */
  | { t: 'list'; title?: Para; items: Para[] };

/** The written text of a lecture: content/lectures/<id>.json. */
export interface LectureText {
  title: Bilingual;
  /** 'ar+en' (the default): the Shaykh's Arabic with the English under every
      block. 'en': an English translation alone, until its Arabic is added. */
  languages?: 'ar+en' | 'en';
  /** Who translated it, when the translation is not this site's own. */
  translator?: string;
  /** The small line above the title, e.g. "A Friday Khuṭbah". */
  kicker?: Para;
  /** Who gave it, where and when, as the source has it, line by line. */
  byline: Para[];
  blocks: LectureBlock[];
}
