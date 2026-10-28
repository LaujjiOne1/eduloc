/**
 * Classement FINAL des tuteurs déjà éligibles et jugés pertinents (décision produit du 2026-10-22). Fonction pure.
 *
 *   score final = 0,60 × pédagogie (score sémantique) + 0,20 × disponibilité + 0,10 × proximité + 0,10 × qualité
 *
 * Séparation stricte : le modèle sémantique ne voit JAMAIS la distance (elle n'entre pas dans le texte d'embedding) et
 * ce classement ne rend jamais un tuteur admissible : il ne fait que RÉORDONNER les tuteurs retenus par la
 * présélection SQL et le filtre de pertinence. Les filtres durs (tuteur disponible, salle disponible, salle dans la
 * zone du tuteur) sont appliqués ailleurs, avant.
 */
export interface FinalScoreWeights {
  pedagogy: number;
  availability: number;
  proximity: number;
  quality: number;
}

export const DEFAULT_FINAL_WEIGHTS: FinalScoreWeights = { pedagogy: 0.6, availability: 0.2, proximity: 0.1, quality: 0.1 };

export interface FinalScoreInput {
  tutorProfileId: string;
  /** Score sémantique du tuteur (TutorScore.finalScore) : comparable seulement au sein d'une même recherche. */
  semanticScore: number;
  /** Nombre de créneaux libres proposés (0 à `maxSlots`) et délai avant le premier, en heures. */
  slotsCount: number;
  firstSlotInHours: number | null;
  /** 0..1 ; null = inconnu (pas de position du demandeur) ou sans objet. */
  proximity: number | null;
  rating: number;
  reviewsCount: number;
  /** Prix de l'offre la moins chère compatible avec la demande (même devise pour tous). */
  price: number | null;
}

export interface FinalScoreOptions {
  weights?: FinalScoreWeights;
  /** Nombre maximal de créneaux proposés par tuteur. */
  maxSlots: number;
  /** Fenêtre de recherche des créneaux (heures) : au-delà, la rapidité ne compte plus. */
  windowHours: number;
  ratingPriorMean: number;
  ratingPriorWeight: number;
}

export interface FinalScore {
  tutorProfileId: string;
  final: number;
  parts: { pedagogy: number; availability: number; proximity: number | null; quality: number };
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Pondérations renormalisées si la proximité est inconnue pour tout le monde (demandeur sans position). */
function effectiveWeights(w: FinalScoreWeights, hasProximity: boolean): FinalScoreWeights {
  if (hasProximity) return w;
  const rest = w.pedagogy + w.availability + w.quality;
  return { pedagogy: w.pedagogy / rest, availability: w.availability / rest, proximity: 0, quality: w.quality / rest };
}

export function rankByFinalScore(inputs: FinalScoreInput[], opts: FinalScoreOptions): FinalScore[] {
  if (!inputs.length) return [];
  const weights = opts.weights ?? DEFAULT_FINAL_WEIGHTS;
  const hasProximity = inputs.some((i) => i.proximity !== null);
  const w = effectiveWeights(weights, hasProximity);

  // Pédagogie : le score sémantique est ramené à [0, 1] DANS la recherche (le meilleur vaut 1, le moins bon des retenus 0).
  const sems = inputs.map((i) => i.semanticScore);
  const lo = Math.min(...sems);
  const hi = Math.max(...sems);
  const pedagogyOf = (s: number): number => (hi === lo ? 1 : (s - lo) / (hi - lo));

  const medianPrice = median(inputs.flatMap((i) => (i.price !== null && i.price > 0 ? [i.price] : [])));

  const scored = inputs.map((i): FinalScore => {
    const pedagogy = pedagogyOf(i.semanticScore);

    const slotShare = clamp01(i.slotsCount / Math.max(1, opts.maxSlots));
    const soonness = i.firstSlotInHours === null ? 0 : clamp01(1 - i.firstSlotInHours / Math.max(1, opts.windowHours));
    const availability = i.slotsCount > 0 ? 0.6 * slotShare + 0.4 * soonness : 0;

    // Qualité : note bayésienne (peu d'avis → proche de la moyenne a priori) et tarif relatif à la médiane des retenus.
    const bayes = (i.rating * i.reviewsCount + opts.ratingPriorMean * opts.ratingPriorWeight) / (i.reviewsCount + opts.ratingPriorWeight);
    const affordability = i.price !== null && i.price > 0 && medianPrice !== null ? clamp01(medianPrice / i.price) : 0.5;
    const quality = 0.6 * clamp01(bayes / 5) + 0.4 * affordability;

    const proximityPart = i.proximity === null ? 0 : clamp01(i.proximity);
    const final = w.pedagogy * pedagogy + w.availability * availability + w.proximity * proximityPart + w.quality * quality;
    return { tutorProfileId: i.tutorProfileId, final, parts: { pedagogy, availability, proximity: i.proximity, quality } };
  });

  return scored.sort((a, b) => b.final - a.final || a.tutorProfileId.localeCompare(b.tutorProfileId));
}

/** Proximité 0..1 : 1 sur place, 0 au-delà du rayon choisi par le demandeur. */
export function proximityScore(distanceM: number, radiusM: number): number {
  return clamp01(1 - distanceM / Math.max(1, radiusM));
}
