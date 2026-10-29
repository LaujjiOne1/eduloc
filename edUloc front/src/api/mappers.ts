/**
 * DTO (contrat API) → View Models (écrans). SEUL endroit qui connaît les deux formes.
 * Si l'API change, on modifie dto.ts + ce fichier ; les écrans ne bougent pas.
 */
import type * as D from "./contracts/dto";
import * as F from "./format/datetime";
import type { AuthenticatedUser } from "@/types/auth";
import type { AvatarTone, FormatId, LevelRef, LocationFormatId, TutorGender } from "@/types/common";
import type { Category } from "@/types/category";
import type { AcademicTrack } from "@/types/track";
import type { BeneficiaryType, EducationLevel, LearningObjective, LocationFormatOption } from "@/types/search";
import type { Offer, OfferPlace, OfferSlot } from "@/types/offer";
import type { Tutor, TutorOfferSummary } from "@/types/tutor";
import type { TutorProfileSummary } from "@/types/tutor-profile";
import type { DifficultyId, Relationship, SavedBeneficiary } from "@/types/beneficiary";
import type { Booking, BookingOffer, BookingPricing, BookingQuote, PriceBreakdownLine, TeachingModeId } from "@/types/booking";
import type { AcceptedRoom, BookingOptions, PartnerRoom } from "@/types/room";
import type { TutorAvailabilitySlot } from "@/types/availability";
import type { ConversationMessage, ConversationSummary } from "@/types/message";
import type { AppNotification, AppNotificationType } from "@/types/notification";
import type { TutorReview } from "@/types/review";
import type { TutorApplication, TutorDocumentKind, TutorSkill } from "@/types/tutor-application";
import { currentIntlLocale, t as tr } from "@/i18n";

// ---------- enums ----------
export const lower = <T extends string>(v: T) => v.toLowerCase() as Lowercase<T>;
export const upper = <T extends string>(v: T) => v.toUpperCase() as Uppercase<T>;

export const RELATION_LABELS: Record<D.RelationshipType, string | null> = {
  SELF: null,
  get CHILD() { return tr("common.myChild"); },
  get SPOUSE() { return tr("common.mySpouse"); },
  get SIBLING() { return tr("common.myBrotherSister"); },
  get PARENT() { return tr("common.myParent"); },
  get RELATIVE() { return tr("common.aRelative"); },
  get OTHER() { return tr("common.anotherPerson"); },
};

/** Libellés d'affichage des enums du bénéficiaire (la source de vérité des valeurs est le backend). */
export const OBJECTIVE_LABELS: Record<string, string> = {
  get remedial() { return tr("common.catchUp"); },
  get ongoing() { return tr("common.regularSupport"); },
  get excellence() { return tr("common.goDeeper"); },
};
export const DIFFICULTY_LABELS: Record<string, string> = {
  get theoretical() { return tr("common.theoreticalUnderstanding"); },
  get practical() { return tr("common.practicalApplication"); },
  get methodological() { return tr("common.workMethod"); },
  get confidence() { return tr("common.selfConfidence"); },
  get other() { return tr("common.other"); },
};

export function formatToList(format: D.TeachingFormat): FormatId[] {
  if (format === "BOTH") return ["in_person", "online"];
  return format === "ONLINE" ? ["online"] : ["in_person"];
}
export function formatToVm(format: D.TeachingFormat): LocationFormatId {
  return format === "IN_PERSON" ? "in_person" : format === "ONLINE" ? "online" : "both";
}
export function formatToDto(format: LocationFormatId): D.TeachingFormat {
  return format === "in_person" ? "IN_PERSON" : format === "online" ? "ONLINE" : "BOTH";
}
export function teachingModeToFormat(mode: D.TeachingMode): FormatId {
  return mode === "ONLINE" ? "online" : "in_person";
}

/** Couleur d'avatar stable dérivée de l'id (donnée purement UI). */
const TONES: AvatarTone[] = ["primary", "violet", "accent", "success", "warning"];
export function avatarTone(id: string): AvatarTone {
  const n = Array.from(id).reduce((s, c) => s + c.charCodeAt(0), 0);
  return TONES[n % TONES.length];
}
const initial = (s: string | null | undefined) => (s?.trim()[0] ?? "?").toUpperCase();

