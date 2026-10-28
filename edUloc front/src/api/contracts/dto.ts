/**
 * Types du contrat sur le fil. Les variantes Backend* documentent les écarts de payload
 * entre l'API Nest et le modèle utilisé par le mock tant que les deux transports coexistent.
 */

// ---------- Utilitaires ----------
export type Uuid = string;
export type IsoDateTime = string; // "2026-10-03T11:00:00.000Z"
export type IsoDate = string; // "2026-10-03"
export type HHmm = string; // "14:00"

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface MoneyDto {
  amount: string; // "25000.00"
  currency: string; // "MGA"
}

// ---------- Enums (Prisma) ----------
export type UserStatus = "ACTIVE" | "SUSPENDED" | "PENDING_VERIFICATION";
export type TutorApplicationStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
export type TutorDocumentType = "IDENTITY" | "DIPLOMA" | "CERTIFICATE" | "PROFESSIONAL_PROOF" | "OTHER";
export type TutorDocumentStatus = "PENDING" | "APPROVED" | "REJECTED";
export type RelationshipType = "SELF" | "CHILD" | "SPOUSE" | "SIBLING" | "PARENT" | "RELATIVE" | "OTHER";
export type ObjectiveType = "BASICS" | "REMEDIAL" | "EXAM_PREP" | "EXCELLENCE" | "ONGOING" | "OTHER";
export type BackendObjectiveType = "REMEDIAL" | "ONGOING" | "EXCELLENCE";
export type DifficultyType = "THEORETICAL" | "PRACTICAL" | "METHODOLOGICAL" | "CONFIDENCE" | "OTHER";
export type TeachingFormat = "ONLINE" | "IN_PERSON" | "BOTH";
export type RhythmType = "ONE_TIME" | "OCCASIONAL" | "REGULAR" | "INTENSIVE";
export type PlaceType = "TUTOR_HOME" | "BENEFICIARY_HOME" | "PUBLIC_PLACE" | "ONLINE" | "PARTNER_ROOM";
export type BookingStatus = "PENDING" | "CONFIRMED" | "REFUSED" | "CANCELLED" | "IN_PROGRESS" | "COMPLETED";
export type BookingActor = "REQUESTER" | "TUTOR" | "SYSTEM" | "ADMIN";
export type TeachingMode = "ONLINE" | "AT_HOME_BENEFICIARY" | "AT_HOME_TUTOR" | "PUBLIC_PLACE" | "PARTNER_ROOM";
export type ConversationStatus = "OPEN" | "READ_ONLY" | "CLOSED";
export type MessageType = "VOICE" | "DOCUMENT" | "SYSTEM" | "CALL_EVENT";
export type AttachmentKind = "VOICE" | "DOCUMENT";
export type TranscriptStatus = "NONE" | "PENDING" | "DONE" | "FAILED";
export type CallType = "AUDIO" | "VIDEO";
export type CallStatus = "RINGING" | "ONGOING" | "ENDED" | "MISSED" | "DECLINED" | "CANCELLED";
export type DevicePlatform = "ANDROID" | "IOS" | "WEB";
export type ViewerRole = "REQUESTER" | "TUTOR";
export type NotificationType =
  | "BOOKING_REQUEST"
  | "BOOKING_CONFIRMED"
  | "BOOKING_REFUSED"
  | "BOOKING_CANCELLED"
  | "SESSION_STARTED"
  | "SESSION_COMPLETED"
  | "REVIEW_REQUEST"
  | "TUTOR_APPLICATION"
  | "TUTOR_APPLICATION_APPROVED"
  | "TUTOR_APPLICATION_REJECTED"
  | "TUTOR_SUSPENDED"
  | "VOICE_MESSAGE"
  | "DOCUMENT_MESSAGE"
  | "INCOMING_CALL"
  | "MISSED_CALL"
  | "REMINDER"
  | "SYSTEM";

/**
 * Code d'erreur métier renvoyé par l'API (Problem Details). Valeur stable en MAJUSCULES, ex.
 * "SLOT_UNAVAILABLE", "OTP_INVALID", "VALIDATION_FAILED". Liste complète : backend
 * src/common/errors/error-messages.ts ; la traduction en code d'écran est dans api/errors.ts.
 */
