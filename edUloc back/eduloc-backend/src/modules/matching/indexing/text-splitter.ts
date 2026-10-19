/**
 * Découpage de textes en chunks (spec §5.3) : par titres de section d'abord, puis paragraphes, puis phrases.
 * Cible ≈ 400 tokens, maximum 500, chevauchement ≈ 15 % (dernières phrases du chunk précédent) uniquement
 * quand une section est coupée en plusieurs morceaux. Fonctions pures, sans tokenizer.
 */
export const TARGET_TOKENS = 400;
export const MAX_TOKENS = 500;
const OVERLAP_RATIO = 0.15;

/** Estimation sans tokenizer pour du texte français : ⌈caractères / 3,5⌉ (on garde une marge). */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 3.5);

/** Normalisation commune : Unicode NFC, espaces multiples réduits, lignes vides supprimées. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

/** Titre de section : ligne courte tout en majuscules, ou courte et terminée par « : ». */
export function isSectionTitle(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 60) return false;
  if (trimmed.endsWith(':')) return true;
  const letters = trimmed.replace(/[^\p{L}]/gu, '');
  return letters.length >= 3 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

export interface TextSection {
  title: string | null;
  body: string;
}

/** Sépare le texte en sections selon ses titres ; le texte avant le premier titre forme une section sans titre. */
export function splitSections(text: string): TextSection[] {
  const sections: TextSection[] = [];
  let current: TextSection = { title: null, body: '' };
  for (const line of normalizeText(text).split('\n')) {
    if (isSectionTitle(line)) {
      if (current.body.trim() || current.title) sections.push(current);
      current = { title: line.replace(/:$/, '').trim(), body: '' };
    } else {
      current.body += (current.body ? '\n' : '') + line;
    }
  }
  if (current.body.trim() || current.title) sections.push(current);
  return sections.filter((s) => s.body.trim().length > 0);
}

const splitSentences = (text: string): string[] =>
  text.split(/(?<=[.!?…])\s+|\n/u).map((s) => s.trim()).filter(Boolean);

/** Coupe une chaîne trop longue sans espace (cas pathologique) en morceaux de taille maximale. */
function hardCut(text: string, maxChars: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) parts.push(text.slice(i, i + maxChars));
  return parts;
}

/**
 * Découpe un corps de texte en morceaux de ≤ `maxTokens` : paragraphes, puis phrases ; recouvrement d'environ 15 %
 * (dernières phrases du morceau précédent) quand le corps est coupé. Un corps qui tient en un morceau est rendu tel quel.
 */
export function splitBody(body: string, maxTokens: number = TARGET_TOKENS): string[] {
  const text = normalizeText(body);
  if (!text) return [];
  if (estimateTokens(text) <= maxTokens) return [text];

  const maxChars = Math.floor(maxTokens * 3.5);
  // Unités atomiques : paragraphes, sinon phrases, sinon coupe forcée.
  const units: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (estimateTokens(paragraph) <= maxTokens) {
      units.push(paragraph);
      continue;
    }
    for (const sentence of splitSentences(paragraph)) {
      if (sentence.length <= maxChars) units.push(sentence);
      else units.push(...hardCut(sentence, maxChars));
    }
  }

  const overlapChars = Math.floor(maxChars * OVERLAP_RATIO);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;
  for (const unit of units) {
    if (currentLen + unit.length + 1 > maxChars && current.length) {
      chunks.push(current.join('\n'));
      // Recouvrement : on reprend les dernières unités tant qu'elles tiennent dans ≈ 15 % de la taille cible.
      const carry: string[] = [];
      let carryLen = 0;
      for (let i = current.length - 1; i >= 0 && carryLen + current[i].length <= overlapChars; i -= 1) {
        carry.unshift(current[i]);
        carryLen += current[i].length + 1;
      }
      // Si le recouvrement empêche l'unité suivante de tenir, on l'abandonne (pas de morceau fait du seul recouvrement).
      const fits = carryLen + unit.length + 1 <= maxChars;
      current = fits ? carry : [];
      currentLen = fits ? carryLen : 0;
    }
    current.push(unit);
    currentLen += unit.length + 1;
  }
  if (current.length) chunks.push(current.join('\n'));
  return chunks;
}
