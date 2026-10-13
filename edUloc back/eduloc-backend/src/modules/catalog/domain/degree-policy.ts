/**
 * Qualification d'un tuteur : son plus haut diplôme fixe les niveaux qu'il peut enseigner.
 * Un titulaire d'un master enseigne aussi au lycée (rang supérieur ⇒ niveaux inférieurs permis) ;
 * l'inverse est refusé : un bachelier n'enseigne pas à l'université.
 */
export const DEGREES = ['BAC', 'LICENCE', 'MASTER', 'DOCTORAT', 'OTHER'] as const;
export type Degree = (typeof DEGREES)[number];

/** « Autre » (diplôme non listé) est traité comme le Bac : le plafond le plus prudent. */
const RANK: Record<string, number> = { BAC: 1, OTHER: 1, LICENCE: 2, MASTER: 3, DOCTORAT: 4 };

export const degreeRank = (degree?: string | null): number => RANK[degree ?? ''] ?? 1;

export const canTeachLevel = (degree: string | null | undefined, requiredDegree: string): boolean =>
  degreeRank(degree) >= degreeRank(requiredDegree);

/** Minuscules, sans accents ni ponctuation : « Algèbre-Linéaire » ≡ « algebre lineaire ». */
export const normalizeSkillName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Une compétence s'enseigne à un niveau si sa liste de catégories est vide (tous niveaux) ou le contient. */
export const subjectCoversCategory = (levelCategories: string[], category: string): boolean =>
  levelCategories.length === 0 || levelCategories.includes(category);
