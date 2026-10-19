/**
 * Format du texte envoyé à EmbeddingGemma 2 (spec §1) : les préfixes de tâche sont OBLIGATOIRES et ne
 * s'appliquent qu'au texte. Fonctions pures : le service d'embedding n'ajoute jamais de préfixe lui-même.
 */

/** Document indexé : `title: {titre} | text: {contenu}` (`title: none` sans titre). */
export const formatDocument = (title: string | null | undefined, text: string): string =>
  `title: ${title?.trim() || 'none'} | text: ${text}`;

/** Requête de recherche : `task: search result | query: {requête}`. */
export const formatQuery = (query: string): string => `task: search result | query: ${query}`;

/** Un vecteur valide a exactement `dim` valeurs finies (ni NaN ni Infinity). */
export function assertValidVector(vector: unknown, dim: number): asserts vector is number[] {
  if (!Array.isArray(vector) || vector.length !== dim) {
    throw new Error(`Embedding invalide : ${Array.isArray(vector) ? vector.length : typeof vector} valeurs au lieu de ${dim}.`);
  }
  for (const v of vector) {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('Embedding invalide : valeur non numérique (NaN ou Infinity).');
  }
}

/** Normalisation L2 de sécurité (la similarité cosinus ne change pas ; un vecteur nul est refusé). */
export function l2Normalize(vector: number[]): number[] {
  let sum = 0;
  for (const v of vector) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm === 0) throw new Error('Embedding invalide : vecteur nul.');
  return vector.map((v) => v / norm);
}

/** Forme attendue par pgvector pour un paramètre lié : `'[0.1,...]'::vector`. */
export const toPgVector = (vector: number[]): string => JSON.stringify(vector);
