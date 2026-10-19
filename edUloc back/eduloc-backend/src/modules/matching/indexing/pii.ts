/**
 * Retrait des données personnelles inutiles au matching, AVANT tout embedding (spec §5.3 et §9) :
 * e-mails, numéros de téléphone, adresses postales, numéros d'identité / CIN, dates de naissance, numéros de diplôme.
 * Regex + liste noire ; volontairement prudent : une année ou une période (« 2022-2024 ») ne doit jamais être retirée.
 */
const PLACEHOLDER = '';

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
/** International (+261 34 12 345 67) puis local malgache/français (034 12 345 67, 06 12 34 56 78). */
const PHONE_INTL = /\+\d{1,3}[\s.-]?\d(?:[\s.-]?\d){6,11}/g;
const PHONE_LOCAL = /(?<![\d/])0\d{1,2}(?:[\s.-]?\d{2,3}){3,4}(?![\d/])/g;
/** CIN malgache : 12 chiffres (groupés par 3 ou non). */
const CIN_GROUPED = /(?<!\d)\d{3}[\s.-]?\d{3}[\s.-]?\d{3}[\s.-]?\d{3}(?!\d)/g;
/** « N° de diplôme : XXXX », « CIN : ... », « numéro d'identité ... » : on retire l'identifiant qui suit. */
const LABELLED_ID =
  /\b(?:n[°o]\s*(?:de\s+)?(?:dipl[oô]me|cin|carte|passeport|identit[eé])|num[eé]ro\s+(?:de\s+|d['’])?(?:dipl[oô]me|cin|carte|passeport|identit[eé])|cin|cni|passeport)\s*[:\-]?\s*[A-Z0-9][A-Z0-9 ./-]{3,}/gi;
/** « Né(e) le 12/03/1998 à Fianarantsoa », « Date de naissance : 12 mars 1998 ». */
const BIRTH =
  /\b(?:n[ée]e?\s+le|date\s+de\s+naissance|n[ée]e?\s+en)\s*[:\-]?\s*(?:\d{1,2}[\s/.-]+(?:\d{1,2}|[\p{L}]+)[\s/.-]+)?\d{4}(?:\s+(?:à|a|au)\s+[\p{L}' -]+)?/giu;
/** Adresse postale : « 12 rue ... », « Lot IVG 12 Ambohijatovo », « BP 123 ». */
const ADDRESS =
  /\b(?:\d{1,4}\s*(?:bis\s+)?(?:rue|avenue|av\.|boulevard|bd|chemin|route|impasse|allée)\s+[^,.;\n]{2,60}|lot\s+[A-Z0-9]{1,6}\s*\d{0,4}[^,.;\n]{0,50}|b\.?p\.?\s*\d{1,6})/giu;

/** Liste noire : mentions entières à retirer (en minuscules, comparées sans accent ni casse). */
const BLACKLIST_LINES = [/^\s*(?:adresse|domicile|t[ée]l[ée]phone|t[ée]l|mobile|e-?mail|courriel|facebook|whatsapp)\s*:.*$/gimu];

export function scrubPii(text: string): string {
  let out = text;
  for (const re of BLACKLIST_LINES) out = out.replace(re, PLACEHOLDER);
  out = out
    .replace(EMAIL, PLACEHOLDER)
    .replace(LABELLED_ID, PLACEHOLDER)
    .replace(BIRTH, PLACEHOLDER)
    .replace(ADDRESS, PLACEHOLDER)
    .replace(PHONE_INTL, PLACEHOLDER)
    .replace(CIN_GROUPED, PLACEHOLDER)
    .replace(PHONE_LOCAL, PLACEHOLDER);
  return out;
}
