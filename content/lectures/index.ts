/* The written lectures: each one's Arabic text with its English under every
   paragraph (or, with "languages": "en", an English translation until its
   Arabic is added), read at /lectures/<id> (src/pages/lectures/[id].astro). The
   registry entry (src/lectures/registry.ts, `written: true`) lists it; this
   file holds its words. Built into the page, so a change here is a deploy.
   Like content/index.ts, this folder is content, so it may name what it holds. */
import type { LectureText } from '../../src/lectures/types.ts';
import ahwalAlQulub from './ahwal-al-qulub.json';
import husnAlKhuluq from './husn-al-khuluq.json';
import fadailRamadan from './fadail-ramadan.json';
import hikamAlSiyam from './hikam-al-siyam.json';
import sunanEidAlFitr from './sunan-eid-al-fitr.json';
import alQabul from './al-qabul.json';
import qaswatAlQalb from './qaswat-al-qalb.json';
import alImanBilYawmAlAkhir from './al-iman-bil-yawm-al-akhir.json';
import tayyAlKawn from './tayy-al-kawn.json';
import nafkhatAlBath from './nafkhat-al-bath.json';
import ahwalAlNasFilHashr from './ahwal-al-nas-fil-hashr.json';
import dunuwwAlShams from './dunuww-al-shams.json';
import alShafaahAlUzma from './al-shafaah-al-uzma.json';
import alArdWalHisab from './al-ard-wal-hisab.json';
import tatayurAlSuhuf from './tatayur-al-suhuf.json';
import alMururAlaAlSirat from './al-murur-ala-al-sirat.json';
import khitamMashahidAlQiyamah from './khitam-mashahid-al-qiyamah.json';

export const LECTURE_TEXTS: Readonly<Record<string, LectureText>> = {
  'sunan-eid-al-fitr': sunanEidAlFitr as LectureText,
  'hikam-al-siyam': hikamAlSiyam as LectureText,
  'fadail-ramadan': fadailRamadan as LectureText,
  'husn-al-khuluq': husnAlKhuluq as LectureText,
  'ahwal-al-qulub': ahwalAlQulub as LectureText,
  'al-qabul': alQabul as LectureText,
  'qaswat-al-qalb': qaswatAlQalb as LectureText,
  'al-iman-bil-yawm-al-akhir': alImanBilYawmAlAkhir as LectureText,
  'tayy-al-kawn': tayyAlKawn as LectureText,
  'nafkhat-al-bath': nafkhatAlBath as LectureText,
  'ahwal-al-nas-fil-hashr': ahwalAlNasFilHashr as LectureText,
  'dunuww-al-shams': dunuwwAlShams as LectureText,
  'al-shafaah-al-uzma': alShafaahAlUzma as LectureText,
  'al-ard-wal-hisab': alArdWalHisab as LectureText,
  'tatayur-al-suhuf': tatayurAlSuhuf as LectureText,
  'al-murur-ala-al-sirat': alMururAlaAlSirat as LectureText,
  'khitam-mashahid-al-qiyamah': khitamMashahidAlQiyamah as LectureText,
};
