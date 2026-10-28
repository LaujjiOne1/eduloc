import { AvailabilityRule, SlotPolicy, TeachingMode, tzParts } from './slot-policy';
import { BusyInterval, MarginConfig, MarginPolicy } from './margin-policy';

export const BUSINESS_TIMEZONE = 'Indian/Antananarivo';

export interface RoomSide {
  /** Plages d'ouverture de la salle (fuseau de la salle). */
  rules: AvailabilityRule[];
  blocked: { startAt: Date; endAt: Date }[];
  /** Séances CONFIRMED / IN_PROGRESS dans la salle (jamais les PENDING : aucun blocage temporaire). */
  busy: { startAt: Date; endAt: Date }[];
  turnoverMinutes: number;
}

export interface DaySlotsInput {
  /** Jour LOCAL (fuseau métier) au format AAAA-MM-JJ. */
  date: string;
  durationMinutes: number;
  stepMinutes: number;
  /** Préavis déjà converti en instant : aucun créneau ne commence avant. */
  notBefore: Date;
  mode: TeachingMode;
  offerId: string;
  tutorRules: AvailabilityRule[];
  tutorBlocked: { startAt: Date; endAt: Date }[];
  /** Séances CONFIRMED / IN_PROGRESS du Tuteur autour du jour (marge de déplacement comprise). */
  tutorBusy: BusyInterval[];
  /** Clé du lieu de la séance envisagée (locationKeyOf) : sert à la marge de déplacement. */
  candidateLocationKey: string | null;
  margins: MarginConfig;
  /** Présent pour une salle partenaire : l'intersection tutor ∩ salle est alors calculée. */
  room?: RoomSide;
}

export interface DaySlot {
  startAt: Date;
  endAt: Date;
  availabilityId: string;
}

const overlaps = (a: { startAt: Date; endAt: Date }, b: { startAt: Date; endAt: Date }) =>
  a.startAt < b.endAt && a.endAt > b.startAt;

/**
 * Créneaux réservables d'un jour : intersection des disponibilités du Tuteur (pour le mode) et, pour une salle, de
 * l'ouverture de la salle, moins les périodes bloquées, les séances confirmées et leurs marges. Chaque créneau couvre
 * TOUTE la durée choisie. Le contrôle final reste celui de la création / de l'acceptation de la demande.
 */
export function computeDaySlots(input: DaySlotsInput): DaySlot[] {
  const step = input.stepMinutes * 60_000;
  const dayAnchor = Date.parse(`${input.date}T00:00:00.000Z`);
  if (Number.isNaN(dayAnchor)) return [];
  // Le jour local d'un fuseau quelconque tient dans [00:00Z - 14 h, 00:00Z + 38 h].
  const from = Math.ceil((dayAnchor - 14 * 3_600_000) / step) * step;
  const to = dayAnchor + 38 * 3_600_000;
  const out: DaySlot[] = [];

  for (let t = from; t < to; t += step) {
    const startAt = new Date(t);
    if (startAt < input.notBefore) continue;
    if (tzParts(startAt, BUSINESS_TIMEZONE).date !== input.date) continue;
    const endAt = new Date(t + input.durationMinutes * 60_000);
    const slot = { startAt, endAt };

    const rule = SlotPolicy.matchRule(input.tutorRules, startAt, endAt, input.mode, undefined, input.offerId);
    if (!rule) continue;
    if (input.tutorBlocked.some((b) => overlaps(slot, b))) continue;
    if (MarginPolicy.findConflict({ ...slot, locationKey: input.candidateLocationKey }, input.tutorBusy, input.margins)) continue;

    if (input.room) {
      if (!SlotPolicy.matchRule(input.room.rules, startAt, endAt, 'PARTNER_ROOM', undefined, '')) continue;
      if (input.room.blocked.some((b) => overlaps(slot, b))) continue;
      if (MarginPolicy.roomOverlaps(slot, input.room.busy, input.room.turnoverMinutes)) continue;
    }
    out.push({ startAt, endAt, availabilityId: rule.id });
  }
  return out;
}
