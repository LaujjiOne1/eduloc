/**
 * Formes renvoyées par l'API /admin du backend NestJS (voir edUloc back/eduloc-backend/src/modules/admin et partners).
 * Les montants Decimal arrivent en chaîne ; les dates en ISO 8601.
 */

export interface AdminSession {
  id: string;
  firstName: string;
  lastName: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AdminSession & { isAdmin: boolean };
}

// ------------------------------------------------------------------ tableau de bord

export interface DashboardCounts {
  requesters: number;
  tutors: number;
  offers: number;
  upcomingBookings: number;
  pendingBookings: number;
  pendingApplications: number;
}

// ------------------------------------------------------------------ utilisateurs

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

export interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: UserStatus;
  isAdmin: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

// ------------------------------------------------------------------ dossiers tuteurs

export type ApplicationStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type DocumentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type DocumentType =
  | 'IDENTITY' | 'DIPLOMA' | 'CERTIFICATE' | 'PROFESSIONAL_PROOF' | 'CV' | 'TRANSCRIPT' | 'ENROLLMENT_CERTIFICATE' | 'OTHER';

export interface LevelRef {
  id: string;
  name: string;
  category: string;
  academicRank: number | null;
}

export interface EducationLevel extends LevelRef {
  displayOrder: number;
  isActive: boolean;
  requiredDegree: string;
}

export type EquivalenceStatus = 'PENDING' | 'VALIDATED' | 'REJECTED';
export type EquivalentDegree = 'BAC' | 'LICENCE' | 'MASTER' | 'DOCTORAT';

export interface DegreeEquivalence {
  id: string;
  degreeTitle: string;
  country: string;
  specialty: string | null;
  status: EquivalenceStatus;
  equivalentDegree: EquivalentDegree | null;
  equivalentLevel: LevelRef | null;
  notes: string | null;
  validatedAt: string | null;
  updatedAt: string;
}

export interface TutorDocument {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  fileName: string | null;
  mimeType: string;
  uploadedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  extractionStatus: string;
  /** Pré-contrôle automatique INDICATIF : jamais décisionnel. */
  autoCheck: unknown;
  approvalMeaning: string;
}

export interface TutorExperience {
  id: string;
  type: string;
  title: string;
  organization: string;
  period: string;
  description: string | null;
}

export interface TutorSubjectRow {
  id: string;
  subject: { name: string };
  educationLevel: { name: string };
  competenceDescription: string | null;
}

export interface TutorProfileAdmin {
  id: string;
  displayName: string | null;
  bio: string | null;
  highestDegree: string | null;
  degreeTitle: string | null;
  fieldOfStudy: string | null;
  specialization: string | null;
  degreeInstitution: string | null;
  degreeCountry: string | null;
  isVisible: boolean;
  suspendedAt: string | null;
  academicLevel: LevelRef | null;
  academicLevelNote: string | null;
  academicLevelValidatedAt: string | null;
  degreeEquivalence: DegreeEquivalence | null;
  user: { firstName: string; lastName: string; email: string };
  experiences: TutorExperience[];
  subjects: TutorSubjectRow[];
}

export interface TutorApplication {
  id: string;
  status: ApplicationStatus;
  createdAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  documents: TutorDocument[];
  tutorProfile: TutorProfileAdmin;
  degreeEquivalenceSuggestion: DegreeEquivalence | null;
}

export interface ApproveApplicationBody {
  degreeEquivalenceId?: string;
  academicLevelId?: string;
  academicLevelNote?: string;
}

export interface DecideEquivalenceBody {
  status: EquivalenceStatus;
  equivalentDegree?: EquivalentDegree;
  equivalentLevelId?: string;
  notes?: string;
}

// ------------------------------------------------------------------ offres, réservations, conflits

export interface AdminOffer {
  id: string;
  title: string;
  price: string;
  currency: string;
  durationMinutes: number;
  format: string;
  isActive: boolean;
  disabledByAdminAt: string | null;
  createdAt: string;
  subject: { name: string };
  educationLevel: { name: string } | null;
  tutorProfile: {
    id: string;
    displayName: string | null;
    suspendedAt: string | null;
    user: { firstName: string; lastName: string; email: string };
  };
}

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'REFUSED' | 'CANCELLED' | 'IN_PROGRESS' | 'COMPLETED';

export interface AdminBooking {
  id: string;
  status: BookingStatus;
  startAt: string;
  endAt: string;
  teachingMode: string;
  offerTitle: string;
  price: string;
  serviceFee: string;
  travelFee: string;
  roomFee: string | null;
  totalAmount: string;
  currency: string;
  locationLabel: string | null;
  createdAt: string;
  requester: { id: string; firstName: string; lastName: string; email: string };
  beneficiary: { firstName: string };
  tutorProfile: { id: string; displayName: string | null; user: { firstName: string; lastName: string } };
  room: { id: string; name: string; venue: { name: string } } | null;
  openConflicts: number;
}

