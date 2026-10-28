import { Injectable } from '@nestjs/common';
import type { Room } from '../../generated/prisma/client';
import { AppConfig } from '../../core/config/app.config';
import { Tx } from './bookings.repository';
import { AvailabilityRule, SlotPolicy } from './domain/slot-policy';
import { MarginPolicy } from './domain/margin-policy';
import { roomWithinTutorZone } from './domain/travel';
import { bookableRoomWhere } from '../partners/domain/room-bookability';

/** Motifs d'échec de la vérification d'une salle ; les clés existent toutes dans ERROR_MESSAGES. */
export type RoomFailure =
  | 'ROOM_NOT_BOOKABLE'
  | 'ROOM_NOT_ACCEPTED_BY_TUTOR'
  | 'ROOM_OUT_OF_TUTOR_ZONE'
  | 'ROOM_CAPACITY_EXCEEDED'
  | 'ROOM_EQUIPMENT_MISSING'
  | 'ROOM_MINORS_NOT_ALLOWED'
  | 'ROOM_CLOSED'
  | 'ROOM_UNAVAILABLE';

/** Échecs qui relèvent d'un choix du Demandeur (le reste est un conflit de ressource). */
export const ROOM_INVALID_CHOICE: ReadonlySet<RoomFailure> = new Set([
  'ROOM_NOT_ACCEPTED_BY_TUTOR', 'ROOM_OUT_OF_TUTOR_ZONE', 'ROOM_CAPACITY_EXCEEDED', 'ROOM_EQUIPMENT_MISSING', 'ROOM_MINORS_NOT_ALLOWED',
]);

export interface RoomCheckInput {
  roomId: string;
  tutorProfileId: string;
  startAt: Date;
  endAt: Date;
  participantsCount: number;
  requiredEquipment: string[];
  beneficiary: { birthDate: Date | null; educationLevel: { category: string } | null };
  /** Acceptation : la demande elle-même ne doit pas compter comme un chevauchement. */
  excludeBookingId?: string;
  now?: Date;
}

export type RoomCheckResult = { room: Room; failure?: undefined } | { room?: undefined; failure: RoomFailure };

const MINOR_CATEGORIES = new Set(['Primaire', 'Collège', 'Lycée']);

/**
 * Âge connu → mineur si < 18 ans. Date de naissance absente → le niveau scolaire tranche (jusqu'au lycée on suppose
 * un mineur) : tant que les règles d'accueil des mineurs ne sont pas arrêtées (spec 13.8), le doute profite à la
 * protection.
 */
export function isLikelyMinor(b: RoomCheckInput['beneficiary'], now: Date): boolean {
  if (b.birthDate) {
    const eighteen = new Date(b.birthDate);
    eighteen.setUTCFullYear(eighteen.getUTCFullYear() + 18);
    return eighteen > now;
  }
  return b.educationLevel ? MINOR_CATEGORIES.has(b.educationLevel.category) : false;
}

@Injectable()
export class RoomReservationService {
  constructor(private readonly cfg: AppConfig) {}

  /**
   * Verrou transactionnel de la salle. TOUJOURS pris après le verrou du Tuteur (même ordre partout : pas d'interblocage).
   * La contrainte SQL bookings_room_no_overlap reste le dernier filet.
   */
  async lock(tx: Tx, roomId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'room:' + roomId}::text))`;
  }

  /**
   * Toutes les conditions propres à la salle (spec 5, points 2 et 4 à 9), évaluées dans la transaction appelante :
   * salle réservable, acceptée par le Tuteur, capacité / équipements / mineurs, ouverture de la salle sur TOUTE la
   * durée, absence de période bloquée, aucun chevauchement avec une séance confirmée (rotation comprise).
   * À appeler après `lock`.
   */
  async check(tx: Tx, input: RoomCheckInput): Promise<RoomCheckResult> {
    const now = input.now ?? new Date();
    const room = await tx.room.findFirst({ where: { id: input.roomId, ...bookableRoomWhere(now) } });
    if (!room) return { failure: 'ROOM_NOT_BOOKABLE' };

    const accepted = await tx.tutorRoom.findFirst({
      where: { tutorProfileId: input.tutorProfileId, roomId: room.id, isActive: true },
      select: { id: true },
    });
    if (!accepted) return { failure: 'ROOM_NOT_ACCEPTED_BY_TUTOR' };

    // Le rayon d'intervention en salle a pu être réduit depuis l'accord : revérifié à chaque demande et acceptation.
    const tutor = await tx.tutorProfile.findUnique({
      where: { id: input.tutorProfileId },
      select: { partnerRoomRadiusM: true, places: { where: { isActive: true }, select: { type: true, latitude: true, longitude: true } } },
    });
    if (tutor && !roomWithinTutorZone(tutor.places, room, tutor.partnerRoomRadiusM)) return { failure: 'ROOM_OUT_OF_TUTOR_ZONE' };

    if (input.participantsCount > room.capacity) return { failure: 'ROOM_CAPACITY_EXCEEDED' };
    const equipment = new Set(room.equipment.map((e) => e.trim().toLowerCase()));
    if (input.requiredEquipment.some((e) => !equipment.has(e.trim().toLowerCase()))) {
      return { failure: 'ROOM_EQUIPMENT_MISSING' };
    }
    if (!room.welcomesMinors && isLikelyMinor(input.beneficiary, now)) return { failure: 'ROOM_MINORS_NOT_ALLOWED' };

    const [rules, blocked, busy] = await Promise.all([
      tx.roomAvailability.findMany({ where: { roomId: room.id, isActive: true } }),
      tx.roomBlockedPeriod.findFirst({
        where: { roomId: room.id, startAt: { lt: input.endAt }, endAt: { gt: input.startAt } },
        select: { id: true },
      }),
      tx.booking.findMany({
        where: {
          roomId: room.id,
          id: input.excludeBookingId ? { not: input.excludeBookingId } : undefined,
          status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
          startAt: { lt: new Date(input.endAt.getTime() + this.cfg.roomTurnoverBufferMinutes * 60_000) },
          endAt: { gt: new Date(input.startAt.getTime() - this.cfg.roomTurnoverBufferMinutes * 60_000) },
        },
        select: { startAt: true, endAt: true },
      }),
    ]);
    const roomRules: AvailabilityRule[] = rules.map((r) => ({
      id: r.id, dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime, timezone: room.timezone,
      validFrom: r.validFrom, validUntil: r.validUntil, isActive: r.isActive, offerId: null, placeId: null, placeType: null,
    }));
    if (!SlotPolicy.matchRule(roomRules, input.startAt, input.endAt, 'PARTNER_ROOM', undefined, '') || blocked) {
      return { failure: 'ROOM_CLOSED' };
    }
    if (MarginPolicy.roomOverlaps(input, busy, this.cfg.roomTurnoverBufferMinutes)) return { failure: 'ROOM_UNAVAILABLE' };
    return { room };
  }
}
