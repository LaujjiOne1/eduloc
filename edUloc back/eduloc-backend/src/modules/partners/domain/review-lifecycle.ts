import { ConflictError, ForbiddenError } from '../../../common/errors/domain-errors';

/**
 * Structure. Libellés produit : En attente = SUBMITTED, En cours de vérification = UNDER_REVIEW, Vérifié = APPROVED,
 * Refusé = REJECTED, Suspendu = SUSPENDED, Désactivé = DISABLED.
 */
export type VenueState = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'NEEDS_CORRECTION' | 'SUSPENDED' | 'REJECTED' | 'DISABLED';
export type RoomState = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'NEEDS_CORRECTION' | 'SUSPENDED' | 'REJECTED';
export type PartnerActor = 'MANAGER' | 'ADMIN';

type Table<S extends string> = Record<S, Partial<Record<S, PartnerActor[]>>>;

/** Dossier de structure (spec 10.1). Le Gestionnaire soumet ; seul l'administrateur décide. */
const VENUE_TRANSITIONS: Table<VenueState> = {
  DRAFT:            { SUBMITTED: ['MANAGER'] },
  SUBMITTED:        { UNDER_REVIEW: ['ADMIN'], APPROVED: ['ADMIN'], NEEDS_CORRECTION: ['ADMIN'], SUSPENDED: ['ADMIN'], REJECTED: ['ADMIN'] },
  UNDER_REVIEW:     { APPROVED: ['ADMIN'], NEEDS_CORRECTION: ['ADMIN'], SUSPENDED: ['ADMIN'], REJECTED: ['ADMIN'] },
  NEEDS_CORRECTION: { SUBMITTED: ['MANAGER'], SUSPENDED: ['ADMIN'], REJECTED: ['ADMIN'] },
  APPROVED:         { SUSPENDED: ['ADMIN'], DISABLED: ['ADMIN'] },
  SUSPENDED:        { APPROVED: ['ADMIN'], NEEDS_CORRECTION: ['ADMIN'], DISABLED: ['ADMIN'] },
  // Refusé : le Gestionnaire corrige puis soumet à nouveau (nouvel examen complet).
  REJECTED:         { SUBMITTED: ['MANAGER'] },
  DISABLED:         { APPROVED: ['ADMIN'] },
};

/** Salle (spec 10.2). Chaque salle suit son propre cycle : approuver l'une n'approuve pas les autres. */
const ROOM_TRANSITIONS: Table<RoomState> = {
  DRAFT:            { SUBMITTED: ['MANAGER'] },
  SUBMITTED:        { UNDER_REVIEW: ['ADMIN'], APPROVED: ['ADMIN'], NEEDS_CORRECTION: ['ADMIN'], REJECTED: ['ADMIN'] },
  UNDER_REVIEW:     { APPROVED: ['ADMIN'], NEEDS_CORRECTION: ['ADMIN'], REJECTED: ['ADMIN'] },
  NEEDS_CORRECTION: { SUBMITTED: ['MANAGER'], REJECTED: ['ADMIN'] },
  APPROVED:         { SUSPENDED: ['ADMIN'] },
  SUSPENDED:        { APPROVED: ['ADMIN'], NEEDS_CORRECTION: ['ADMIN'] },
  REJECTED:         {},
};

function assertTransition<S extends string>(table: Table<S>, from: S, to: S, actor: PartnerActor): void {
  const allowed = table[from]?.[to];
  if (!allowed) throw new ConflictError('INVALID_TRANSITION', `${from} → ${to} est une transition interdite.`);
  if (!allowed.includes(actor)) {
    throw new ForbiddenError('TRANSITION_NOT_ALLOWED_FOR_ACTOR', `${actor} ne peut pas effectuer ${from} → ${to}.`);
  }
}

export class PartnerLifecycle {
  static assertVenue(from: VenueState, to: VenueState, actor: PartnerActor): void {
    assertTransition(VENUE_TRANSITIONS, from, to, actor);
  }

  static assertRoom(from: RoomState, to: RoomState, actor: PartnerActor): void {
    assertTransition(ROOM_TRANSITIONS, from, to, actor);
  }

  static canVenue(from: VenueState, to: VenueState, actor: PartnerActor): boolean {
    return (VENUE_TRANSITIONS[from]?.[to] ?? []).includes(actor);
  }

  static canRoom(from: RoomState, to: RoomState, actor: PartnerActor): boolean {
    return (ROOM_TRANSITIONS[from]?.[to] ?? []).includes(actor);
  }

  /** Une salle n'est modifiable par son Gestionnaire qu'en brouillon ou lorsque des corrections sont demandées. */
  static isEditable(state: RoomState): boolean {
    return state === 'DRAFT' || state === 'NEEDS_CORRECTION';
  }

  /** Une structure refusée se corrige aussi, pour être soumise à nouveau. */
  static isVenueEditable(state: VenueState): boolean {
    return state === 'DRAFT' || state === 'NEEDS_CORRECTION' || state === 'REJECTED';
  }
}
