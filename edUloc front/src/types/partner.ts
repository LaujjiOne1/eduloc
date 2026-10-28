import type { BookingStatus } from "./booking";

export type VenueStatusId = "draft" | "submitted" | "under_review" | "approved" | "needs_correction" | "suspended" | "rejected" | "disabled";
export type RoomStatusId = VenueStatusId;
export type RoomPublicationId = "unpublished" | "published" | "unpublished_by_admin";
export type SubscriptionStatusId = "not_selected" | "pending" | "active" | "expired" | "cancelled";
export type VenueTypeId = "training_center" | "school" | "library" | "coworking" | "company" | "association" | "community_center" | "other";
export type VenueDocumentKind = "ownership_proof" | "business_registration" | "manager_identity" | "insurance" | "other";

export interface PartnerPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceLabel: string;
  isFree: boolean;
  durationLabel: string;
}

export interface PartnerSubscription {
  status: SubscriptionStatusId;
  plan: PartnerPlan | null;
  /** « jusqu'au 12 octobre 2027 » — null sans souscription active. */
  validUntilLabel: string | null;
}

export interface PartnerHistoryEntry {
  id: string;
  scope: "venue" | "room" | "publication" | "subscription";
  roomId: string | null;
  fromLabel: string | null;
  toLabel: string;
  note: string | null;
  atLabel: string;
}

export interface PartnerRoomSummary {
  id: string;
  name: string;
  status: RoomStatusId;
  publication: RoomPublicationId;
  isActive: boolean;
  reviewNote: string | null;
  /** Réservable maintenant : salle + structure validées, publiée, active, offre commerciale en cours. */
  bookable: boolean;
}

export interface PartnerVenue {
  id: string;
  name: string;
  type: VenueTypeId;
  description: string;
  legalName: string;
  registrationNumber: string;
  /** Facultatifs ; obligatoires pour devenir « Partenaire vérifié ». Jamais affichés au public. */
  nif: string;
  stat: string;
  contactPhone: string;
  contactEmail: string;
  status: VenueStatusId;
  reviewNote: string | null;
  /** Modifiable par le Gestionnaire (brouillon ou corrections demandées). */
  editable: boolean;
  documents: { id: string; kind: VenueDocumentKind; fileName: string; sizeLabel: string }[];
  subscription: PartnerSubscription;
  rooms: PartnerRoomSummary[];
  history: PartnerHistoryEntry[];
}

export interface PartnerVenueInput {
  name: string;
  type: VenueTypeId;
  description: string;
  legalName: string;
  registrationNumber: string;
  nif: string;
  stat: string;
  contactPhone: string;
  contactEmail: string;
}

export interface RoomOpening {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  validFrom: string | null;
  validUntil: string | null;
  label: string;
}

export interface PartnerRoomDetail {
  id: string;
  name: string;
  description: string;
  addressLine: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  accessInstructions: string;
  zoneLabel: string;
  capacity: number;
  equipment: string[];
  accessibility: string[];
  welcomesMinors: boolean;
  pricePerHour: string;
  rules: string;
  cancellationPolicy: string;
  status: RoomStatusId;
  publication: RoomPublicationId;
  isActive: boolean;
  reviewNote: string | null;
  bookable: boolean;
  /** Informations manquantes avant soumission. */
  missingFields: string[];
  /** Modifiable librement (brouillon ou corrections demandées). */
  editable: boolean;
  /** Une salle validée garde figés son nom, son adresse, sa zone et son accueil des mineurs. */
  identityLocked: boolean;
  openings: RoomOpening[];
  photos: { id: string; url: string }[];
}

export interface PartnerRoomInput {
  name: string;
  description: string;
  addressLine: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  accessInstructions: string;
  zoneLabel: string;
  capacity: number;
  equipment: string[];
  accessibility: string[];
  welcomesMinors: boolean;
  pricePerHour: number | null;
  rules: string;
  cancellationPolicy: string;
}

export interface RoomBlock {
  id: string;
  startAt: string;
  endAt: string;
  label: string;
  reason: string | null;
}

export interface PartnerReservation {
  id: string;
  roomId: string;
  roomName: string;
  dateLabel: string;
  timeRangeLabel: string;
  status: BookingStatus;
  participantsCount: number;
  offerTitle: string;
  tutorName: string;
}
