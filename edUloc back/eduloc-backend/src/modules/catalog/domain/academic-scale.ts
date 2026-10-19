/**
 * Échelle académique ordonnée du matching (exigence E2) :
 *   Primaire < Collège < Lycée/Bac < L1 < L2 < L3 < M1 < M2 < Doctorat.
 *
 * Le rang est stocké sur `EducationLevel.academicRank` (rempli par la migration d'après les libellés du catalogue).
 * Il ne se déduit JAMAIS de `displayOrder`, qui sert à l'affichage et peut être réordonné.
 * Ce fichier est la source de vérité côté code ; la migration SQL en est la copie, vérifiée par les tests.
 */
export const ACADEMIC_STEPS = [
  'PRIMAIRE',
  'COLLEGE',
  'LYCEE_BAC',
  'L1',
  'L2',
  'L3',
  'M1',
  'M2',
  'DOCTORAT',
] as const;
export type AcademicStep = (typeof ACADEMIC_STEPS)[number];

/** Rang de chaque marche : 1 pour Primaire … 9 pour Doctorat. */
export const ACADEMIC_RANK: Readonly<Record<AcademicStep, number>> = {
  PRIMAIRE: 1,
  COLLEGE: 2,
  LYCEE_BAC: 3,
  L1: 4,
  L2: 5,
  L3: 6,
  M1: 7,
  M2: 8,
  DOCTORAT: 9,
};

/** Niveaux de diplôme que peut retenir une équivalence (valeurs de `TutorProfile.highestDegree` des flux existants). */
export const EQUIVALENT_DEGREES = ['BAC', 'LICENCE', 'MASTER', 'DOCTORAT'] as const;

export const UNIVERSITY_CATEGORY = 'Université';

/** Un tuteur ne peut être validé qu'à partir du Lycée/Bac (en dessous, le rang n'a pas de sens pour un tuteur). */
export const MIN_TUTOR_ACADEMIC_RANK = ACADEMIC_RANK.LYCEE_BAC;

/**
 * Libellés réels du catalogue `education_levels` (catégorie, nom) → marche de l'échelle.
 * `name: null` = toute la catégorie. Un niveau absent de cette table est hors échelle (rang NULL), par exemple
 * « Formation pro ».
 * « Master » est l'ancien niveau unique, conservé pour les données existantes et assimilé à M1 ; « Doctorat » (sans
 * année) est de même l'ancien niveau unique, remplacé par Doctorat 1, 2 et 3.
 */
export const LEVEL_LABEL_TO_STEP: ReadonlyArray<{ category: string; name: string | null; step: AcademicStep }> = [
  { category: 'Primaire', name: null, step: 'PRIMAIRE' },
  { category: 'Collège', name: null, step: 'COLLEGE' },
  { category: 'Lycée', name: null, step: 'LYCEE_BAC' },
  { category: UNIVERSITY_CATEGORY, name: 'Licence 1', step: 'L1' },
  { category: UNIVERSITY_CATEGORY, name: 'Licence 2', step: 'L2' },
  { category: UNIVERSITY_CATEGORY, name: 'Licence 3', step: 'L3' },
  { category: UNIVERSITY_CATEGORY, name: 'Master 1', step: 'M1' },
  { category: UNIVERSITY_CATEGORY, name: 'Master 2', step: 'M2' },
  { category: UNIVERSITY_CATEGORY, name: 'Master', step: 'M1' },
  { category: UNIVERSITY_CATEGORY, name: 'Doctorat', step: 'DOCTORAT' },
  // Années de doctorat : même marche de l'échelle (le rang ne distingue pas D1, D2, D3).
  { category: UNIVERSITY_CATEGORY, name: 'Doctorat 1', step: 'DOCTORAT' },
  { category: UNIVERSITY_CATEGORY, name: 'Doctorat 2', step: 'DOCTORAT' },
  { category: UNIVERSITY_CATEGORY, name: 'Doctorat 3', step: 'DOCTORAT' },
];

/** Rang académique d'un niveau du catalogue d'après ses libellés ; null = hors échelle. */
export function academicRankOfLevel(category: string, name: string): number | null {
  const entry =
    LEVEL_LABEL_TO_STEP.find((e) => e.category === category && e.name === name) ??
    LEVEL_LABEL_TO_STEP.find((e) => e.category === category && e.name === null);
  return entry ? ACADEMIC_RANK[entry.step] : null;
}

/** Vrai si le niveau relève du bloc universitaire (catégorie « Université »). */
export const isUniversityCategory = (category: string): boolean => category === UNIVERSITY_CATEGORY;

/**
 * Exigence E6 : un tuteur validé au niveau Doctorat sans détenir de doctorat est un expert professionnel ;
 * l'admin doit alors justifier sa décision (`academicLevelNote`). Aucune validation automatique.
 */
export const academicLevelNoteRequired = (levelRank: number, highestDegree: string | null | undefined): boolean =>
  levelRank >= ACADEMIC_RANK.DOCTORAT && highestDegree !== 'DOCTORAT';
