/* Site-wide identity: every name, link and colour that is not about a single
   matn. Pages, the web manifest, the service worker, the share text under a
   copied bayt and the generated robots/sitemap all read from here, so a
   rebrand is an edit to this one file.

   Per-matn details (titles, author, accent colour, which features it uses)
   live in src/poems/registry.ts instead. */

export const SITE = {
  /** Public origin, no trailing slash. Canonical URLs, sitemap, share text.
      Can be overridden at build time with SITE_URL (e.g. for a staging host). */
  url: 'https://almaneesee.al-asl.com',
  /** Hosts that must never be indexed (staging copies of the site). */
  noindexHosts: [] as string[],

  /** The installed app's name (home screen, task switcher). Keep it short. */
  appName: 'AlManeesee',
  /** Used in <title> after the page name, e.g. "Guide · al-Asl AlManeesee". */
  titleSuffix: 'al-Asl AlManeesee',
  /** The collection, as the home page hero presents it. */
  collection: {
    ar: 'المُتُون',
    en: 'The Mutūn Collection',
    eyebrow: 'al-Asl Institute · The Mutūn Collection',
    description:
      'Classical source texts, presented verse by verse with translation, commentary, recitation and memorization tools. An al-Asl Institute resource.',
  },

  org: {
    name: 'al-Asl Institute',
    url: 'https://www.al-asl.com/',
    tagline: 'Exploring the roots of knowledge',
    motto: 'Rooted in wisdom, flourishing in knowledge.',
    ogImage: 'https://www.al-asl.com/wp-content/uploads/2025/04/6.png',
    links: [
      { label: 'Home', href: 'https://www.al-asl.com/' },
      { label: 'Courses', href: 'https://www.al-asl.com/courses/' },
      { label: 'Books', href: 'https://www.al-asl.com/books/' },
      { label: 'Lectures', href: 'https://www.al-asl.com/lecture-series/' },
      { label: 'Contact', href: 'https://www.al-asl.com/contact/' },
    ],
  },

  /** Short links served by the site itself (/android → the Play Store, …).
      Leave a value empty and that redirect is simply not generated. */
  shortLinks: {
    android: '',
    ios: '',
    whatsapp: '',
  } as Record<string, string>,

  /** Store badges on the home page; shown only when the matching link is set. */
  stores: {
    googlePlay: '',
    appStore: '',
  },

  theme: {
    /** Browser chrome / status bar (light, dark). */
    color: '#5e2c30',
    colorDark: '#17110f',
    /** Splash and launch background — must match the manifest. */
    background: '#f9f4ea',
  },

  /** Cloudflare Web Analytics beacon token. Empty = no analytics script. */
  analyticsToken: '',
} as const;

export function pageTitle(name?: string): string {
  return name ? `${name} · ${SITE.titleSuffix}` : SITE.titleSuffix;
}

/** The origin without its scheme, as it appears in share text. */
export function siteHost(): string {
  return SITE.url.replace(/^https?:\/\//, '');
}