export type ErrorCode = string;

export interface ProblemDto {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  detail?: string;
  instance?: string;
  traceId?: string;
  errors?: { field: string; message: string }[];
}

// ---------- Auth / Me ----------
export interface SignupRequestDto {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}
export interface LoginRequestDto {
  email: string;
  password: string;
}
export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  expiresAt?: IsoDateTime;
  refreshExpiresAt?: IsoDateTime;
}
export interface MeTutorRoleDto {
  tutorProfileId: Uuid;
  applicationStatus: TutorApplicationStatus;
  isVisible: boolean;
  isSuspended: boolean;
}
export interface LessonAlarmDto {
  enabled: boolean;
  /** Minutes avant le début de la séance : 10, 15, 30 ou 60. */
  leadMinutes: number;
}
export interface MeDto {
  id: Uuid;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  language: string;
  timezone: string;
  status: UserStatus;
  emailVerified: boolean;
  isAdmin: boolean;
  /** Alarme de cours : rappel avant chaque séance confirmée (paramètre du compte). */
  lessonAlarm?: LessonAlarmDto;
  selfBeneficiaryId?: Uuid | null;
  tutor?: MeTutorRoleDto | null;
}
export interface AuthSessionDto {
  user: MeDto;
  tokens: AuthTokensDto;
}
export interface RegisterResultDto {
  id: Uuid;
  status: UserStatus;
}
/** Réponse de POST /auth/login ET de POST /auth/verify-email (la vérification ouvre la session). */
export interface LoginResultDto {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: IsoDateTime;
  user: Pick<MeDto, "id" | "firstName" | "lastName" | "isAdmin">;
}
export interface VerifyEmailRequestDto {
  email: string;
  /** Code à 6 chiffres reçu par e-mail. */
  code: string;
}
export interface ResetPasswordRequestDto extends VerifyEmailRequestDto {
  password: string;
}

// ---------- Géocodage (GET /geo/geocode, /geo/reverse) ----------
export interface GeoPlaceDto {
  label: string;
  latitude: number;
  longitude: number;
}

// ---------- Référentiels ----------
export interface SubjectDto {
  id: Uuid;
  name: string;
  category: string | null;
  description: string | null;
  /** Catégories de niveaux où la matière s'enseigne ; vide = tous. */
  levelCategories?: string[];
  /** Séries du lycée (codes) pour lesquelles la matière est proposée ; vide = toutes. */
  trackCodes?: string[];
  /** false = compétence libre d'un tuteur, pas encore au catalogue. */
  isVerified?: boolean;
}
export type TutorGenderDto = "MALE" | "FEMALE";
export type DegreeDto = "BAC" | "LICENCE" | "MASTER" | "DOCTORAT" | "OTHER";
export interface CreateSubjectResultDto {
  subject: SubjectDto;
  /** false = une compétence équivalente existait déjà. */
  created: boolean;
}
export interface EducationLevelDto {
  id: Uuid;
  name: string;
  category: string;
  displayOrder: number;
  requiredDegree?: "BAC" | "LICENCE" | "MASTER" | "DOCTORAT";
  /** Filière à choisir après ce niveau (GET /catalog/education-levels). */
  trackKind?: TrackKindDto | null;
}
export type TrackKindDto = "SERIE" | "MENTION";
/** GET /catalog/tracks : série du lycée ou mention universitaire (avec son Domaine mère). */
export interface AcademicTrackDto {
  id: Uuid;
  kind: TrackKindDto;
  code: string;
  name: string;
  domain: string | null;
  programme: "NOUVEAU" | "ANCIEN" | null;
  /** Série : niveau auquel elle appartient (« Première » ou « Terminale »). */
  levelName: string | null;
}
export interface EnumOptionDto<V extends string = string> {
  value: V;
  label: string;
  description?: string | null;
}
export interface ReferenceOptionsDto {
  relationships: EnumOptionDto<RelationshipType>[];
  objectives: EnumOptionDto<ObjectiveType>[];
  difficulties: EnumOptionDto<DifficultyType>[];
  formats: EnumOptionDto<TeachingFormat>[];
  rhythms: EnumOptionDto<RhythmType>[];
  teachingModes: EnumOptionDto<TeachingMode>[];
}

