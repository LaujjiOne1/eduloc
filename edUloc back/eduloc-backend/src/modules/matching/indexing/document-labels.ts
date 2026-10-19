/**
 * Documents dont l'admin contrôle l'AUTHENTICITÉ : seuls ceux-là peuvent porter la mention « vérifié » (spec §5.3 et
 * §13, décision 4). Le CV est approuvé pour sa cohérence avec le dossier, pas ligne par ligne ; une pièce « autre » non plus.
 */
export const AUTHENTICITY_CHECKED_TYPES: ReadonlySet<string> = new Set([
  'DIPLOMA', 'TRANSCRIPT', 'CERTIFICATE', 'ENROLLMENT_CERTIFICATE', 'PROFESSIONAL_PROOF',
]);

/** Rappel affiché à l'admin au moment d'approuver (écran de revue). */
export function approvalMeaning(type: string): string {
  switch (type) {
    case 'DIPLOMA': return 'Approuver ce diplôme = attester de son authenticité.';
    case 'TRANSCRIPT': return 'Approuver ce relevé de notes = attester de son authenticité.';
    case 'CERTIFICATE': return 'Approuver ce certificat = attester de son authenticité.';
    case 'ENROLLMENT_CERTIFICATE': return 'Approuver ce certificat de scolarité = attester de son authenticité.';
    case 'PROFESSIONAL_PROOF': return 'Approuver cette preuve = attester de la réalité de l’expérience.';
    case 'CV': return 'Approuver ce CV = accepter sa cohérence avec le dossier (il ne sera jamais présenté comme « vérifié »).';
    case 'IDENTITY': return 'Pièce d’identité : contrôle d’identité uniquement, jamais lue ni indexée pour le matching.';
    default: return 'Pièce jointe au dossier : jamais présentée comme « vérifiée ».';
  }
}
