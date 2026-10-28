import type { Prisma } from '../../../generated/prisma/client';

/**
 * UNE SEULE définition de « salle réservable » (spec 3, 5.4 et 8.2) : validée, publiée, active, structure validée et
 * souscription commerciale en cours de validité. Utilisée pour les listes publiques, les options de réservation, la
 * création de la demande ET l'acceptation. Une salle suspendue, dépubliée ou dont l'offre a expiré disparaît partout.
 */
export function bookableRoomWhere(now: Date = new Date()): Prisma.RoomWhereInput {
  return {
    status: 'APPROVED',
    publication: 'PUBLISHED',
    isActive: true,
    venue: {
      status: 'APPROVED',
      subscriptions: { some: { status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } } },
    },
  };
}

export interface PublishCheckInput {
  roomStatus: string;
  roomPublication: string;
  venueStatus: string;
  hasActiveSubscription: boolean;
}

/** Pourquoi une salle ne peut pas être publiée (liste vide = publiable). Codes = clés d'ERROR_MESSAGES. */
export function publishBlockers(input: PublishCheckInput): string[] {
  const blockers: string[] = [];
  if (input.roomStatus !== 'APPROVED') blockers.push('ROOM_NOT_APPROVED');
  if (input.venueStatus !== 'APPROVED') blockers.push('VENUE_NOT_APPROVED');
  if (!input.hasActiveSubscription) blockers.push('SUBSCRIPTION_REQUIRED');
  if (input.roomPublication === 'UNPUBLISHED_BY_ADMIN') blockers.push('ROOM_UNPUBLISHED_BY_ADMIN');
  return blockers;
}

/** Champs sans lesquels une salle ne peut pas être soumise (spec 8.2 étape 7). */
export function missingRoomFields(room: {
  name: string; addressLine: string | null; city: string | null; latitude: number | null; longitude: number | null;
  zoneLabel: string | null; capacity: number; pricePerHour: unknown | null; rules: string | null;
}, availabilityCount: number): string[] {
  const missing: string[] = [];
  if (!room.name.trim()) missing.push('name');
  if (!room.addressLine?.trim()) missing.push('addressLine');
  if (!room.city?.trim()) missing.push('city');
  if (room.latitude === null || room.longitude === null) missing.push('position');
  if (!room.zoneLabel?.trim()) missing.push('zoneLabel');
  if (room.capacity < 1) missing.push('capacity');
  if (room.pricePerHour === null || room.pricePerHour === undefined) missing.push('pricePerHour');
  if (!room.rules?.trim()) missing.push('rules');
  if (availabilityCount < 1) missing.push('availabilities');
  return missing;
}
