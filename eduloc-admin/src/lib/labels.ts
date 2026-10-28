/** Libellés français et tonalités des statuts du back-office. */
export type Tone = 'green' | 'amber' | 'rose' | 'indigo' | 'slate' | 'blue';

type Entry = { label: string; tone: Tone };
const table = (entries: Record<string, Entry>) => (key: string | null | undefined): Entry =>
  (key ? entries[key] : undefined) ?? { label: key ?? '—', tone: 'slate' };

export const userStatus = table({
  ACTIVE: { label: 'Actif', tone: 'green' },
  SUSPENDED: { label: 'Suspendu', tone: 'rose' },
  PENDING_VERIFICATION: { label: 'E-mail non vérifié', tone: 'amber' },
});

export const applicationStatus = table({
  DRAFT: { label: 'Brouillon', tone: 'slate' },
  PENDING: { label: 'À examiner', tone: 'amber' },
  APPROVED: { label: 'Approuvé', tone: 'green' },
  REJECTED: { label: 'Refusé', tone: 'rose' },
});

export const documentStatus = table({
  PENDING: { label: 'À contrôler', tone: 'amber' },
  APPROVED: { label: 'Approuvé', tone: 'green' },
  REJECTED: { label: 'Refusé', tone: 'rose' },
});

export const documentType = table({
  IDENTITY: { label: 'Pièce d’identité', tone: 'slate' },
  DIPLOMA: { label: 'Diplôme', tone: 'indigo' },
  CERTIFICATE: { label: 'Certificat', tone: 'indigo' },
  PROFESSIONAL_PROOF: { label: 'Preuve d’expérience', tone: 'indigo' },
  CV: { label: 'CV', tone: 'slate' },
  TRANSCRIPT: { label: 'Relevé de notes', tone: 'indigo' },
  ENROLLMENT_CERTIFICATE: { label: 'Certificat de scolarité', tone: 'indigo' },
  OTHER: { label: 'Autre pièce', tone: 'slate' },
});

/** Documents dont l'approbation atteste de l'authenticité (miroir de AUTHENTICITY_CHECKED_TYPES côté serveur). */
export const AUTHENTICITY_TYPES = new Set(['DIPLOMA', 'TRANSCRIPT', 'CERTIFICATE', 'ENROLLMENT_CERTIFICATE', 'PROFESSIONAL_PROOF']);

export const equivalenceStatus = table({
  PENDING: { label: 'À trancher', tone: 'amber' },
  VALIDATED: { label: 'Validée', tone: 'green' },
  REJECTED: { label: 'Non reconnue', tone: 'rose' },
});

export const highestDegree = (v: string | null | undefined) =>
  ({ BAC: 'Baccalauréat', LICENCE: 'Licence', MASTER: 'Master', DOCTORAT: 'Doctorat', OTHER: 'Autre diplôme' } as Record<string, string>)[v ?? ''] ?? '—';

export const bookingStatus = table({
  PENDING: { label: 'En attente du tuteur', tone: 'amber' },
  CONFIRMED: { label: 'Confirmée', tone: 'green' },
  REFUSED: { label: 'Refusée', tone: 'rose' },
  CANCELLED: { label: 'Annulée', tone: 'slate' },
  IN_PROGRESS: { label: 'En cours', tone: 'indigo' },
  COMPLETED: { label: 'Terminée', tone: 'blue' },
});

export const teachingMode = (v: string) =>
  ({
    ONLINE: 'En ligne', AT_HOME_BENEFICIARY: 'Chez le bénéficiaire', AT_HOME_TUTOR: 'Chez le tuteur',
    PUBLIC_PLACE: 'Lieu public', PARTNER_ROOM: 'Salle partenaire',
  } as Record<string, string>)[v] ?? v;

export const conflictStatus = table({
  OPEN: { label: 'Ouvert', tone: 'amber' },
  RESOLVED: { label: 'Résolu', tone: 'green' },
  DISMISSED: { label: 'Classé', tone: 'slate' },
});

export const conflictType = (v: string) => ({
  OVERLAPPING_BOOKINGS: 'Séances qui se chevauchent',
  TUTOR_UNAVAILABLE: 'Tuteur indisponible',
  AVAILABILITY_REMOVED: 'Disponibilité retirée',
  OFFER_INACTIVE: 'Offre désactivée',
  TUTOR_SUSPENDED: 'Tuteur suspendu',
  ROOM_UNAVAILABLE: 'Salle indisponible',
} as Record<string, string>)[v] ?? v;

export const venueStatus = table({
  DRAFT: { label: 'Brouillon', tone: 'slate' },
  SUBMITTED: { label: 'Soumise', tone: 'amber' },
  UNDER_REVIEW: { label: 'En cours d’examen', tone: 'blue' },
  APPROVED: { label: 'Validée', tone: 'green' },
  NEEDS_CORRECTION: { label: 'Corrections demandées', tone: 'amber' },
  SUSPENDED: { label: 'Suspendue', tone: 'rose' },
  REJECTED: { label: 'Refusée', tone: 'rose' },
  DISABLED: { label: 'Désactivée', tone: 'slate' },
});

export const roomStatusLabel = venueStatus;

export const publication = table({
  UNPUBLISHED: { label: 'Non publiée', tone: 'slate' },
  PUBLISHED: { label: 'Publiée', tone: 'green' },
  UNPUBLISHED_BY_ADMIN: { label: 'Retirée par EduLoc', tone: 'rose' },
});

