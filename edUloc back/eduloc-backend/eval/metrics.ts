/**
 * Métriques d'évaluation du matching (spec §10) : recall@K et nDCG@K, fonctions pures.
 * Pertinence graduée : 2 = très pertinent, 1 = pertinent, absent/0 = non pertinent.
 */
export type Relevance = Record<string, number>;

/** Part des tuteurs pertinents (pertinence ≥ 1) retrouvés dans les K premiers résultats. */
export function recallAtK(ranked: string[], relevant: Relevance, k = 10): number {
  const relevantIds = Object.entries(relevant).filter(([, rel]) => rel >= 1).map(([id]) => id);
  if (relevantIds.length === 0) return 1; // rien à retrouver : pas de pénalité
  const top = new Set(ranked.slice(0, k));
  return relevantIds.filter((id) => top.has(id)).length / relevantIds.length;
}

const gain = (rel: number) => 2 ** rel - 1;
const discount = (position: number) => 1 / Math.log2(position + 2);

/** nDCG@K avec gain exponentiel (2^rel − 1) ; l'idéal range tous les tuteurs pertinents par pertinence décroissante. */
export function ndcgAtK(ranked: string[], relevant: Relevance, k = 10): number {
  const dcg = ranked.slice(0, k).reduce((sum, id, i) => sum + gain(relevant[id] ?? 0) * discount(i), 0);
  const ideal = Object.values(relevant).sort((a, b) => b - a).slice(0, k)
    .reduce((sum, rel, i) => sum + gain(rel) * discount(i), 0);
  return ideal === 0 ? 1 : dcg / ideal;
}

export const mean = (values: number[]): number => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

export function quantile(values: number[], q: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
