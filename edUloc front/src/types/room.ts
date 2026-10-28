import type { TeachingModeId } from "./booking";

/** Fiche publique d'une salle partenaire : jamais d'adresse exacte (spec lieux partenaires §9). */
export interface PartnerRoom {
  id: string;
  name: string;
  description: string | null;
  /** Zone approximative (quartier, ville) — seul repère géographique avant la confirmation. */
  zoneLabel: string | null;
  capacity: number;
  equipment: string[];
  accessibility: string[];
  welcomesMinors: boolean;
  pricePerHour: { amount: number; currency: string } | null;
  pricePerHourLabel: string | null;
  rules: string | null;
  cancellationPolicy: string | null;
  openingHours: { dayOfWeek: number; startTime: string; endTime: string }[];
  photos: { id: string; url: string }[];
  /** « ≈ 1,5 km » — distance estimée arrondie, null sans position. */
  distanceLabel: string | null;
}

/** Salle déclarée par le tuteur (« j'accepte d'intervenir ici »). Ne réserve rien. */
export interface AcceptedRoom extends PartnerRoom {
  /** false : dépubliée / suspendue / offre expirée — les nouvelles demandes sont impossibles. */
  bookable: boolean;
}

export interface BookingDuration {
  minutes: number;
  label: string;
  priceLabel: string;
}

/** Ce que le Demandeur peut choisir pour une offre : calculé par le backend, jamais déduit côté écran. */
export interface BookingOptions {
  offerId: string;
  minNoticeHours: number;
  durations: BookingDuration[];
  modes: TeachingModeId[];
  rooms: PartnerRoom[];
}
