// Faithful TypeScript copies of the workbook's own formulas, verified on 2026-11-16:
//   Change reference G: =IF(EXACT(C,D),"Unchanged",IF(D="","Removed / blank",IF(C="","Added","Changed")))
//   Change reference H: =IF(B="EN","Not applicable",IF(EXACT(E,F),"Source unchanged","Recheck translation"))
//   Change reference K: =IF(AND(G="Unchanged",H<>"Recheck translation"),"No pending change",
//                         IF(D="","Review removal / blank",IF(AND(EXACT(I,D),EXACT(J,F)),"Approved — apply / acknowledge","Needs approval")))
//   Updates for Anabelle A5: =IFNA(FILTER('Change reference'!A5:L148,'Change reference'!K5:K148<>"No pending change"),"No changes since the saved reference")
//   Translation review E/G: =IF('Change reference'!H="Recheck translation","English changed — recheck translation",IF(D="","Not yet translated","Needs translation approval"))
// They are used to PREDICT what the Sheet will show after a write and to emulate the Sheet in the
// local sandbox. Live mode always re-reads the real Sheet to confirm.
import type { Lang } from './types';

export const UPDATES_FILTER_LAST_ROW = 148; // bound inside the Updates for Anabelle FILTER formula at capture

export function textChange(prev: string, cur: string): string {
  if (prev === cur) return 'Unchanged';
  if (cur === '') return 'Removed / blank';
  if (prev === '') return 'Added';
  return 'Changed';
}

export function translationCheck(lang: Lang, englishAtRef: string, currentEnglish: string): string {
  if (lang === 'EN') return 'Not applicable';
  return englishAtRef === currentEnglish ? 'Source unchanged' : 'Recheck translation';
}

export function action(g: string, h: string, current: string, approvedReplacement: string, approvedEnglish: string, currentEnglish: string): string {
  if (g === 'Unchanged' && h !== 'Recheck translation') return 'No pending change';
  if (current === '') return 'Review removal / blank';
  if (approvedReplacement === current && approvedEnglish === currentEnglish) return 'Approved — apply / acknowledge';
  return 'Needs approval';
}

export function translationStatus(h: string, translated: string): string {
  if (h === 'Recheck translation') return 'English changed — recheck translation';
  return translated === '' ? 'Not yet translated' : 'Needs translation approval';
}

export interface RefRowInput {
  lang: Lang;
  previous: string;
  current: string;
  englishAtRef: string;
  currentEnglish: string;
  approvedReplacement: string;
  approvedEnglish: string;
}

export function evaluateRefRow(r: RefRowInput) {
  const g = textChange(r.previous, r.current);
  const h = translationCheck(r.lang, r.englishAtRef, r.currentEnglish);
  const k = action(g, h, r.current, r.approvedReplacement, r.approvedEnglish, r.currentEnglish);
  return { textChange: g, translationCheck: h, action: k };
}