// ---------- référentiels ----------
export const toCategory = (s: D.SubjectDto): Category => ({
  id: s.id,
  label: s.name,
  group: s.category,
  levelCategories: s.levelCategories ?? [],
  trackCodes: s.trackCodes ?? [],
  excludedLevels: s.excludedLevels ?? [],
});
export const toLevel = (l: D.EducationLevelDto): LevelRef => ({
  id: l.id,
  label: l.name,
  category: l.category,
  requiredDegree: l.requiredDegree ? (lower(l.requiredDegree) as LevelRef["requiredDegree"]) : undefined,
  // undefined = niveau imbriqué dans une autre réponse (le serveur ne le renseigne que dans le catalogue des niveaux).
  trackKind: l.trackKind === undefined ? undefined : l.trackKind ? (lower(l.trackKind) as LevelRef["trackKind"]) : null,
});
export const toTrack = (t: D.AcademicTrackDto): AcademicTrack => ({
  id: t.id,
  kind: lower(t.kind) as AcademicTrack["kind"],
  code: t.code,
  label: t.name,
  domain: t.domain,
  programme: t.programme ? (lower(t.programme) as NonNullable<AcademicTrack["programme"]>) : null,
  levelName: t.levelName,
});
export const toEducationLevel = (l: D.EducationLevelDto): EducationLevel => toLevel(l);
export const toBeneficiaryType = (o: D.EnumOptionDto<D.RelationshipType>): BeneficiaryType => ({
  id: lower(o.value),
  label: o.label,
  description: o.description ?? null,
});
export const toObjective = (o: D.EnumOptionDto<D.ObjectiveType>): LearningObjective => ({
  id: lower(o.value),
  label: o.label,
});
export const toLocationFormat = (o: D.EnumOptionDto<D.TeachingFormat>): LocationFormatOption => ({
  id: formatToVm(o.value),
  label: o.label,
});
export const toSkill = (s: D.SubjectDto): TutorSkill => ({
  id: s.id,
  label: s.name,
  category: s.category ?? "",
  description: s.description ?? "",
  scope: null,
  levelCategories: s.levelCategories ?? [],
  isVerified: s.isVerified ?? true,
});

// ---------- auth ----------
export function toAuthenticatedUser(me: D.MeDto): AuthenticatedUser {
  return {
    id: me.id,
    firstName: me.firstName,
    lastName: me.lastName,
    email: me.email,
    phone: me.phone,
    emailVerified: me.emailVerified,
    status: lower(me.status),
    selfBeneficiaryId: me.selfBeneficiaryId ?? null,
    tutor: me.tutor
      ? {
          tutorProfileId: me.tutor.tutorProfileId,
          applicationStatus: lower(me.tutor.applicationStatus),
          isVisible: me.tutor.isVisible,
          isSuspended: me.tutor.isSuspended,
        }
      : null,
    isAdmin: me.isAdmin,
    lessonAlarm: me.lessonAlarm ?? { enabled: true, leadMinutes: 30 },
  };
}

// ---------- créneaux ----------
export function slotId(availabilityId: string, startAt: string): string {
  return `${availabilityId}@${startAt}`;
}
export function toSlot(s: D.SlotDto): OfferSlot {
  return {
    id: slotId(s.availabilityId, s.startAt),
    availabilityId: s.availabilityId,
    placeId: s.placeId,
    startAt: s.startAt,
    endAt: s.endAt,
    teachingMode: s.teachingMode ? (lower(s.teachingMode) as TeachingModeId) : null,
    date: F.localDate(s.startAt),
    dateLabel: F.dateLabel(s.startAt),
    startTime: F.localTime(s.startAt),
    endTime: F.localTime(s.endAt),
    timeRangeLabel: F.timeRangeLabel(s.startAt, s.endAt),
    status: "available",
    pendingRequests: s.pendingRequests ?? 0,
  };
}