// ---------- Tuteurs / lieux ----------
export interface PlacePublicDto {
  id: Uuid;
  label: string;
  type: PlaceType;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  isPrimary?: boolean;
}
export interface PlaceDto extends PlacePublicDto {
  address: string | null;
  isActive: boolean;
}
export interface PlaceInputDto {
  label: string;
  type: PlaceType;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters?: number | null;
  isPrimary?: boolean;
}
export interface TutorSubjectDto {
  id: Uuid;
  subject: SubjectDto;
  educationLevel: EducationLevelDto;
  competenceDescription: string | null;
}
export interface TutorSubjectInputDto {
  subjectId: Uuid;
  educationLevelId: Uuid;
  competenceDescription?: string | null;
}
export interface TutorSummaryDto {
  id: Uuid; // TutorProfile.id
  firstName: string;
  lastName: string;
  displayName: string | null;
  profilePhoto: string | null;
  gender?: TutorGenderDto | null;
  rating: number;
  reviewsCount: number;
  isVerified: boolean;
}
export interface TutorPublicDto extends TutorSummaryDto {
  bio: string | null;
  experience: string | null;
  educationBackground: string | null;
  subjects: TutorSubjectDto[];
  places: PlacePublicDto[];
  offers: OfferSummaryDto[];
  nextSlotAt: IsoDateTime | null;
}
export interface TutorPrivateDto extends TutorPublicDto {
  birthDate: IsoDate | null;
  isVisible: boolean;
  suspendedAt: IsoDateTime | null;
  applicationStatus: TutorApplicationStatus;
}
export interface UpdateTutorProfileRequestDto {
  displayName?: string | null;
  bio?: string | null;
  birthDate?: IsoDate | null;
  profilePhoto?: string | null;
  experience?: string | null;
  educationBackground?: string | null;
}

// ---------- Offres / créneaux / disponibilités ----------
export interface OfferSummaryDto {
  id: Uuid;
  title: string;
  subject: SubjectDto;
  educationLevel: EducationLevelDto | null;
  format: TeachingFormat;
  durationMinutes: number;
  /** Durées supplémentaires proposées (minutes). Absent des réponses publiques : voir GET /booking-options/:offerId. */
  durationOptions?: number[];
  price: MoneyDto;
  isActive: boolean;
}
export interface OfferDto extends OfferSummaryDto {
  description: string;
  tutor: TutorSummaryDto;
  places: PlacePublicDto[];
  disabledByAdmin: boolean;
  createdAt: IsoDateTime;
}
export interface CreateOfferRequestDto {
  subjectId: Uuid;
  educationLevelId?: Uuid | null;
  /** Série (Première/Terminale, obligatoire) ou mention (université). */
  trackId?: Uuid | null;
  title: string;
  description: string;
  format: TeachingFormat;
  durationMinutes: number;
  /** Autres durées proposées au Demandeur (multiples de 15 min) ; le prix est proportionnel à la durée. */
  durationOptions?: number[];
  price: number;
  currency?: string;
}
export type UpdateOfferRequestDto = Partial<CreateOfferRequestDto>;

export interface SlotDto {
  availabilityId: Uuid;
  offerId: Uuid;
  placeId: Uuid | null;
  startAt: IsoDateTime;
  endAt: IsoDateTime;
  /** Mode d'enseignement déterminé par le lieu de la plage (le serveur le calcule). */
  teachingMode?: TeachingMode;
  pendingRequests?: number;
}
export interface BackendComputedSlotDto {
  availabilityId: Uuid;
  startAt: IsoDateTime;
  endAt: IsoDateTime;
  placeId: Uuid | null;
  teachingMode: TeachingMode;
}
export interface AvailabilityDto {
  id: Uuid;
  dayOfWeek: number; // 0 = dimanche
  startTime: HHmm;
  endTime: HHmm;
  timezone: string;
  validFrom: IsoDate | null;
  validUntil: IsoDate | null;
  place: PlacePublicDto | null;
  offerId: Uuid | null;
  isActive: boolean;
}
export interface AvailabilityInputDto {
  dayOfWeek: number;
  startTime: HHmm;
  endTime: HHmm;
  validFrom?: IsoDate | null;
  validUntil?: IsoDate | null;
  /** Lieu physique du tuteur. Exclusif avec `online`. */
  placeId?: Uuid | null;
  /** true : cours à distance — le serveur utilise (et crée au besoin) le lieu « En ligne ». */
  online?: boolean;
  /** true : plage réservée aux salles partenaires — le serveur utilise (et crée au besoin) le lieu « Salles partenaires ». */
  partnerRoom?: boolean;
  offerId?: Uuid | null;
  timezone?: string;
}
export interface BlockedPeriodDto {
  id: Uuid;
  startAt: IsoDateTime;
  endAt: IsoDateTime;
  reason: string | null;
}

