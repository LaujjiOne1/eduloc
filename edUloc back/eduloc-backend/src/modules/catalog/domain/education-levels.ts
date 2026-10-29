import { UNIVERSITY_CATEGORY, academicRankOfLevel } from './academic-scale';

/** Niveaux du catalogue, dans l'ordre d'affichage (le seed en déduit `displayOrder`). */
export const CATALOG_LEVELS: ReadonlyArray<{ category: string; names: readonly string[] }> = [
  { category: 'Primaire', names: ['11ème', '10ème', '9ème', '8ème', '7ème'] },
  { category: 'Collège', names: ['6ème', '5ème', '4ème', '3ème'] },
  { category: 'Lycée', names: ['Seconde', 'Première', 'Terminale'] },
  {
    category: UNIVERSITY_CATEGORY,
    names: ['Licence 1', 'Licence 2', 'Licence 3', 'Master 1', 'Master 2', 'Doctorat 1', 'Doctorat 2', 'Doctorat 3', 'Formation pro'],
  },
];

/**
 * Premier sous-cycle du primaire (« Niveau I » du nouveau programme : T1, T2, T3 = 11ème, 10ème, 9ème). Anglais,
 * Sciences et Technologie, Histoire et Géographie n'y sont pas enseignés ; ils arrivent en T4 (8ème).
 */
export const PRIMARY_FIRST_CYCLE_LEVELS: readonly string[] = ['11ème', '10ème', '9ème'];

/** Années de Licence et niveaux au-dessus (Master, Doctorat) : servent à réserver une matière à l'un ou à l'autre (`Subject.excludedLevels`). */
export const LICENCE_LEVELS: readonly string[] = ['Licence 1', 'Licence 2', 'Licence 3'];
export const LEVELS_ABOVE_LICENCE: readonly string[] = ['Master 1', 'Master 2', 'Doctorat 1', 'Doctorat 2', 'Doctorat 3'];

/**
 * Diplôme minimal pour enseigner un niveau : garde-fou des flux existants (saisie du dossier tuteur),
 * sans lien avec l'éligibilité universitaire du matching (qui utilise `academicRank`).
 */
export const requiredDegreeFor = (category: string, name: string): 'BAC' | 'LICENCE' | 'MASTER' | 'DOCTORAT' => {
  if (category !== UNIVERSITY_CATEGORY) return 'BAC';
  if (name.startsWith('Doctorat')) return 'DOCTORAT';
  if (name.startsWith('Master')) return 'MASTER';
  return 'LICENCE';
};

export { academicRankOfLevel };

/** Niveaux du lycée qui ouvrent le choix d'une série (Seconde est un tronc commun). */
const LEVELS_WITH_SERIES = ['Première', 'Terminale'];

/**
 * Type de filière à choisir après le niveau : série (Première, Terminale), mention (tout niveau universitaire sur
 * l'échelle), sinon aucune — Primaire, Collège, Seconde et « Formation pro » passent directement à la matière.
 */
export function trackKindOfLevel(category: string, name: string): 'SERIE' | 'MENTION' | null {
  if (category === 'Lycée') return LEVELS_WITH_SERIES.includes(name) ? 'SERIE' : null;
  if (category === UNIVERSITY_CATEGORY) return academicRankOfLevel(category, name) === null ? null : 'MENTION';
  return null;
}