// ---------- offres ----------
const toOfferPlace = (p: D.PlacePublicDto): OfferPlace => ({ id: p.id, label: p.label, type: lower(p.type) });
function placesLabel(places: D.PlacePublicDto[], format: D.TeachingFormat): string {
  if (format === "ONLINE") return tr("common.online");
  const physical = places.filter((p) => p.type !== "ONLINE").map((p) => p.label);
  return physical.length ? physical.join(", ") : tr("api.mappers.toBeDefined");
}
export const toGender = (g: D.TutorGenderDto | null | undefined): TutorGender | null => (g === "MALE" ? "male" : g === "FEMALE" ? "female" : null);
const tutorName = (t: D.TutorSummaryDto) => t.displayName ?? `${t.firstName} ${t.lastName}`.trim();

export function toOffer(o: D.OfferDto, slots: D.SlotDto[] = []): Offer {
  return {
    id: o.id,
    tutorId: o.tutor.id,
    tutorName: tutorName(o.tutor),
    tutorInitial: initial(o.tutor.firstName),
    tutorGender: toGender(o.tutor.gender),
    tutorPhotoUrl: o.tutor.profilePhoto,
    title: o.title,
    description: o.description,
    subjectId: o.subject.id,
    subjectLabel: o.subject.name,
    levelId: o.educationLevel?.id ?? null,
    levelLabel: o.educationLevel?.name ?? tr("api.mappers.allLevels"),
    durationMinutes: o.durationMinutes,
    durationLabel: F.durationLongLabel(o.durationMinutes),
    durationOptions: o.durationOptions ?? [],
    format: formatToVm(o.format),
    formats: formatToList(o.format),
    places: o.places.map(toOfferPlace),
    location: placesLabel(o.places, o.format),
    price: { amount: Number(o.price.amount), currency: o.price.currency },
    priceLabel: F.priceLabel(o.price),
    isActive: o.isActive && !o.disabledByAdmin,
    isDisabledByAdmin: o.disabledByAdmin,
    slots: slots.map(toSlot),
  };
}
export const toTutorOfferSummary = (o: D.OfferSummaryDto): TutorOfferSummary => ({
  id: o.id,
  title: o.title,
  durationLabel: F.durationShortLabel(o.durationMinutes),
  formats: formatToList(o.format),
  priceLabel: F.priceLabel(o.price),
});

// ---------- tuteurs ----------
export function nextSlotLabel(iso: string | null): string {
  if (!iso) return tr("api.mappers.noSlotsThisWeek");
  const p = F.toLocalParts(iso);
  const h = p.minutes ? `${p.hours}h${String(p.minutes).padStart(2, "0")}` : `${p.hours}h`;
  return tr("api.mappers.nextSlot", { day: F.dayName(p.dayOfWeek).toLowerCase(), time: h });
}
function unionFormats(offers: D.OfferSummaryDto[]): FormatId[] {
  const set = new Set<FormatId>();
  offers.forEach((o) => formatToList(o.format).forEach((f) => set.add(f)));
  return [...set];
}

export function toTutorFromSearch(r: D.SearchResultDto): Tutor {
  const place = r.nearestPlace;
  return {
    id: r.tutor.id,
    firstName: r.tutor.firstName,
    lastName: r.tutor.lastName,
    avatarTone: avatarTone(r.tutor.id),
    photoUrl: r.tutor.profilePhoto,
    gender: toGender(r.tutor.gender),
    rating: r.tutor.rating,
    reviewCount: r.tutor.reviewsCount,
    isVerified: r.tutor.isVerified,
    subjects: r.subjects,
    levels: r.levels,
    formats: unionFormats(r.offers),
    location: {
      label: place ? (place.type === "ONLINE" ? tr("common.online") : place.label) : tr("common.online"),
      distanceKm: r.distanceMeters == null ? null : Math.round(r.distanceMeters / 100) / 10,
      latitude: place?.latitude ?? null,
      longitude: place?.longitude ?? null,
    },
    nextSlotLabel: nextSlotLabel(r.nextSlotAt),
    bio: r.bioExcerpt ?? "",
    offers: r.offers.map(toTutorOfferSummary),
  };
}

