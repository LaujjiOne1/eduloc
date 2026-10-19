/**
 * Pré-contrôle automatique INDICATIF pour l'admin (spec §8), stocké dans `TutorDocument.autoCheck`.
 * Il ne décide JAMAIS : aucun rejet automatique, aucune validation automatique. Il signale seulement des
 * incohérences possibles (nom absent du document, niveau du document différent du diplôme déclaré).
 * Un embedding ne prouve pas l'authenticité d'un diplôme : la vérification reste une décision humaine.
 */
export interface AutoCheck {
  indicative: true;
  /** Niveau mentionné dans le texte (le plus élevé trouvé), si reconnu. */
  detectedDegree: 'BAC' | 'LICENCE' | 'MASTER' | 'DOCTORAT' | null;
  /** Le nom de famille du titulaire figure-t-il dans le document ? null si non vérifiable. */
  holderNameFound: boolean | null;
  /** Alertes pour l'admin ; jamais un motif de rejet automatique. */
  alerts: string[];
}

const fold = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const DEGREE_PATTERNS: [AutoCheck['detectedDegree'], RegExp][] = [
  ['DOCTORAT', /\b(doctorat|phd|doctor of philosophy|these de doctorat)\b/],
  ['MASTER', /\b(master|diplome d ingenieur|ingenieur d etat|maitrise)\b/],
  ['LICENCE', /\b(licence|bachelor|licence professionnelle)\b/],
  ['BAC', /\b(baccalaureat|bacc?)\b/],
];
const RANK = { BAC: 1, LICENCE: 2, MASTER: 3, DOCTORAT: 4 } as const;

const DEGREE_TYPES = new Set(['DIPLOMA', 'CERTIFICATE', 'TRANSCRIPT', 'ENROLLMENT_CERTIFICATE']);

export function buildAutoCheck(input: {
  type: string;
  text: string;
  holderLastName: string;
  declaredDegree: string | null;
}): AutoCheck {
  const folded = fold(input.text);
  const alerts: string[] = [];

  let detectedDegree: AutoCheck['detectedDegree'] = null;
  for (const [degree, pattern] of DEGREE_PATTERNS) {
    if (pattern.test(folded)) {
      detectedDegree = degree;
      break; // patterns classés du plus haut au plus bas
    }
  }

  const lastName = fold(input.holderLastName);
  const holderNameFound = DEGREE_TYPES.has(input.type) && lastName.length >= 2 ? folded.includes(lastName) : null;
  if (holderNameFound === false) alerts.push('Le nom du titulaire du compte ne figure pas dans le document : à vérifier.');

  const declared = input.declaredDegree as keyof typeof RANK | null;
  if (DEGREE_TYPES.has(input.type) && detectedDegree && declared && declared in RANK && RANK[detectedDegree] !== RANK[declared]) {
    alerts.push(`Le document mentionne un niveau « ${detectedDegree} » alors que le diplôme déclaré est « ${declared} » : à vérifier.`);
  }
  return { indicative: true, detectedDegree, holderNameFound, alerts };
}
