/* The handful of values the page scripts share through `window`.

   Most features import each other directly; these stay global for one of two
   reasons. Some are set by a script that is not a module — the verse data
   (/api/poems/<id>/data.js, a blocking classic script) and the pre-paint
   bootstraps in <head>. The rest are optional hooks between features that may
   or may not be on a given page (the app shell asks "is there a search?",
   "is there an offline manager?") and must not force the other to load. */
import type { AudioReciter, Chapter, PoemConfig, VerseVariant } from '../poems/types.ts';

export interface AslPoemContext {
  /** Registered id of the matn on this page. */
  poem: string;
  config: PoemConfig;
  /** The chapters array the page rendered from (patched in place by the data loader). */
  snapshot: Chapter[];
  snapshotVersion: number;
  onStructuralChange?: (doc: { chapters: Chapter[] }) => void;
  onPatched?: (bayts: number[]) => void;
}

export interface AslExplanationApi {
  BTN: string;
  langs(v: { exp?: unknown } | null | undefined): string[];
  card(v: { exp?: unknown; expBy?: string }, defaultBy?: string): string;
  applyLang(l: string): void;
  readonly lang: string;
}

export interface AslSwitchMaps {
  enabled: Record<string, boolean>;
  trHidden: Record<string, boolean>;
  urHidden: Record<string, boolean>;
}

declare global {
  interface Window {
    /* ── set by /api/poems/<id>/data.js ── */
    ASL_CH?: Chapter[];
    ASL_CH_V?: number;
    ASL_VARIANTS?: Record<string, Record<string, VerseVariant>> | null;

    /* ── set by the reading page renderer ── */
    ASL_POEM?: AslPoemContext;
    /** Which recording set the player reads (edition-aware). */
    ASL_AUDIO_POEM?: string;
    AslNuskha?: { names: string[]; active: number; set(i: number | string): void };

    /* ── feature hooks ── */
    ASLExp?: AslExplanationApi;
    ASLSwitches?: { get(poem: string): Promise<AslSwitchMaps>; apply(maps: AslSwitchMaps): void };
    ASLData?: {
      boot(cfg: AslPoemContext): void;
      manifest(): Promise<import('../poems/types.ts').Manifest | null>;
      fetchQiraat(poem: string): Promise<Record<string, unknown[]> | null>;
      fetchQiraatIndex(poem: string): Promise<number[] | null>;
    };
    AslSearch?: { open(): void; close?(): void };
    AslAudio?: Record<string, unknown>;
    AslOffline?: Record<string, unknown>;
    AslScrollSettle?: (el: Element, offset: number) => void;
    AslChapterJump?: { open(): void };
    AslRefreshHomeGoals?: () => void;
    AppTheme?: {
      mode(): 'auto' | 'light' | 'dark';
      resolved(m?: string): 'light' | 'dark';
      set(m: 'auto' | 'light' | 'dark'): void;
      apply(): void;
    };
    __aslStorageNotice?: boolean;
    __aslViewportNotice?: boolean;

    /* vendor-prefixed / legacy browser APIs some features feature-detect */
    webkitAudioContext?: typeof AudioContext;
    clipboardData?: DataTransfer;
  }
  interface Navigator { standalone?: boolean }
  interface HTMLElement {
    /** Set by memorize mode on a hemistich it has tokenised; other features leave it alone. */
    _mzTok?: unknown;
  }
}

export {};