function groupSubjects(subjects: D.TutorSubjectDto[]) {
  const map = new Map<string, { skill: { id: string; label: string }; levels: LevelRef[] }>();
  for (const ts of subjects) {
    const entry = map.get(ts.subject.id) ?? { skill: { id: ts.subject.id, label: ts.subject.name }, levels: [] };
    entry.levels.push(toLevel(ts.educationLevel));
    map.set(ts.subject.id, entry);
  }
  return [...map.values()];
}

export function toTutorFromPublic(t: D.TutorPublicDto): Tutor {
  const physical = t.places.find((p) => p.type !== "ONLINE") ?? t.places[0];
  const grouped = groupSubjects(t.subjects);
  return {
    id: t.id,
    firstName: t.firstName,
    lastName: t.lastName,
    avatarTone: avatarTone(t.id),
    photoUrl: t.profilePhoto,
    gender: toGender(t.gender),
    rating: t.rating,
    reviewCount: t.reviewsCount,
    isVerified: t.isVerified,
    subjects: grouped.map((g) => g.skill.label),
    levels: [...new Set(t.subjects.map((s) => s.educationLevel.name))],
    formats: unionFormats(t.offers),
    location: {
      label: physical ? (physical.type === "ONLINE" ? tr("common.online") : physical.label) : tr("common.online"),
      distanceKm: null,
      latitude: physical?.latitude ?? null,
      longitude: physical?.longitude ?? null,
    },
    nextSlotLabel: nextSlotLabel(t.nextSlotAt),
    bio: t.bio ?? "",
    offers: t.offers.filter((o) => o.isActive).map(toTutorOfferSummary),
    subjectLevels: grouped.map((g) => ({ subjectLabel: g.skill.label, levels: g.levels })),
  };
}

export function toTutorProfileSummary(t: D.TutorPrivateDto, isSuspended = !!t.suspendedAt): TutorProfileSummary {
  const grouped = groupSubjects(t.subjects);
  return {
    id: t.id,
    firstName: t.firstName,
    lastName: t.lastName,
    avatarInitials: `${initial(t.firstName)}${initial(t.lastName)}`,
    avatarTone: avatarTone(t.id),
    gender: toGender(t.gender),
    photoUrl: t.profilePhoto,
    rating: t.rating,
    reviewCount: t.reviewsCount,
    bio: t.bio ?? "",
    skills: grouped.map((g) => g.skill),
    subjects: grouped,
    locations: t.places
      // « En ligne » et « Salles partenaires » sont des lieux symboliques créés par le serveur, pas des adresses du tuteur.
      .filter((p) => p.type !== "ONLINE" && p.type !== "PARTNER_ROOM")
      .map((p) => ({ id: p.id, label: p.label, radiusKm: p.radiusMeters == null ? null : p.radiusMeters / 1000 })),
    applicationStatus: lower(t.applicationStatus),
    isVisible: t.isVisible,
    isSuspended,
  };
}

// ---------- bénéficiaires ----------
export function toSavedBeneficiary(b: D.BeneficiaryDto): SavedBeneficiary {
  return {
    id: b.id,
    firstName: b.firstName,
    lastName: b.lastName ?? "",
    isSelf: b.isSelf,
    relationship: lower(b.relationship) as Relationship,
    relationLabel: RELATION_LABELS[b.relationship],
    level: b.educationLevel ? toLevel(b.educationLevel) : null,
    objective: b.objective ? lower(b.objective) : null,
    difficulty: b.difficultyType ? (lower(b.difficultyType) as DifficultyId) : null,
    preferredFormat: b.preferredFormat ? formatToVm(b.preferredFormat) : null,
    notes: b.notes,
  };
}

