/**
 * Types d'écran partagés. Convention : les VIEW MODELS (src/types/*) sont en minuscules
 * et portent des libellés prêts à afficher ; les DTO (src/api/contracts/dto.ts) sont le
 * contrat brut. Seuls les mappers (src/api/mappers.ts) passent de l'un à l'autre.
 *
 * Marqueurs :  [v1+] champ ajouté par l'alignement API v1
 *              [v1~] champ dont le type/le sens a changé
 *              [v1-] champ supprimé (voir AGENTS.md §6)
 */
export interface LevelRef {
  id: string; // [v1~] UUID EducationLevel (était "university" | "high_school"…)
  label: string;
  /** « Lycée », « Université »… (absent sur les niveaux imbriqués dans d'autres réponses). */
  category?: string;
  /** Diplôme minimal pour enseigner ce niveau. */
  requiredDegree?: DegreeId;
  /** Filière à choisir ensuite : série (Première, Terminale), mention (université) ou aucune. */
  trackKind?: "serie" | "mention" | null;
}
/** Sexe du tuteur : choisit sa silhouette par défaut (sans photo). */
export type TutorGender = "male" | "female";
export type DegreeId = "bac" | "licence" | "master" | "doctorat" | "other";
/** Format d'une séance individuelle. */
export type FormatId = "in_person" | "online";
/** Format d'une offre / préférence (TeachingFormat) */
export type LocationFormatId = "in_person" | "online" | "both";

/** Façons de donner un cours en présentiel : le tuteur se déplace chez l'élève, accueille chez lui, ou se retrouve dans un lieu public. */
export type InPersonModeId = "beneficiary_home" | "tutor_home" | "public_place";
export type AvatarTone = "primary" | "violet" | "accent" | "success" | "warning";