// ---------- Bénéficiaires ----------
export interface BeneficiaryDto {
  id: Uuid;
  firstName: string;
  lastName: string | null;
  birthDate: IsoDate | null;
  relationship: RelationshipType;
  isSelf: boolean;
  educationLevel: EducationLevelDto | null;
  objective: ObjectiveType | null;
  difficultyType: DifficultyType | null;
  preferredFormat: TeachingFormat | null;
  preferredRhythm: RhythmType | null;
  notes: string | null;
}
export interface CreateBeneficiaryRequestDto {
  firstName: string;
  lastName?: string | null;
  birthDate?: IsoDate | null;
  relationship: RelationshipType;
  educationLevelId?: Uuid | null;
  objective?: ObjectiveType;
  difficultyType?: DifficultyType;
  preferredFormat?: TeachingFormat;
  preferredRhythm?: RhythmType;
  notes?: string | null;
}
export interface BackendCreateBeneficiaryRequestDto extends Omit<CreateBeneficiaryRequestDto, "objective"> {
  objective?: BackendObjectiveType;
}
export interface BackendBeneficiaryDto {
  id: Uuid;
  firstName: string;
  lastName: string | null;
  birthDate: IsoDate | null;
  relationship: RelationshipType;
  educationLevelId: Uuid | null;
  objective: BackendObjectiveType | null;
  difficultyType: DifficultyType | null;
  preferredFormat: TeachingFormat | null;
  preferredRhythm: RhythmType | null;
  notes: string | null;
}