// ---------- réservations ----------
function toBookingOffer(b: D.BookingDto): BookingOffer {
  const o = b.offer;
  return {
    id: o.id,
    tutorId: b.tutor.id,
    tutorName: tutorName(b.tutor),
    tutorInitial: initial(b.tutor.firstName),
    tutorGender: toGender(b.tutor.gender),
    tutorPhotoUrl: b.tutor.profilePhoto,
    title: b.offerTitle, // snapshot, pas le titre courant
    subjectLabel: o.subject.name,
    levelLabel: o.educationLevel?.name ?? tr("api.mappers.allLevels"),
    durationMinutes: o.durationMinutes,
    durationLabel: F.durationLongLabel(o.durationMinutes),
    format: formatToVm(o.format),
    formats: formatToList(o.format),
    location: b.locationLabel ?? (b.teachingMode === "ONLINE" ? tr("common.online") : tr("api.mappers.toBeDefined")),
    priceLabel: F.priceLabel(b.price),
  };
}

/** Détail du prix : les lignes à zéro (déplacement, salle) sont omises, le frais de service est toujours nommé. */
export function toPricing(p: D.BookingPricingDto): BookingPricing {
  const amount = (m: D.MoneyDto) => Number(m.amount);
  const all: PriceBreakdownLine[] = [
    { key: "tutor", label: tr("api.mappers.tutorSFee"), amount: amount(p.tutorFee), amountLabel: F.priceLabel(p.tutorFee) },
    { key: "travel", label: tr("api.mappers.travelFee"), amount: amount(p.travelFee), amountLabel: F.priceLabel(p.travelFee) },
    { key: "room", label: tr("api.mappers.roomFee"), amount: amount(p.roomFee), amountLabel: F.priceLabel(p.roomFee) },
    { key: "service", label: tr("api.mappers.edulocServiceFee"), amount: amount(p.serviceFee), amountLabel: F.priceLabel(p.serviceFee) },
  ];
  return {
    lines: all.filter((line) => line.amount > 0 || line.key === "tutor" || line.key === "service"),
    totalLabel: F.priceLabel(p.total),
    total: amount(p.total),
    serviceFeeRatePercent: Math.round(p.serviceFeeRate * 100),
  };
}

export function toQuote(q: D.BookingQuoteDto): BookingQuote {
  return { holdId: q.holdId, expiresAt: q.expiresAt, pricing: toPricing(q.pricing) };
}

export function toBooking(b: D.BookingDto): Booking {
  const slot: OfferSlot = {
    ...toSlot({ availabilityId: b.availabilityId ?? "none", offerId: b.offer.id, placeId: b.placeId, startAt: b.startAt, endAt: b.endAt, teachingMode: b.teachingMode }),
    status: "unavailable",
  };
  return {
    id: b.id,
    status: lower(b.status),
    viewerRole: lower(b.viewerRole),
    offer: toBookingOffer(b),
    slot,
    beneficiary: {
      id: b.beneficiary.id,
      firstName: b.beneficiary.firstName,
      lastName: b.beneficiary.lastName ?? "",
      relationship: lower(b.beneficiary.relationship) as Relationship,
      relationLabel: RELATION_LABELS[b.beneficiary.relationship],
      level: b.beneficiary.educationLevel ? toLevel(b.beneficiary.educationLevel) : null,
      difficulty: b.beneficiary.difficultyType ? (lower(b.beneficiary.difficultyType) as DifficultyId) : null,
      objective: b.beneficiary.objective ? (lower(b.beneficiary.objective) as "remedial" | "ongoing" | "excellence") : null,
    },
    requester: { id: b.requester.id, firstName: b.requester.firstName, lastName: b.requester.lastName ?? "" },
    teachingMode: lower(b.teachingMode) as TeachingModeId,
    locationLabel: b.locationLabel,
    locationAddress: b.locationAddress,
    room: b.room ? { id: b.room.id, name: b.room.name, zoneLabel: b.room.zoneLabel } : null,
    participantsCount: b.participantsCount ?? 1,
    roomFeeLabel: b.roomFee ? F.priceLabel(b.roomFee) : null,
    pricing: b.pricing ? toPricing(b.pricing) : null,
    accessInstructions: b.roomAccessInstructions ?? null,
    note: b.requesterNote ?? "",
    conversationId: b.conversationId,
    refusalReason: b.refusalReason,
    cancellationReason: b.cancellationReason,
    cancelledBy: b.cancelledBy ? lower(b.cancelledBy) : null,
    hasReview: b.hasReview,
    competingRequests: (b.competingRequests ?? []).map((c) => ({ id: c.id, beneficiaryFirstName: c.beneficiaryFirstName, requesterName: c.requesterName, createdAt: c.createdAt })),
    canReview: b.viewerRole === "REQUESTER" && b.status === "COMPLETED" && !b.hasReview,
    createdAt: b.createdAt,
    sessionStartedAt: b.startedAt ?? undefined,
    sessionCompletedAt: b.completedAt ?? undefined,
    sessionDurationLabel: b.startedAt && b.completedAt ? F.elapsedLabel(b.startedAt, b.completedAt) : undefined,
    sessionMode: b.startedAt ? teachingModeToFormat(b.teachingMode) : undefined,
  };
}

