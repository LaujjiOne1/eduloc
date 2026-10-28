import type { TeachingModeId } from "./booking";
import type { FormatId, LocationFormatId, TutorGender } from "./common";

export type SlotStatus = "available" | "unavailable";

/** Créneau calculé par GET /tutors/:id/slots (non persisté). */
export interface OfferSlot {
  id: string; // [v1~] `${availabilityId}@${startAt}`
  availabilityId: string; // [v1+]
  placeId: string | null; // [v1+]
  startAt: string; // [v1+] ISO UTC — c'est ce qui est envoyé à POST /bookings
  endAt: string; // [v1+]
  /** Mode d'enseignement du créneau (calculé par le serveur d'après le lieu) — ce qui est réservé. */
  teachingMode: TeachingModeId | null;
  date: string; // date locale YYYY-MM-DD
  dateLabel: string;
  startTime: string;
  endTime: string;
  timeRangeLabel: string;
  status: SlotStatus;
  pendingRequests: number; // [v1+]
}

export interface OfferPlace {
  id: string;
  label: string;
  type: "tutor_home" | "beneficiary_home" | "public_place" | "online" | "partner_room";
}

export interface Offer {
  id: string;
  tutorId: string; // TutorProfile.id
  tutorName: string;
  tutorInitial: string;
  tutorGender: TutorGender | null;
  tutorPhotoUrl: string | null;
  title: string;
  description: string;
  subjectId: string; // [v1+]
  subjectLabel: string;
  levelId: string | null; // [v1+]
  levelLabel: string;
  durationMinutes: number; // [v1+]
  durationLabel: string;
  /** Autres durées proposées (minutes), en plus de durationMinutes. */
  durationOptions: number[];
  format: LocationFormatId; // [v1+] valeur unique (TeachingFormat)
  formats: FormatId[]; // dérivé de `format` (BOTH → ["in_person","online"])
  places: OfferPlace[]; // [v1+]
  location: string; // libellé dérivé des lieux
  price: { amount: number; currency: string }; // [v1+]
  priceLabel: string; // [v1+] "25 000 Ar"
  isActive: boolean;
  isDisabledByAdmin: boolean; // [v1+]
  /** Chargés séparément (GET /tutors/:id/slots). Vide pour les listes. */
  slots: OfferSlot[];
}

/** [v1~] Entrée alignée sur CreateOfferRequest (ids, minutes, prix) — plus de libellés. */
export interface CreateOfferInput {
  title: string;
  description: string;
  subjectId: string;
  levelId: string | null;
  /** Série (Première/Terminale, obligatoire) ou mention (université, facultative). */
  trackId?: string | null;
  format: LocationFormatId;
  durationMinutes: number;
  durationOptions?: number[];
  price: number;
}
export type UpdateOfferInput = Partial<CreateOfferInput>;