// ---------- Réservations ----------
export interface CreateBookingRequestDto {
  offerId: Uuid;
  beneficiaryId: Uuid;
  availabilityId: Uuid;
  startAt: IsoDateTime;
  teachingMode: TeachingMode;
  placeId?: Uuid | null;
  beneficiaryAddress?: string | null;
  requesterNote?: string | null;
}
export interface BackendCreateBookingRequestDto {
  offerId: Uuid;
  beneficiaryId: Uuid;
  startAt: IsoDateTime;
  teachingMode: TeachingMode;
  placeId?: Uuid | null;
  voiceNoteUploadId?: Uuid | null;
  beneficiaryAddress?: string | null;
  requesterNote?: string | null;
  /** Salle partenaire : obligatoire si teachingMode = PARTNER_ROOM, interdite sinon. */
  roomId?: Uuid | null;
  /** Durée choisie parmi celles de l'offre ; absente = durée par défaut de l'offre. */
  durationMinutes?: number;
  participantsCount?: number;
  requiredEquipment?: string[];
  /** Position APPROXIMATIVE du lieu du cours chez le Bénéficiaire : forfait de déplacement et zone du Tuteur. */
  beneficiaryLatitude?: number;
  beneficiaryLongitude?: number;
  /** Blocage temporaire obtenu par POST /bookings/quote. */
  holdId?: Uuid;
}
/** Décomposition du prix : le Demandeur paie `total` ; le tarif du Tuteur lui revient en entier. */
export interface BookingPricingDto {
  tutorFee: MoneyDto;
  travelFee: MoneyDto;
  roomFee: MoneyDto;
  serviceFee: MoneyDto;
  serviceFeeRate: number;
  total: MoneyDto;
}
/** POST /bookings/quote : prix détaillé + créneau bloqué jusqu'à `expiresAt`. */
export interface BookingQuoteDto {
  holdId: Uuid;
  expiresAt: IsoDateTime;
  durationMinutes: number;
  currency: string;
  pricing: BookingPricingDto;
  travel: { distanceM: number; fee: number } | null;
}
export interface BookingPartyDto {
  id: Uuid;
  firstName: string;
  lastName: string | null;
}
export interface BookingBeneficiaryDto extends BookingPartyDto {
  relationship: RelationshipType;
  educationLevel: EducationLevelDto | null;
  difficultyType: DifficultyType | null;
  objective: ObjectiveType | null;
}
export interface BookingDto {
  id: Uuid;
  status: BookingStatus;
  viewerRole: ViewerRole;
  startAt: IsoDateTime;
  endAt: IsoDateTime;
  teachingMode: TeachingMode;
  offer: OfferSummaryDto;
  tutor: TutorSummaryDto;
  requester: BookingPartyDto;
  beneficiary: BookingBeneficiaryDto;
  availabilityId: Uuid | null;
  placeId: Uuid | null;
  price: MoneyDto;
  offerTitle: string;
  locationLabel: string | null;
  locationAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  requesterNote: string | null;
  /** Salle partenaire (zone approximative seulement ; l'adresse exacte est dans locationAddress après confirmation). */
  room?: { id: Uuid; name: string; zoneLabel: string | null } | null;
  participantsCount?: number;
  roomFee?: MoneyDto | null;
  pricing?: BookingPricingDto;
  /** Instructions d'accès : renvoyées seulement une fois la séance confirmée. */
  roomAccessInstructions?: string | null;
  startedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  cancelledBy: BookingActor | null;
  cancellationReason: string | null;
  refusalReason: string | null;
  conversationId: Uuid | null;
  hasReview: boolean;
  /** Vue tuteur d'une demande en attente : autres demandes en attente sur le même horaire. */
  competingRequests?: CompetingRequestDto[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
export interface CompetingRequestDto {
  id: Uuid;
  beneficiaryFirstName: string;
  requesterName: string;
  startAt: IsoDateTime;
  endAt: IsoDateTime;
  createdAt: IsoDateTime;
}
export interface BookingOtpDto {
  otp: string;
  expiresAt?: IsoDateTime;
  bookingId?: Uuid;
}
export interface BookingEventDto {
  id: Uuid;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  actor: BookingActor;
  reason: string | null;
  createdAt: IsoDateTime;
}

// ---------- Avis ----------
export interface CreateReviewRequestDto {
  rating: number;
  text?: string | null;
}
export interface ReviewDto {
  id: Uuid;
  bookingId: Uuid;
  rating: number;
  text: string | null;
  authorFirstName: string;
  officialReply: string | null;
  repliedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}
/** Réponse de POST /reviews et GET /reviews/tutors/:id (avis public : prénom de l'auteur seulement). */
export interface BackendReviewDto {
  id: Uuid;
  bookingId: Uuid;
  rating: number;
  text: string | null;
  authorFirstName?: string;
  officialReply: string | null;
  repliedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  requester?: {
    firstName: string;
    lastName: string | null;
  };
}

// ---------- Recherche ----------
export interface SearchOffersQuery {
  subjectId: Uuid;
  levelId?: Uuid;
  /** ONLINE : sans coordonnées ; IN_PERSON : lat/lng obligatoires ; BOTH/absent : les deux. */
  format?: TeachingFormat;
  lat?: number;
  lng?: number;
  radiusM?: number;
  limit?: number;
}
export interface SearchOfferRowDto {
  offerId: Uuid;
  tutorProfileId: Uuid;
  distanceM: number | null;
  title: string;
  price: number;
  durationMinutes: number;
  format: TeachingFormat;
  displayName: string | null;
  rating: number;
  reviewsCount: number;
  placeId: Uuid | null;
  placeLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  nextSlots: SlotDto[];
}
/** POST /matching/search (niveau universitaire) : tuteurs ÉLIGIBLES par le niveau, classés par pertinence. */
export interface MatchingResultDto {
  tutorProfileId: string;
  displayName: string;
  profilePhoto: string | null;
  rating: number;
  reviewsCount: number;
  /** Libellés (jamais d'extrait de document) : « Matière : … », « Diplôme vérifié »… */
  matchReasons: string[];
  offers: { id: string; title: string; price: string; currency: string; format: TeachingFormat }[];
  nextSlots: SlotDto[];
  hasNearSlot: boolean;
}
export interface MatchingSearchResponseDto {
  searchId: string;
  results: MatchingResultDto[];
  reason?: "NO_TUTOR_FOR_LEVEL" | "NO_TUTOR_FOR_FORMAT" | "NO_RELEVANT_TUTOR";
}
/** Niveau non universitaire : le serveur applique la recherche classique (mêmes résultats que GET /search/offers). */
export interface ClassicMatchingResponseDto {
  mode: "CLASSIC";
  results: SearchResultDto[];
  reason?: "NO_TUTOR_FOR_LEVEL" | "NO_TUTOR_FOR_FORMAT";
}
export interface SearchResultDto {
  tutor: TutorSummaryDto;
  subjects: string[];
  levels: string[];
  offers: OfferSummaryDto[];
  nearestPlace: PlacePublicDto | null;
  distanceMeters: number | null;
  nextSlotAt: IsoDateTime | null;
  bioExcerpt: string | null;
}

// ---------- Candidature ----------
export interface TutorApplicationInputDto {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  displayName?: string | null;
  bio?: string | null;
  birthDate?: IsoDate | null;
  experience?: string | null;
  educationBackground?: string | null;
  highestDegree?: DegreeDto | null;
  gender?: TutorGenderDto | null;
  experiences: {
    type: "TEACHING" | "SUPERVISION" | "PROFESSIONAL" | "ACADEMIC" | "VOLUNTEER";
    title: string;
    organization: string;
    period: string;
    audience?: string[];
    subjectsTaught?: string | null;
    description?: string | null;
  }[];
  subjects: TutorSubjectInputDto[];
  offers: CreateOfferRequestDto[];
  places: (PlaceInputDto & { radiusMeters?: number | null; isPrimary: boolean })[];
  availabilities: {
    dayOfWeek: number;
    startTime: HHmm;
    endTime: HHmm;
    format: TeachingFormat;
    placeIndex?: number | null;
    timezone?: string;
    /** Disponibilité ponctuelle : le jour précis (AAAA-MM-JJ). Absent = chaque semaine. */
    date?: IsoDate;
  }[];
}
export interface TutorDocumentDto {
  id: Uuid;
  type: TutorDocumentType;
  status: TutorDocumentStatus;
  fileName: string | null;
  mimeType: string;
  sizeBytes: number;
  rejectionReason: string | null;
  uploadedAt: IsoDateTime;
}
export interface TutorApplicationDto {
  id: Uuid;
  tutorProfileId: Uuid;
  status: TutorApplicationStatus;
  submittedAt: IsoDateTime | null;
  reviewedAt: IsoDateTime | null;
  rejectionReason: string | null;
  subjects: TutorSubjectDto[];
  documents: TutorDocumentDto[];
  experiences?: {
    id: Uuid;
    type: "TEACHING" | "SUPERVISION" | "PROFESSIONAL" | "ACADEMIC" | "VOLUNTEER";
    title: string;
    organization: string;
    period: string;
    audience?: string[];
    subjectsTaught?: string | null;
    description: string | null;
  }[];
  introVideo?: {
    fileName: string | null;
    mimeType: string;
    sizeBytes: number;
    durationMs: number | null;
    uploadedAt: IsoDateTime;
  } | null;
  createdAt: IsoDateTime;
}

// ---------- Conversations ----------
export interface ConversationDto {
  id: Uuid;
  status: ConversationStatus;
  viewerRole: ViewerRole;
  requester: BookingPartyDto;
  tutor: TutorSummaryDto;
  bookingId: Uuid | null;
  lastMessageType: MessageType | null;
  lastMessagePreview: string | null;
  lastMessageAt: IsoDateTime | null;
  unreadCount: number;
  canSend: boolean;
  canCall: boolean;
}
export interface AttachmentDto {
  id: Uuid;
  kind: AttachmentKind;
  mimeType: string;
  sizeBytes: number;
  fileName: string | null;
  durationMs: number | null;
  waveform: number[] | null;
  transcriptStatus: TranscriptStatus;
  transcript: string | null;
}
export interface MessageDto {
  id: Uuid;
  conversationId: Uuid;
  senderId: Uuid | null;
  senderFirstName: string | null;
  isMine: boolean;
  type: MessageType;
  clientMessageId: string;
  systemText: string | null;
  replyToId: Uuid | null;
  attachment: AttachmentDto | null;
  callSessionId: Uuid | null;
  listenedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}
export interface RequestUploadRequestDto {
  kind: AttachmentKind;
  mimeType: string;
  sizeBytes: number;
  durationMs?: number;
  fileName?: string;
}
export interface UploadTicketDto {
  uploadId: string;
  signedUrl: string;
  token: string;
  expiresAt?: IsoDateTime;
  messageId?: Uuid;
}
export interface SendMessageRequestDto {
  type: "VOICE" | "DOCUMENT";
  uploadId: string;
  clientMessageId: string;
  waveform?: number[];
  replyToId?: Uuid;
}

// ---------- Notifications ----------
export interface NotificationDto {
  id: Uuid;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  linkUrl: string | null;
  createdAt: IsoDateTime;
}
export interface NotificationPageDto extends Page<NotificationDto> {
  unreadCount: number;
}

// ---------- Appels ----------
export interface CallJoinDto {
  callId: Uuid;
  roomName: string;
  livekitUrl: string;
  token: string;
  type: CallType;
  status: CallStatus;
}


// ---------- Salles partenaires (lieux d'étude) ----------
export type VenueType = "TRAINING_CENTER" | "SCHOOL" | "LIBRARY" | "COWORKING" | "COMPANY" | "ASSOCIATION" | "COMMUNITY_CENTER" | "OTHER";
/** REJECTED = Refusé (motif dans reviewNote, nouvelle soumission possible) ; DISABLED = Désactivé par EduLoc. */
export type VenueStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "NEEDS_CORRECTION" | "SUSPENDED" | "REJECTED" | "DISABLED";
export type RoomStatus = VenueStatus;
export type RoomPublication = "UNPUBLISHED" | "PUBLISHED" | "UNPUBLISHED_BY_ADMIN";
export type SubscriptionStatus = "NOT_SELECTED" | "PENDING" | "ACTIVE" | "EXPIRED" | "CANCELLED";
export type VenueDocumentType = "OWNERSHIP_PROOF" | "BUSINESS_REGISTRATION" | "MANAGER_IDENTITY" | "INSURANCE" | "OTHER";

/** Fiche PUBLIQUE d'une salle : jamais d'adresse exacte, de coordonnées ni d'instructions d'accès. */
export interface PublicRoomDto {
  id: Uuid;
  name: string;
  description: string | null;
  zoneLabel: string | null;
  venueType: VenueType;
  capacity: number;
  equipment: string[];
  accessibility: string[];
  welcomesMinors: boolean;
  pricePerHour: MoneyDto | null;
  /** Moyenne des avis visibles (0 sans avis) et leur nombre. */
  rating: number;
  reviewsCount: number;
  rules: string | null;
  cancellationPolicy: string | null;
  openingHours: { dayOfWeek: number; startTime: HHmm; endTime: HHmm; validFrom: IsoDate | null; validUntil: IsoDate | null }[];
  photos: { id: Uuid; url: string }[];
  /** Distance estimée, arrondie au 500 m supérieur. */
  distanceMeters: number | null;
}
/** GET /tutors/me/rooms */
export interface AcceptedRoomDto extends PublicRoomDto {
  bookable: boolean;
  acceptedSince: IsoDateTime;
}
/** GET /booking-options/:offerId */
export interface BookingOptionsDto {
  offerId: Uuid;
  tutorId: Uuid;
  format: TeachingFormat;
  minNoticeHours: number;
  durations: { minutes: number; price: MoneyDto }[];
  modes: TeachingMode[];
  rooms: PublicRoomDto[];
}
/** GET /booking-options/:offerId/slots?date=&mode=&roomId=&durationMinutes= */
export interface DaySlotsDto {
  date: IsoDate;
  timezone: string;
  mode: TeachingMode;
  roomId: Uuid | null;
  durationMinutes: number;
  minNoticeHours: number;
  slots: { startAt: IsoDateTime; endAt: IsoDateTime }[];
}
