import type { FormatId } from "./common";

/**
 * [v1~] Une disponibilité = une RÈGLE (Prisma Availability), pas un rendez-vous.
 *  - kind "recurring" : chaque semaine le `dayOfWeek`
 *  - kind "one_off"   : un seul jour (validFrom = validUntil = date) — D-03
 */
export interface TutorAvailabilitySlot {
  id: string;
  kind: "recurring" | "one_off"; // [v1+]
  dayOfWeek: number; // [v1+] 0 = dimanche
  dayLabel: string; // [v1+] "Chaque samedi" / "Samedi 3 octobre"
  date: string | null; // [v1~] null pour une règle récurrente
  dateLabel: string; // = dayLabel (compat)
  startTime: string;
  endTime: string;
  timeRangeLabel: string;
  placeId: string | null; // [v1+]
  offerId: string | null; // [v1+]
  format: FormatId; // dérivé du lieu (ONLINE → online)
  locationLabel: string;
}

export type TutorAvailabilityDraft =
  | {
      kind: "one_off";
      date: string; // YYYY-MM-DD
      startTime: string;
      endTime: string;
      placeId: string | null;
      offerId?: string | null;
    }
  | {
      kind: "recurring";
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      placeId: string | null;
      offerId?: string | null;
      validFrom?: string | null;
      validUntil?: string | null;
    };

/** Occurrence concrète pour le calendrier (56_TutorCalendar). */
export interface CalendarOccurrence {
  date: string;
  dateLabel: string;
  startTime: string;
  endTime: string;
  timeRangeLabel: string;
  kind: "availability" | "booking";
  /** Créneau issu d'une règle hebdomadaire (« chaque semaine ») plutôt que d'une date unique. */
  recurring?: boolean;
  availabilityId?: string;
  bookingId?: string;
  label: string;
}
