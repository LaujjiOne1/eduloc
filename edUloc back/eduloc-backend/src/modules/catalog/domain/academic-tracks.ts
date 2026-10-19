/**
 * Filières proposées à l'étape 2 de l'entonnoir de recherche, et injectées dans les offres des tuteurs.
 *   - Séries du lycée (Première, Terminale) : nouveau programme (OSE, S, L) et ancien programme (A1, A2, C, D),
 *     qui coexistent le temps de la réforme.
 *   - Mentions universitaires (nomenclature SISE) groupées par Domaine mère. L'utilisateur ne choisit que la
 *     mention ; le domaine est retrouvé côté serveur pour construire le texte d'embedding.
 */
export interface SerieSeed {
  code: string;
  name: string;
  programme: 'NOUVEAU' | 'ANCIEN';
  /** Une série appartient à un niveau : Première et Terminale ont chacune la leur, en parallèle (PS ↔ TS…). */
  levelName: 'Première' | 'Terminale';
}

/** Séries communes aux deux niveaux : [lettre de la série, programme]. Le code se préfixe par P (Première) ou T (Terminale). */
const SERIE_BASES: ReadonlyArray<{ base: string; programme: SerieSeed['programme'] }> = [
  { base: 'OSE', programme: 'NOUVEAU' },
  { base: 'S', programme: 'NOUVEAU' },
  { base: 'L', programme: 'NOUVEAU' },
  { base: 'A1', programme: 'ANCIEN' },
  { base: 'A2', programme: 'ANCIEN' },
  { base: 'C', programme: 'ANCIEN' },
  { base: 'D', programme: 'ANCIEN' },
];

const SERIE_LEVELS = [
  { levelName: 'Première', prefix: 'P' },
  { levelName: 'Terminale', prefix: 'T' },
] as const;

export const SERIES: ReadonlyArray<SerieSeed> = SERIE_LEVELS.flatMap(({ levelName, prefix }) =>
  SERIE_BASES.map(({ base, programme }) => ({ code: `${prefix}${base}`, name: `Série ${base}`, programme, levelName })),
);

const seriesOf = (bases: readonly string[]): string[] =>
  SERIE_LEVELS.flatMap(({ prefix }) => bases.map((base) => `${prefix}${base}`));

export const SERIES_SCIENTIFIC = seriesOf(['C', 'D', 'S']);
export const SERIES_ECONOMIC = seriesOf(['OSE']);
export const SERIES_LITERARY = seriesOf(['A1', 'A2', 'L']);

export const MENTION_DOMAINS: ReadonlyArray<{ domain: string; mentions: readonly string[] }> = [
  {
    domain: 'Sciences, Technologies et Santé',
    mentions: [
      'Informatique',
      'Mathématiques',
      'Sciences Physiques',
      'Chimie',
      'Sciences de la Vie et de la Terre (Biologie / Géologie)',
      "Sciences pour l'Ingénieur (Génie Civil, Électronique)",
      'Sciences Médicales et Hospitalières',
      'Pharmacie',
      'Odontologie (Soins dentaires)',
      'Maïeutique (Sage-femme)',
      'Sciences de la Nutrition et Agroalimentaire',
    ],
  },
  {
    domain: 'Droit, Économie et Gestion',
    mentions: [
      'Droit (Droit Public / Droit Privé)',
      'Sciences Économiques',
      'Gestion et Management des Entreprises',
      'Marketing et Vente',
      'Administration Publique',
      'Comptabilité, Contrôle, Audit (CCA)',
      'Monnaie, Banque, Finance, Assurance',
      'Science Politique',
    ],
  },
  {
    domain: 'Sciences Humaines et Sociales',
    mentions: [
      'Sociologie',
      'Psychologie',
      'Histoire',
      'Géographie et Aménagement',
      "Sciences de l'Éducation",
      'Information et Communication',
      'Archéologie et Anthropologie',
      'Philosophie',
    ],
  },
  {
    domain: 'Arts, Lettres et Langues',
    mentions: [
      'Langues Étrangères Appliquées (LEA)',
      'Langues, Littératures et Civilisations Étrangères (LLCE)',
      'Lettres Modernes / Lettres Classiques',
      'Arts Plastiques / Arts Visuels',
      'Arts du Spectacle (Cinéma, Théâtre, Danse)',
      'Musique et Musicologie',
      'Design',
    ],
  },
];

/** Code stable d'une mention : majuscules sans accents, mots séparés par « _ » (« Droit (Droit Public…) » → DROIT_DROIT_PUBLIC_DROIT_PRIVE). */
export const mentionCode = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export interface MentionSeed {
  code: string;
  name: string;
  domain: string;
}

export const MENTIONS: ReadonlyArray<MentionSeed> = MENTION_DOMAINS.flatMap(({ domain, mentions }) =>
  mentions.map((name) => ({ code: mentionCode(name), name, domain })),
);
