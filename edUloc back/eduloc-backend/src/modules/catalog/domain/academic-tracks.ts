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

const SERIES_NEW = ['OSE', 'S', 'L'] as const;
const SERIES_OLD = ['A1', 'A2', 'C', 'D'] as const;

/**
 * Matières propres à chaque série du lycée (programmes officiels PE T10/T11/T12 pour OSE, S, L ; structure indicative
 * pour A1, A2, C, D). Valeur = codes de série qui reçoivent la matière ; absente de cette table = commune à tout le
 * lycée, Seconde comprise (Malagasy, Français, Anglais, Histoire-Géographie, Mathématiques, EPS, et les trois LV2 :
 * Allemand, Espagnol, Russe, proposées dans chaque classe et chaque série).
 */
export const HIGH_SCHOOL_SUBJECT_TRACKS: Readonly<Record<string, readonly string[]>> = {
  'Sciences Physiques (SP)': seriesOf([...SERIES_NEW, 'C', 'D']),
  'Sciences de la Vie et de la Terre (SVT)': seriesOf([...SERIES_NEW, 'C', 'D']),
  'Sciences Économiques et Sociales (SES)': seriesOf(SERIES_NEW),
  // Philosophie : Première (T11) et Terminale (T12) dans le nouveau programme, Terminale seule dans l'ancien.
  Philosophie: [...SERIES_NEW.map((base) => `P${base}`), ...SERIES_NEW.map((base) => `T${base}`), ...SERIES_OLD.map((base) => `T${base}`)],
  // Uniquement en Première (T11), nouveau programme.
  'Éducation à la Citoyenneté': SERIES_NEW.map((base) => `P${base}`),
  'Technologie de l’Information et de la Communication en Éducation (TICE)': SERIES_NEW.map((base) => `P${base}`),
};

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
      // Ajouts d'après le recensement des formations des universités et instituts (univ.md) :
      'Génie Industriel et Mécanique',
      'Génie Électrique',
      'Génie Chimique et Procédés',
      'Sciences et Ingénierie des Matériaux',
      'Télécommunication et Réseaux',
      'Intelligence Artificielle',
      'Géologie, Mines et Pétrole',
      "Hydraulique et Génie de l'Eau",
      'Architecture et Urbanisme',
      'Agronomie (Productions Végétales et Animales)',
      'Sciences Marines et Halieutiques',
      'Environnement et Développement Durable',
      'Sciences Paramédicales (Infirmier, Kinésithérapie)',
      'Médecine Vétérinaire',
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
      'Commerce International et Logistique',
      'Tourisme et Hôtellerie',
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
      'Développement Social et Local',
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

const INFO = 'Informatique';
const IA = 'Intelligence Artificielle';
const RESEAUX = 'Télécommunication et Réseaux';
const MATHS = 'Mathématiques';
const PHYSIQUE = 'Sciences Physiques';
const CHIMIE = 'Chimie';
const GENIE_INDUS = 'Génie Industriel et Mécanique';
const GENIE_ELEC = 'Génie Électrique';
const ECONOMIE = 'Sciences Économiques';
const GESTION = 'Gestion et Management des Entreprises';
const CCA = 'Comptabilité, Contrôle, Audit (CCA)';
const FINANCE = 'Monnaie, Banque, Finance, Assurance';
const MARKETING = 'Marketing et Vente';
const COMMERCE_INTER = 'Commerce International et Logistique';
const COMMUNICATION = 'Information et Communication';
const GEOGRAPHIE = 'Géographie et Aménagement';
const ENVIRONNEMENT = 'Environnement et Développement Durable';
const AGRONOMIE = 'Agronomie (Productions Végétales et Animales)';

/**
 * Matières proposées à l'université, par mention (étape 3 de l'entonnoir) : nom de la matière → mentions qui la
 * proposent. Une matière absente de cette table (Mathématiques, Français, Anglais, Philosophie) reste proposée pour
 * toutes les mentions. Les mentions sont données par leur nom, converti en code par `UNIVERSITY_SUBJECT_TRACKS`.
 *
 * Source : univ.md (fiches CNTEMAD, plateformes des facultés de Fianarantsoa). La liste du CNTEMAD n'est pas répartie par
 * semestre : le rattachement à une mention est celui de la filière du CNTEMAD (Informatique, Gestion, Économie, Commerce,
 * Génie industriel, Communication). Les rattachements aux mentions voisines (CCA, Monnaie-Banque-Finance-Assurance,
 * Intelligence Artificielle, Télécommunication et Réseaux, Sciences Physiques, Chimie, Algèbre abstraite…) ne viennent
 * pas du fichier : ils sont déduits du nom de la matière ou de la mention.
 */
