import type { DegreeId, LevelRef } from "@/types/common";
import type { TutorSkill } from "@/types/tutor-application";

/**
 * Miroir de la politique de qualification du serveur (le serveur reste l'autorité : il refuse
 * LEVEL_NOT_QUALIFIED / SUBJECT_LEVEL_MISMATCH). Ici, on n'affiche que ce qui sera accepté.
 *
 * Un titulaire d'un diplôme plus élevé enseigne aussi les niveaux inférieurs (un master peut enseigner au lycée) ;
 * « Autre » est traité comme le Bac, le plafond le plus prudent.
 */
const RANK: Record<DegreeId, number> = { bac: 1, other: 1, licence: 2, master: 3, doctorat: 4 };

export const degreeRank = (degree: DegreeId | null | undefined): number => (degree ? RANK[degree] : 1);

export function canTeachLevel(degree: DegreeId | null | undefined, level: LevelRef): boolean {
  // Niveau sans diplôme requis connu (donnée imbriquée) : on laisse le serveur trancher.
  return !level.requiredDegree || degreeRank(degree) >= degreeRank(level.requiredDegree);
}

/** Niveaux proposables pour une compétence : bornés par le diplôme ET par les niveaux où la matière a un sens. */
export function levelsForSkill(levels: LevelRef[], skill: TutorSkill, degree: DegreeId | null | undefined): LevelRef[] {
  return levels.filter(
    (level) =>
      canTeachLevel(degree, level) &&
      (skill.levelCategories.length === 0 || !level.category || skill.levelCategories.includes(level.category)),
  );
}

/** Minuscules, sans accents ni ponctuation (même règle que le serveur) : « Algèbre-Linéaire » ≡ « algebre lineaire ». */
export function normalizeSkillName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
