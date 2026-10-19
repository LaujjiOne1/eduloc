import { scrubPii } from './pii';
import { normalizeText } from './text-splitter';

/** Numéro de page seul : « 3 », « Page 3 », « 3 / 12 », « - 3 - ». */
const PAGE_NUMBER = /^\s*[-–]?\s*(?:page\s*)?\d{1,3}(?:\s*(?:\/|sur|of)\s*\d{1,3})?\s*[-–]?\s*$/i;
/** Une ligne courte qui revient sur plusieurs pages est un en-tête / pied de page. */
const REPEATED_MIN_OCCURRENCES = 3;
const REPEATED_MAX_LENGTH = 80;

/**
 * Nettoyage d'un texte extrait AVANT découpage (spec §5.3) : retrait des données personnelles inutiles au matching
 * (e-mails, téléphones, adresses, CIN, dates de naissance, numéros de diplôme), des en-têtes et pieds de page répétés,
 * des numéros de page et des lignes de moins de 3 caractères.
 */
export function cleanExtractedText(raw: string): string {
  const lines = normalizeText(raw).split('\n');
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);

  const kept = lines.filter((line) => {
    if (line.length < 3) return false;
    if (PAGE_NUMBER.test(line)) return false;
    if (line.length <= REPEATED_MAX_LENGTH && (counts.get(line) ?? 0) >= REPEATED_MIN_OCCURRENCES) return false;
    return true;
  });
  // Les données personnelles sont retirées après le filtre de lignes : un en-tête répété est supprimé tel quel.
  return normalizeText(scrubPii(kept.join('\n')));
}
