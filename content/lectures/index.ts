/* The written lectures: each one's Arabic text with its English under every
   paragraph (or, with "languages": "en", an English translation until its
   Arabic is added), read at /lectures/<id> (src/pages/lectures/[id].astro). The
   registry entry (src/lectures/registry.ts, `written: true`) lists it; this
   file holds its words. Built into the page, so a change here is a deploy.
   Like content/index.ts, this folder is content, so it may name what it holds. */
import type { LectureText } from '../../src/lectures/types.ts';
import ahwalAlQulub from './ahwal-al-qulub.json';
import husnAlKhuluq from './husn-al-khuluq.json';
import alQabul from './al-qabul.json';

export const LECTURE_TEXTS: Readonly<Record<string, LectureText>> = {
  'husn-al-khuluq': husnAlKhuluq as LectureText,
  'ahwal-al-qulub': ahwalAlQulub as LectureText,
  'al-qabul': alQabul as LectureText,
};
