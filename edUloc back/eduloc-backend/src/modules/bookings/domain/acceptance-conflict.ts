import { ConflictError } from '../../../common/errors/domain-errors';

export type AcceptanceConflictType = 'OVERLAPPING_BOOKINGS' | 'TUTOR_UNAVAILABLE' | 'OFFER_INACTIVE' | 'ROOM_UNAVAILABLE';

/**
 * Une vérification de l'acceptation (spec 7.2) échoue : la demande ne devient PAS confirmée et reste PENDING. La
 * transaction est annulée (rien n'est confirmé, ni séance ni salle) ; le service enregistre ensuite le conflit dans
 * une transaction séparée, puis informe le Demandeur et le Tuteur (spec 7.3).
 */
export class AcceptanceConflictError extends ConflictError {
  constructor(
    code: string,
    readonly conflictType: AcceptanceConflictType,
    /** Motif précis (ex. ROOM_CLOSED), conservé dans Conflict.details pour l'administrateur. */
    readonly reason: string,
  ) {
    super(code, undefined);
  }
}