/** Valeur de `placeId` d'une disponibilité réservée aux salles partenaires (voir AvailabilityService). */
export const PARTNER_ROOM_PLACE_ID = "partner_room";

// ---------- salles partenaires ----------
/** « ≈ 1,5 km » : la distance du serveur est déjà arrondie ; on n'affiche jamais une précision qu'elle n'a pas. */
function distanceLabel(meters: number | null): string | null {
  if (meters === null) return null;
  return meters < 1000 ? `≈ ${meters} m` : `≈ ${(meters / 1000).toLocaleString(currentIntlLocale(), { maximumFractionDigits: 1 })} km`;
}
export function toPartnerRoom(r: D.PublicRoomDto): PartnerRoom {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    zoneLabel: r.zoneLabel,
    capacity: r.capacity,
    equipment: r.equipment,
    accessibility: r.accessibility,
    welcomesMinors: r.welcomesMinors,
    pricePerHour: r.pricePerHour ? { amount: Number(r.pricePerHour.amount), currency: r.pricePerHour.currency } : null,
    pricePerHourLabel: r.pricePerHour ? `${F.priceLabel(r.pricePerHour)} / h` : null,
    rules: r.rules,
    cancellationPolicy: r.cancellationPolicy,
    openingHours: r.openingHours.map((h) => ({ dayOfWeek: h.dayOfWeek, startTime: h.startTime, endTime: h.endTime })),
    photos: r.photos,
    distanceLabel: distanceLabel(r.distanceMeters),
  };
}
export const toAcceptedRoom = (r: D.AcceptedRoomDto): AcceptedRoom => ({ ...toPartnerRoom(r), bookable: r.bookable });
export function toBookingOptions(o: D.BookingOptionsDto): BookingOptions {
  return {
    offerId: o.offerId,
    minNoticeHours: o.minNoticeHours,
    durations: o.durations.map((d) => ({ minutes: d.minutes, label: F.durationLongLabel(d.minutes), priceLabel: F.priceLabel(d.price) })),
    modes: o.modes.map((m) => lower(m) as TeachingModeId),
    rooms: o.rooms.map(toPartnerRoom),
  };
}

// ---------- disponibilités ----------
export function toAvailability(a: D.AvailabilityDto): TutorAvailabilitySlot {
  const oneOff = !!a.validFrom && a.validFrom === a.validUntil;
  const label = oneOff ? F.dateLabel(a.validFrom!) : `Chaque ${F.dayName(a.dayOfWeek).toLowerCase()}`;
  const online = a.place?.type === "ONLINE";
  const partnerRoom = a.place?.type === "PARTNER_ROOM";
  return {
    id: a.id,
    kind: oneOff ? "one_off" : "recurring",
    dayOfWeek: a.dayOfWeek,
    dayLabel: label,
    date: oneOff ? a.validFrom : null,
    dateLabel: label,
    startTime: a.startTime,
    endTime: a.endTime,
    timeRangeLabel: F.hhmmRangeLabel(a.startTime, a.endTime),
    // Plage « salles partenaires » : identifiant symbolique (le serveur rattache lui-même le lieu à partnerRoom: true).
    placeId: partnerRoom ? PARTNER_ROOM_PLACE_ID : (a.place?.id ?? null),
    offerId: a.offerId,
    format: online ? "online" : "in_person",
    locationLabel: a.place ? (online ? tr("common.online") : partnerRoom ? tr("common.partnerRooms") : a.place.label) : tr("api.mappers.placeToBeSpecified"),
  };
}

