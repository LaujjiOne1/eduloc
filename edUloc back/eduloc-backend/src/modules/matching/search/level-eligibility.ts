import { ACADEMIC_RANK, UNIVERSITY_CATEGORY } from '../../catalog/domain/academic-scale';

/**
 * Éligibilité hiérarchique de niveau (exigences E4 à E8) — décidée par le backend, EN SQL, AVANT tout calcul
 * sémantique ; aucun LLM, aucun score de similarité n'y participe (E1). Cette fonction pure est la table de
 * référence : la requête SQL de la Phase 1 en applique le seuil `minimumTutorRank`, et les tests vérifient que
 * les deux concordent sur la matrice complète.
 *
 *   L1  → tuteurs L2, L3, M1, M2, Doctorat        M1 → tuteurs M2, Doctorat
 *   L2  → tuteurs L3, M1, M2, Doctorat            M2 → tuteurs Doctorat (ou expert validé, fixé au niveau Doctorat)
 *   L3  → tuteurs M1, M2, Doctorat                Doctorat → tuteurs Doctorat (choix par défaut, E7)
 */
export const FIRST_UNIVERSITY_RANK = ACADEMIC_RANK.L1;

/** Rang minimal du niveau académique VALIDÉ du tuteur pour une demande universitaire de rang `requestRank`. */
export function minimumTutorRank(requestRank: number): number {
  // E5 : rang STRICTEMENT supérieur. E7 : pour une demande Doctorat (rien au-dessus), seuls les Doctorat.
  return Math.min(requestRank + 1, ACADEMIC_RANK.DOCTORAT);
}

export interface TutorAcademicLevel {
  rank: number | null;
  category: string | null;
}

/**
 * Le tuteur est-il éligible pour une demande universitaire de rang `requestRank` ?
 * Faux sans niveau VALIDÉ (jamais éligible à l'université), hors du bloc universitaire, ou de rang insuffisant.
 * Une demande hors échelle (rang null, ex. « Formation pro ») n'a aucun tuteur éligible.
 */
export function isTutorEligible(requestRank: number | null, tutorLevel: TutorAcademicLevel | null): boolean {
  if (requestRank === null || requestRank < FIRST_UNIVERSITY_RANK) return false;
  if (!tutorLevel || tutorLevel.rank === null) return false;
  if (tutorLevel.category !== UNIVERSITY_CATEGORY) return false;
  return tutorLevel.rank >= minimumTutorRank(requestRank);
}

export type Format = 'ONLINE' | 'IN_PERSON' | 'BOTH';

/** Compatibilité de format (spec §6.2) : ONLINE → ONLINE|BOTH ; IN_PERSON → IN_PERSON|BOTH ; BOTH/absent → tout. */
export function allowedFormats(requested: Format | null | undefined): Format[] {
  if (requested === 'ONLINE') return ['ONLINE', 'BOTH'];
  if (requested === 'IN_PERSON') return ['IN_PERSON', 'BOTH'];
  return ['ONLINE', 'IN_PERSON', 'BOTH'];
}
