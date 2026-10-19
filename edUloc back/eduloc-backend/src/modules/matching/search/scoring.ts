/**
 * Scoring du tri sémantique (spec §6.4) — fonction pure, sans accès base. Il ne sert qu'à CLASSER des tuteurs déjà
 * éligibles : le niveau de diplôme n'y entre jamais et un score ne rend jamais un tuteur admissible.
 *
 *   bestSim       = max des similarités, toutes sources confondues
 *   corroboration = (nombre de sources distinctes dont sim ≥ bestSim − 0.10) − 1
 *   subjectBonus  = 0.03 si la matière demandée figure parmi les matières déclarées du tuteur
 *   ratingBonus   = 0.02 × noteBayésienne / 5,  noteBayésienne = (note × avis + 3.5 × 5) / (avis + 5)
 *   finalScore    = bestSim + 0.02 × corroboration + subjectBonus + ratingBonus
 */
export interface ScoringConfig {
  corroborationWeight: number;
  corroborationWindow: number;
  subjectBonus: number;
  ratingBonus: number;
  ratingPriorMean: number;
  ratingPriorWeight: number;
  /** Filtre de pertinence RELATIF : on garde finalScore ≥ meilleurScore − relevanceWindow. */
  relevanceWindow: number;
}

export const DEFAULT_SCORING: ScoringConfig = {
  corroborationWeight: 0.02,
  corroborationWindow: 0.1,
  subjectBonus: 0.03,
  ratingBonus: 0.02,
  ratingPriorMean: 3.5,
  ratingPriorWeight: 5,
  relevanceWindow: 0.15,
};

export type SourceType = 'PROFILE' | 'SUBJECT' | 'EXPERIENCE' | 'OFFER' | 'DOCUMENT';

/** Meilleure similarité d'un tuteur pour un type de source. */
export interface SourceSimilarity {
  sourceType: SourceType;
  sim: number;
  /** Libellé affichable (jamais d'extrait de document). */
  label: string;
}

export interface TutorScoreInput {
  tutorProfileId: string;
  sims: SourceSimilarity[];
  declaresRequestedSubject: boolean;
  rating: number;
  reviewsCount: number;
}

export interface TutorScore {
  tutorProfileId: string;
  bestSim: number;
  bestSource: SourceType;
  corroboration: number;
  subjectBonus: number;
  ratingBonus: number;
  finalScore: number;
  /** Les 2 meilleurs libellés distincts. */
  matchReasons: string[];
}

export const bayesianRating = (rating: number, reviewsCount: number, cfg: ScoringConfig): number =>
  (rating * reviewsCount + cfg.ratingPriorMean * cfg.ratingPriorWeight) / (reviewsCount + cfg.ratingPriorWeight);

export function scoreTutor(input: TutorScoreInput, cfg: ScoringConfig = DEFAULT_SCORING): TutorScore | null {
  if (input.sims.length === 0) return null;
  const sorted = [...input.sims].sort((a, b) => b.sim - a.sim || a.sourceType.localeCompare(b.sourceType));
  const best = sorted[0];
  const corroboration = sorted.filter((s) => s.sim >= best.sim - cfg.corroborationWindow).length - 1;
  const subjectBonus = input.declaresRequestedSubject ? cfg.subjectBonus : 0;
  const ratingBonus = (cfg.ratingBonus * bayesianRating(input.rating, input.reviewsCount, cfg)) / 5;
  const reasons: string[] = [];
  for (const s of sorted) {
    if (!reasons.includes(s.label)) reasons.push(s.label);
    if (reasons.length === 2) break;
  }
  return {
    tutorProfileId: input.tutorProfileId,
    bestSim: best.sim,
    bestSource: best.sourceType,
    corroboration,
    subjectBonus,
    ratingBonus,
    finalScore: best.sim + cfg.corroborationWeight * corroboration + subjectBonus + ratingBonus,
    matchReasons: reasons,
  };
}

/** Classe, applique le filtre de pertinence relatif puis garde les `limit` premiers (égalités : id croissant). */
export function rankTutors(inputs: TutorScoreInput[], limit: number, cfg: ScoringConfig = DEFAULT_SCORING): TutorScore[] {
  const scored = inputs
    .map((input) => scoreTutor(input, cfg))
    .filter((s): s is TutorScore => s !== null)
    .sort((a, b) => b.finalScore - a.finalScore || a.tutorProfileId.localeCompare(b.tutorProfileId));
  if (scored.length === 0) return [];
  const floor = scored[0].finalScore - cfg.relevanceWindow;
  return scored.filter((s) => s.finalScore >= floor).slice(0, limit);
}