export const UNIVERSITY_SUBJECT_MENTIONS: Readonly<Record<string, readonly string[]>> = {
  // Matières déjà au catalogue, rattachées à leur mention
  Informatique: [INFO, IA],
  Programmation: [INFO, IA],
  'Bases de données': [INFO, IA],
  'Algorithmique avancée': [INFO, IA],
  Économie: [ECONOMIE, GESTION],
  Macroéconomie: [ECONOMIE],
  Comptabilité: [GESTION, CCA],
  'Droit des affaires': [GESTION],
  'Algèbre linéaire': [MATHS],
  'Analyse réelle': [MATHS],
  'Algèbre abstraite': [MATHS],
  'Probabilités et statistiques': [MATHS, INFO, ECONOMIE],
  Thermodynamique: [GENIE_INDUS, PHYSIQUE],
  'Chimie organique': [CHIMIE],
  // CNTEMAD — Informatique
  'Génie logiciel': [INFO],
  'Technologies web': [INFO],
  'Développement mobile': [INFO],
  'Réseaux informatiques': [INFO, RESEAUX],
  'Administration système': [INFO, RESEAUX],
  'Sécurité informatique': [INFO, RESEAUX],
  'Systèmes d’exploitation': [INFO, RESEAUX],
  'Cloud computing': [INFO],
  'Intelligence artificielle': [INFO, IA],
  'Systèmes d’information': [INFO],
  'Recherche opérationnelle': [INFO],
  Cryptographie: [INFO, RESEAUX],
  // CNTEMAD — Gestion
  'Analyse financière': [GESTION, CCA, FINANCE],
  'Gestion financière': [GESTION, CCA, FINANCE],
  'Mathématiques financières': [GESTION, CCA, FINANCE],
  Fiscalité: [GESTION, CCA],
  'Contrôle de gestion': [GESTION, CCA],
  Audit: [GESTION, CCA],
  'Gestion des ressources humaines': [GESTION],
  'Stratégie d’entreprise': [GESTION],
  Entrepreneuriat: [GESTION],
  // CNTEMAD — Économie
  Microéconomie: [ECONOMIE],
  'Économie du développement': [ECONOMIE],
  'Économie agricole': [ECONOMIE, AGRONOMIE],
  'Économie de l’environnement': [ECONOMIE, ENVIRONNEMENT],
  'Politiques publiques': [ECONOMIE],
  'Économie internationale': [ECONOMIE, COMMERCE_INTER],
  'Développement durable': [ECONOMIE, ENVIRONNEMENT],
  // CNTEMAD — Commerce
  Marketing: [MARKETING, GESTION],
  'Techniques de vente': [MARKETING],
  'Comportement du consommateur': [MARKETING],
  'Études de marché': [MARKETING],
  'Marketing digital': [MARKETING],
  'Commerce international': [COMMERCE_INTER],
  'Droit du commerce international': [COMMERCE_INTER],
  'Transport et logistique': [COMMERCE_INTER],
  'Finance internationale': [COMMERCE_INTER, FINANCE],
  'Négociation commerciale': [COMMERCE_INTER, MARKETING],
  'Supply chain management': [COMMERCE_INTER, GENIE_INDUS],
  // CNTEMAD — Communication (matières relevées sur la fiche, niveau non précisé)
  'Théorie générale de la communication': [COMMUNICATION],
  'Psychologie de la communication': [COMMUNICATION],
  'Stratégie de communication des entreprises': [COMMUNICATION],
  'Collecte et traitement des informations': [COMMUNICATION],
  // CNTEMAD — Génie industriel
  'Mécanique des fluides': [GENIE_INDUS],
  'Maintenance industrielle': [GENIE_INDUS],
  'Gestion de production': [GENIE_INDUS],
  Électrotechnique: [GENIE_ELEC],
  Automatisme: [GENIE_ELEC, GENIE_INDUS],
  'Électronique de puissance': [GENIE_ELEC],
  // EMIT de Fianarantsoa — Licence professionnelle Cartographie numérique et aménagement durable
  Télédétection: [GEOGRAPHIE],
};

/** Matière → codes de mention (`AcademicTrack.code`), pour `Subject.trackCodes`. */
export const UNIVERSITY_SUBJECT_TRACKS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  Object.entries(UNIVERSITY_SUBJECT_MENTIONS).map(([subject, mentions]) => [subject, mentions.map(mentionCode)]),
);