export type ConflictStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';
export type ConflictType =
  | 'OVERLAPPING_BOOKINGS' | 'TUTOR_UNAVAILABLE' | 'AVAILABILITY_REMOVED' | 'OFFER_INACTIVE' | 'TUTOR_SUSPENDED' | 'ROOM_UNAVAILABLE';

export interface AdminConflict {
  id: string;
  type: ConflictType;
  status: ConflictStatus;
  details: Record<string, unknown> | null;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  booking: {
    id: string;
    status: BookingStatus;
    startAt: string;
    endAt: string;
    offerTitle: string;
    teachingMode: string;
  };
  resolvedBy: { firstName: string; lastName: string } | null;
}

// ------------------------------------------------------------------ lieux partenaires

export type VenueStatus =
  | 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'NEEDS_CORRECTION' | 'SUSPENDED' | 'REJECTED' | 'DISABLED';
export type RoomStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'NEEDS_CORRECTION' | 'REJECTED' | 'SUSPENDED';
export type RoomPublication = 'UNPUBLISHED' | 'PUBLISHED' | 'UNPUBLISHED_BY_ADMIN';
export type SubscriptionState = 'NOT_SELECTED' | 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

export type VenueDecision =
  | 'START_REVIEW' | 'APPROVE' | 'REQUEST_CORRECTION' | 'SUSPEND' | 'REINSTATE' | 'REJECT' | 'DISABLE';
export type RoomDecision = 'START_REVIEW' | 'APPROVE' | 'REQUEST_CORRECTION' | 'SUSPEND' | 'REINSTATE' | 'REJECT';

export interface Person {
  firstName: string;
  lastName: string;
  email: string;
}

export interface VenueSummary {
  id: string;
  name: string;
  type: string;
  status: VenueStatus;
  submittedAt: string | null;
  manager: Person;
  roomsCount: number;
  documentsCount: number;
}

export interface PartnerPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: { amount: string; currency: string };
  durationDays: number;
  isActive: boolean;
}

export interface StatusEvent {
  id: string;
  scope: 'VENUE' | 'ROOM' | 'PUBLICATION' | 'SUBSCRIPTION';
  roomId?: string | null;
  from: string | null;
  to: string;
  actorUserId: string | null;
  note: string | null;
  at: string;
}

export interface VenueDetail {
  id: string;
  name: string;
  type: string;
  description: string | null;
  legalName: string | null;
  registrationNumber: string | null;
  nif: string | null;
  stat: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  status: VenueStatus;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  manager: Person & { id: string; phone: string | null };
  documents: { id: string; type: string; fileName: string | null; mimeType: string; sizeBytes: number; uploadedAt: string; url: string }[];
  subscription: {
    id?: string;
    status: SubscriptionState;
    plan: PartnerPlan | null;
    startsAt: string | null;
    endsAt: string | null;
  };
  rooms: { id: string; name: string; status: RoomStatus; publication: RoomPublication; isActive: boolean }[];
  history: StatusEvent[];
}

export interface RoomSummary {
  id: string;
  name: string;
  status: RoomStatus;
  publication: RoomPublication;
  isActive: boolean;
  submittedAt: string | null;
  venue: { id: string; name: string; status: VenueStatus };
}

export interface RoomDetail {
  id: string;
  venue: { id: string; name: string; status: VenueStatus; managerId: string };
  name: string;
  description: string | null;
  addressLine: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  accessInstructions: string | null;
  zoneLabel: string | null;
  capacity: number | null;
  equipment: string[];
  accessibility: string[];
  welcomesMinors: boolean;
  pricePerHour: { amount: string; currency: string } | null;
  rules: string | null;
  cancellationPolicy: string | null;
  status: RoomStatus;
  publication: RoomPublication;
  isActive: boolean;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  bookable: number;
  upcomingConfirmedBookings: number;
  availabilities: { id: string; dayOfWeek: number; startTime: string; endTime: string }[];
  photos: { id: string; position: number; url: string }[];
  history: StatusEvent[];
}

export interface RoomReservation {
  id: string;
  status: BookingStatus;
  startAt: string;
  endAt: string;
  participantsCount: number;
  room: { id: string; name: string; venue: { id: string; name: string } } | null;
  tutorProfile: { id: string; displayName: string | null };
  openConflicts: { id: string; type: ConflictType; details: unknown }[];
}

export interface AdminRoomReview {
  id: string;
  bookingId: string;
  room: { id: string; name: string };
  author: { id: string; firstName: string; lastName: string };
  overall: number;
  comment: string | null;
  partnerReply: string | null;
  hiddenAt: string | null;
  hiddenReason: string | null;
  createdAt: string;
}

export interface PlanInput {
  code: string;
  name: string;
  description?: string;
  priceAmount: number;
  currency?: string;
  durationDays: number;
  isActive?: boolean;
}