export const subscriptionStatus = table({
  NOT_SELECTED: { label: 'Aucune offre choisie', tone: 'slate' },
  PENDING: { label: 'En attente d’activation', tone: 'amber' },
  ACTIVE: { label: 'Active', tone: 'green' },
  EXPIRED: { label: 'Expirée', tone: 'rose' },
  CANCELLED: { label: 'Annulée', tone: 'slate' },
});

export const venueType = (v: string) => ({
  TRAINING_CENTER: 'Centre de formation', COMPANY: 'Entreprise', SCHOOL: 'École', LIBRARY: 'Bibliothèque',
  COWORKING: 'Espace de coworking', ASSOCIATION: 'Association', COMMUNITY_CENTER: 'Centre communautaire', OTHER: 'Autre',
} as Record<string, string>)[v] ?? v;

export const venueDocumentType = (v: string) => ({
  OWNERSHIP_PROOF: 'Preuve du droit de gérer le lieu', BUSINESS_REGISTRATION: 'Immatriculation',
  MANAGER_IDENTITY: 'Identité du gestionnaire', INSURANCE: 'Assurance', OTHER: 'Autre',
} as Record<string, string>)[v] ?? v;

export const weekday = (d: number) => ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][d] ?? String(d);

export const historyScope = (v: string) =>
  ({ VENUE: 'Structure', ROOM: 'Salle', PUBLICATION: 'Publication', SUBSCRIPTION: 'Offre commerciale' } as Record<string, string>)[v] ?? v;

/** Décisions possibles sur une structure, selon son statut (miroir du tableau de transitions ADMIN côté serveur). */
export const VENUE_ACTIONS: Record<string, { decision: string; label: string; needsNote: boolean; tone: 'primary' | 'danger' | 'neutral' }[]> = {
  SUBMITTED: [
    { decision: 'START_REVIEW', label: 'Commencer l’examen', needsNote: false, tone: 'neutral' },
    { decision: 'APPROVE', label: 'Valider', needsNote: false, tone: 'primary' },
    { decision: 'REQUEST_CORRECTION', label: 'Demander des corrections', needsNote: true, tone: 'neutral' },
    { decision: 'REJECT', label: 'Refuser', needsNote: true, tone: 'danger' },
  ],
  UNDER_REVIEW: [
    { decision: 'APPROVE', label: 'Valider', needsNote: false, tone: 'primary' },
    { decision: 'REQUEST_CORRECTION', label: 'Demander des corrections', needsNote: true, tone: 'neutral' },
    { decision: 'REJECT', label: 'Refuser', needsNote: true, tone: 'danger' },
  ],
  NEEDS_CORRECTION: [
    { decision: 'SUSPEND', label: 'Suspendre', needsNote: true, tone: 'danger' },
    { decision: 'REJECT', label: 'Refuser', needsNote: true, tone: 'danger' },
  ],
  APPROVED: [
    { decision: 'SUSPEND', label: 'Suspendre', needsNote: true, tone: 'danger' },
    { decision: 'DISABLE', label: 'Désactiver', needsNote: true, tone: 'danger' },
  ],
  SUSPENDED: [
    { decision: 'REINSTATE', label: 'Rétablir', needsNote: false, tone: 'primary' },
    { decision: 'DISABLE', label: 'Désactiver', needsNote: true, tone: 'danger' },
  ],
  DISABLED: [{ decision: 'REINSTATE', label: 'Rétablir', needsNote: false, tone: 'primary' }],
};

export const ROOM_ACTIONS: Record<string, { decision: string; label: string; needsNote: boolean; tone: 'primary' | 'danger' | 'neutral' }[]> = {
  SUBMITTED: [
    { decision: 'START_REVIEW', label: 'Commencer l’examen', needsNote: false, tone: 'neutral' },
    { decision: 'APPROVE', label: 'Valider', needsNote: false, tone: 'primary' },
    { decision: 'REQUEST_CORRECTION', label: 'Demander des corrections', needsNote: true, tone: 'neutral' },
    { decision: 'REJECT', label: 'Refuser', needsNote: true, tone: 'danger' },
  ],
  UNDER_REVIEW: [
    { decision: 'APPROVE', label: 'Valider', needsNote: false, tone: 'primary' },
    { decision: 'REQUEST_CORRECTION', label: 'Demander des corrections', needsNote: true, tone: 'neutral' },
    { decision: 'REJECT', label: 'Refuser', needsNote: true, tone: 'danger' },
  ],
  NEEDS_CORRECTION: [{ decision: 'REJECT', label: 'Refuser', needsNote: true, tone: 'danger' }],
  APPROVED: [{ decision: 'SUSPEND', label: 'Suspendre', needsNote: true, tone: 'danger' }],
  SUSPENDED: [
    { decision: 'REINSTATE', label: 'Rétablir', needsNote: false, tone: 'primary' },
    { decision: 'REQUEST_CORRECTION', label: 'Demander des corrections', needsNote: true, tone: 'neutral' },
  ],
};

export const formatDate = (iso: string | null | undefined, withTime = false) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return withTime
    ? d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    : d.toLocaleDateString('fr-FR');
};

export const formatMoney = (amount: string | number | null | undefined, currency = 'MGA') => {
  if (amount === null || amount === undefined) return '—';
  const n = Number(amount);
  return `${Number.isFinite(n) ? n.toLocaleString('fr-FR') : amount} ${currency === 'MGA' ? 'Ar' : currency}`;
};

export const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();
