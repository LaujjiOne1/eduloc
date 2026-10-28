/**
 * Contrat de l'espace Gestionnaire de lieu (/partner/*) et de l'administration des lieux partenaires.
 * Source : modules partners / rooms du backend (voir README « Lieux partenaires »).
 */
import type {
  BookingStatus,
  HHmm,
  IsoDate,
  IsoDateTime,
  MoneyDto,
  RoomPublication,
  RoomStatus,
  SubscriptionStatus,
  Uuid,
  VenueDocumentType,
  VenueStatus,
  VenueType,
} from "./dto";

export interface PartnerPlanDto {
  id: Uuid;
  code: string;
  name: string;
  description: string | null;
  price: MoneyDto;
  durationDays: number;
  isActive: boolean;
}
export interface PartnerSubscriptionDto {
  id?: Uuid;
  status: SubscriptionStatus;
  plan: PartnerPlanDto | null;
  startsAt: IsoDateTime | null;
  endsAt: IsoDateTime | null;
}
export interface PartnerStatusEventDto {
  id: Uuid;
  /** VENUE | ROOM | PUBLICATION | SUBSCRIPTION */
  scope: string;
  roomId: Uuid | null;
  from: string | null;
  to: string;
  note: string | null;
  at: IsoDateTime;
}
export interface PartnerVenueDto {
  id: Uuid;
  name: string;
  type: VenueType;
  description: string | null;
  legalName: string | null;
  registrationNumber: string | null;
  nif: string | null;
  stat: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  status: VenueStatus;
  /** Dernière décision de l'administrateur (corrections demandées, motif de suspension…). */
  reviewNote: string | null;
  submittedAt: IsoDateTime | null;
  reviewedAt: IsoDateTime | null;
  documents: {
    id: Uuid;
    type: VenueDocumentType;
    fileName: string | null;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: IsoDateTime;
  }[];
  subscription: PartnerSubscriptionDto;
  rooms: {
    id: Uuid;
    name: string;
    status: RoomStatus;
    publication: RoomPublication;
    isActive: boolean;
    reviewNote: string | null;
    bookable: boolean;
  }[];
  history: PartnerStatusEventDto[];
}
export interface PartnerVenueInputDto {
  name?: string;
  type?: VenueType;
  description?: string;
  legalName?: string;
  registrationNumber?: string;
  nif?: string;
  stat?: string;
  contactPhone?: string;
  contactEmail?: string;
}
export interface PartnerRoomOpeningDto {
  id?: Uuid;
  dayOfWeek: number;
  startTime: HHmm;
  endTime: HHmm;
  validFrom?: IsoDate | null;
  validUntil?: IsoDate | null;
}
export interface PartnerRoomDto {
  id: Uuid;
  venueId: Uuid;
  name: string;
  description: string | null;
  /** Position EXACTE : visible du seul Gestionnaire (et de l'administration), jamais du public. */
  addressLine: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  accessInstructions: string | null;
  zoneLabel: string | null;
  capacity: number;
  equipment: string[];
  accessibility: string[];
  welcomesMinors: boolean;
  pricePerHour: MoneyDto | null;
  rules: string | null;
  cancellationPolicy: string | null;
  status: RoomStatus;
  publication: RoomPublication;
  isActive: boolean;
  reviewNote: string | null;
  submittedAt: IsoDateTime | null;
  reviewedAt: IsoDateTime | null;
  bookable: boolean;
  /** Champs à compléter avant de pouvoir soumettre (brouillon / corrections). */
  missingFields: string[];
  availabilities: (PartnerRoomOpeningDto & { id: Uuid })[];
  photos: { id: Uuid; position: number; url: string }[];
}
export interface PartnerRoomInputDto {
  name?: string;
  description?: string;
  addressLine?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  accessInstructions?: string;
  zoneLabel?: string;
  capacity?: number;
  equipment?: string[];
  accessibility?: string[];
  welcomesMinors?: boolean;
  pricePerHour?: number;
  rules?: string;
  cancellationPolicy?: string;
}
export interface PartnerRoomBlockDto {
  id: Uuid;
  roomId: Uuid;
  startAt: IsoDateTime;
  endAt: IsoDateTime;
  reason: string | null;
}
export interface PartnerReplaceAvailabilitiesResultDto {
  availabilities: (PartnerRoomOpeningDto & { id: Uuid })[];
  /** Séances confirmées qui sortent des nouvelles plages : jamais annulées en silence, à honorer. */
  uncoveredConfirmedBookings: number;
}
export interface PartnerReservationDto {
  id: Uuid;
  roomId: Uuid;
  roomName: string | null;
  startAt: IsoDateTime;
  endAt: IsoDateTime;
  status: BookingStatus;
  participantsCount: number;
  offerTitle: string;
  tutorName: string;
}
export interface PartnerUploadTicketDto {
  uploadId: Uuid;
  signedUrl: string;
  token: string;
  expiresAt?: IsoDateTime;
}
