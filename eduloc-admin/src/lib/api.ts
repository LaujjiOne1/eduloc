/** Appels de l'API /admin, un par action que l'administrateur peut réellement effectuer. */
import { request } from './http';
import type {
  AdminBooking, AdminConflict, AdminOffer, AdminRoomReview, AdminUser, ApplicationStatus, ApproveApplicationBody,
  BookingStatus, ConflictStatus, DashboardCounts, DecideEquivalenceBody, DegreeEquivalence, EducationLevel,
  EquivalenceStatus, PartnerPlan, PlanInput, RoomDecision, RoomDetail, RoomReservation, RoomSummary,
  TutorApplication, UserStatus, VenueDecision, VenueDetail, VenueSummary,
} from '../types';

const post = <T = { ok: true }>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ?? {} });

export const adminApi = {
  dashboard: () => request<DashboardCounts>('/admin/dashboard'),
  reindexAll: () => post<{ queued: number }>('/admin/matching/reindex'),

  // ---- utilisateurs
  users: (q: { search?: string; status?: string; page: number }) => request<AdminUser[]>('/admin/users', { query: q }),
  setUserStatus: (id: string, status: Exclude<UserStatus, 'PENDING_VERIFICATION'>) =>
    post(`/admin/users/${id}/status`, { status }),

  // ---- dossiers tuteurs
  applications: (status?: ApplicationStatus) =>
    request<TutorApplication[]>('/admin/tutor-applications', { query: { status } }),
  approveApplication: (id: string, body: ApproveApplicationBody) => post(`/admin/tutor-applications/${id}/approve`, body),
  rejectApplication: (id: string, reason: string) => post(`/admin/tutor-applications/${id}/reject`, { reason }),
  reviewDocument: (id: string, body: { status: 'APPROVED' | 'REJECTED'; rejectionReason?: string; confirmAuthenticity?: boolean }) =>
    post<{ ok: true; status: string }>(`/admin/tutor-documents/${id}/review`, body),
  documentUrl: (id: string) =>
    request<{ url: string; mimeType: string; fileName: string | null }>(`/admin/tutor-documents/${id}/url`),
  suspendTutor: (tutorProfileId: string, reason: string) =>
    post<{ ok: true; affectedBookings: number }>(`/admin/tutors/${tutorProfileId}/suspend`, { reason }),
  reinstateTutor: (tutorProfileId: string, reason?: string) =>
    post<{ ok: true; dismissedConflicts: number }>(`/admin/tutors/${tutorProfileId}/reinstate`, { reason }),
  reindexTutor: (tutorProfileId: string) => post<{ queued: number }>(`/admin/tutors/${tutorProfileId}/reindex`),
  setAcademicLevel: (tutorProfileId: string, academicLevelId: string, note?: string) =>
    request(`/admin/tutors/${tutorProfileId}/academic-level`, { method: 'PUT', body: { academicLevelId, note } }),
  revokeAcademicLevel: (tutorProfileId: string) =>
    request(`/admin/tutors/${tutorProfileId}/academic-level`, { method: 'DELETE' }),
  applyEquivalence: (applicationId: string, degreeEquivalenceId: string) =>
    post(`/admin/tutor-applications/${applicationId}/degree-equivalence`, { degreeEquivalenceId }),
  educationLevels: () => request<EducationLevel[]>('/catalog/education-levels'),

  // ---- équivalences de diplômes
  equivalences: (q: { status?: EquivalenceStatus; search?: string; page: number }) =>
    request<DegreeEquivalence[]>('/admin/degree-equivalences', { query: q }),
  createEquivalence: (body: DecideEquivalenceBody & { degreeTitle: string; country: string; specialty?: string }) =>
    post<DegreeEquivalence>('/admin/degree-equivalences', body),
  decideEquivalence: (id: string, body: DecideEquivalenceBody) =>
    request<DegreeEquivalence>(`/admin/degree-equivalences/${id}`, { method: 'PATCH', body }),

  // ---- offres, réservations, conflits
  offers: (q: { search?: string; state?: string; page: number }) => request<AdminOffer[]>('/admin/offers', { query: q }),
  moderateOffer: (id: string, action: 'disable' | 'enable') => post(`/admin/offers/${id}/moderation`, { action }),
  bookings: (q: { status?: BookingStatus; page: number }) => request<AdminBooking[]>('/admin/bookings', { query: q }),
  conflicts: (status?: ConflictStatus) => request<AdminConflict[]>('/admin/conflicts', { query: { status } }),
  resolveConflict: (id: string, resolution: string) => post(`/admin/conflicts/${id}/resolve`, { resolution }),
  dismissConflict: (id: string) => post(`/admin/conflicts/${id}/dismiss`),

  // ---- lieux partenaires
  venues: (status?: string) => request<VenueSummary[]>('/admin/partners/venues', { query: { status, limit: 200 } }),
  venue: (id: string) => request<VenueDetail>(`/admin/partners/venues/${id}`),
  reviewVenue: (id: string, decision: VenueDecision, note?: string) =>
    post<VenueDetail>(`/admin/partners/venues/${id}/review`, { decision, note }),
  activateSubscription: (venueId: string) => post(`/admin/partners/venues/${venueId}/subscription/activate`),
  cancelSubscription: (venueId: string, note?: string) => post(`/admin/partners/venues/${venueId}/subscription/cancel`, { note }),
  rooms: (status?: string) => request<RoomSummary[]>('/admin/partners/rooms', { query: { status, limit: 200 } }),
  room: (id: string) => request<RoomDetail>(`/admin/partners/rooms/${id}`),
  reviewRoom: (id: string, decision: RoomDecision, note?: string) =>
    post<RoomDetail>(`/admin/partners/rooms/${id}/review`, { decision, note }),
  decidePublication: (id: string, action: 'UNPUBLISH' | 'RESTORE', note?: string) =>
    post<RoomDetail>(`/admin/partners/rooms/${id}/publication`, { action, note }),
  roomReservations: (status?: string) =>
    request<RoomReservation[]>('/admin/partners/reservations', { query: { status, limit: 200 } }),
  roomReviews: (hidden?: boolean) =>
    request<AdminRoomReview[]>('/admin/partners/room-reviews', { query: { hidden, limit: 200 } }),
  hideRoomReview: (id: string, reason: string) => post(`/admin/partners/room-reviews/${id}/hide`, { reason }),
  unhideRoomReview: (id: string) => post(`/admin/partners/room-reviews/${id}/unhide`),
  plans: () => request<PartnerPlan[]>('/admin/partners/plans'),
  createPlan: (body: PlanInput) => post<PartnerPlan>('/admin/partners/plans', body),
  updatePlan: (id: string, body: Partial<PlanInput>) =>
    request<PartnerPlan>(`/admin/partners/plans/${id}`, { method: 'PATCH', body }),
};