// ---------- conversations ----------
export function toConversationSummary(c: D.ConversationDto): ConversationSummary {
  const name = c.viewerRole === "REQUESTER" ? tutorName(c.tutor) : `${c.requester.firstName} ${c.requester.lastName ?? ""}`.trim();
  return {
    id: c.id,
    status: lower(c.status),
    viewerRole: lower(c.viewerRole),
    counterpartName: name,
    counterpartInitial: initial(name),
    ...(c.viewerRole === "REQUESTER" ? { counterpartGender: toGender(c.tutor.gender), counterpartPhotoUrl: c.tutor.profilePhoto } : {}),
    bookingId: c.bookingId,
    lastMessagePreview: c.lastMessagePreview,
    lastMessageAt: c.lastMessageAt,
    unreadCount: c.unreadCount,
    canSend: c.canSend,
    canCall: c.canCall,
  };
}

export function toMessage(m: D.MessageDto, bookingId: string | null = null): ConversationMessage {
  const base = {
    id: m.id,
    conversationId: m.conversationId,
    bookingId,
    authorLabel: m.isMine ? tr("api.mappers.you") : m.senderFirstName ?? tr("api.mappers.eduloc"),
    isMine: m.isMine,
    createdAt: m.createdAt,
  };
  if (m.type === "VOICE" && m.attachment) {
    return {
      ...base,
      type: "voice",
      attachmentId: m.attachment.id,
      durationMs: m.attachment.durationMs ?? 0,
      durationLabel: F.audioDurationLabel(m.attachment.durationMs),
      waveform: m.attachment.waveform ?? [],
      listenedAt: m.listenedAt,
      transcript: m.attachment.transcript,
    };
  }
  if (m.type === "DOCUMENT" && m.attachment) {
    return {
      ...base,
      type: "document",
      attachmentId: m.attachment.id,
      fileName: m.attachment.fileName ?? "document",
      fileSizeLabel: F.fileSizeLabel(m.attachment.sizeBytes),
      mimeType: m.attachment.mimeType,
    };
  }
  return { ...base, type: m.type === "CALL_EVENT" ? "call_event" : "system", text: m.systemText ?? "" };
}

// ---------- notifications ----------
export function toNotification(n: D.NotificationDto, now = new Date()): AppNotification {
  const data = (n.data ?? {}) as { bookingId?: string; conversationId?: string };
  return {
    id: n.id,
    type: lower(n.type) as AppNotificationType,
    title: n.title,
    message: n.message,
    isRead: n.isRead,
    createdAt: n.createdAt,
    timeLabel: F.relativeTimeLabel(n.createdAt, now),
    dateGroup: F.dateGroupLabel(n.createdAt, now),
    target: data.bookingId || data.conversationId ? { bookingId: data.bookingId, conversationId: data.conversationId } : null,
  };
}

// ---------- avis ----------
export const toReview = (r: D.ReviewDto): TutorReview => ({
  id: r.id,
  rating: r.rating,
  text: r.text,
  authorFirstName: r.authorFirstName,
  createdAt: r.createdAt,
  dateLabel: F.dateLabel(r.createdAt),
  officialReply: r.officialReply,
});

// ---------- candidature ----------
export function toTutorApplication(a: D.TutorApplicationDto): TutorApplication {
  return {
    id: a.id,
    status: lower(a.status),
    submittedAt: a.submittedAt,
    rejectionReason: a.rejectionReason,
    subjects: a.subjects.map((s) => ({ skillId: s.subject.id, skillLabel: s.subject.name, level: toLevel(s.educationLevel) })),
    documents: a.documents.map((d) => ({
      id: d.id,
      kind: lower(d.type) as TutorDocumentKind,
      fileName: d.fileName,
      status: lower(d.status),
    })),
  };
}
