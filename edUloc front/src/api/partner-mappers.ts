/**
 * DTO de l'espace Gestionnaire → view models. Même rôle que mappers.ts, séparé pour ne pas l'alourdir.
 */
import type * as P from "./contracts/partner-dto";
import * as F from "./format/datetime";
import { weekdayNames } from "@/i18n/dates";
import type {
  PartnerHistoryEntry,
  PartnerPlan,
  PartnerReservation,
  PartnerRoomDetail,
  PartnerRoomSummary,
  PartnerSubscription,
  PartnerVenue,
  RoomBlock,
  RoomOpening,
} from "@/types/partner";
import { t } from "@/i18n";

const lower = <T extends string>(v: T) => v.toLowerCase() as Lowercase<T>;

export function toPartnerPlan(p: P.PartnerPlanDto): PartnerPlan {
  const years = p.durationDays % 365 === 0 ? p.durationDays / 365 : null;
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    priceLabel: Number(p.price.amount) === 0 ? t("api.partnerMappers.free") : F.priceLabel(p.price),
    isFree: Number(p.price.amount) === 0,
    durationLabel: years ? t("api.partnerMappers.years", { count: years }) : t("api.partnerMappers.days", { durationDays: p.durationDays }),
  };
}

export function toPartnerSubscription(s: P.PartnerSubscriptionDto): PartnerSubscription {
  return {
    status: lower(s.status),
    plan: s.plan ? toPartnerPlan(s.plan) : null,
    validUntilLabel: s.status === "ACTIVE" && s.endsAt ? t("api.partnerMappers.until", { dateLabel: F.dateLabel(s.endsAt) }) : null,
  };
}

const sizeLabel = (bytes: number) => F.fileSizeLabel(bytes);

function toHistory(e: P.PartnerStatusEventDto): PartnerHistoryEntry {
  return {
    id: e.id,
    scope: lower(e.scope) as PartnerHistoryEntry["scope"],
    roomId: e.roomId,
    fromLabel: e.from,
    toLabel: e.to,
    note: e.note,
    atLabel: `${F.dateLabel(e.at)} · ${F.localTime(e.at)}`,
  };
}

export function toPartnerVenue(v: P.PartnerVenueDto): PartnerVenue {
  return {
    id: v.id,
    name: v.name,
    type: lower(v.type),
    description: v.description ?? "",
    legalName: v.legalName ?? "",
    registrationNumber: v.registrationNumber ?? "",
    nif: v.nif ?? "",
    stat: v.stat ?? "",
    contactPhone: v.contactPhone ?? "",
    contactEmail: v.contactEmail ?? "",
    status: lower(v.status),
    reviewNote: v.reviewNote,
    editable: v.status === "DRAFT" || v.status === "NEEDS_CORRECTION" || v.status === "REJECTED",
    documents: v.documents.map((d) => ({
      id: d.id,
      kind: lower(d.type),
      fileName: d.fileName ?? t("api.partnerMappers.document"),
      sizeLabel: sizeLabel(d.sizeBytes),
    })),
    subscription: toPartnerSubscription(v.subscription),
    rooms: v.rooms.map(
      (r): PartnerRoomSummary => ({
        id: r.id,
        name: r.name,
        status: lower(r.status),
        publication: lower(r.publication),
        isActive: r.isActive,
        reviewNote: r.reviewNote,
        bookable: r.bookable,
      }),
    ),
    history: v.history.map(toHistory),
  };
}

const toOpening = (a: P.PartnerRoomOpeningDto & { id: string }): RoomOpening => ({
  id: a.id,
  dayOfWeek: a.dayOfWeek,
  startTime: a.startTime,
  endTime: a.endTime,
  validFrom: a.validFrom ?? null,
  validUntil: a.validUntil ?? null,
  label: `${weekdayNames()[a.dayOfWeek]} · ${F.hhmmRangeLabel(a.startTime, a.endTime)}`,
});

export const toRoomOpenings = (rows: (P.PartnerRoomOpeningDto & { id: string })[]) => rows.map(toOpening);

export function toPartnerRoom(r: P.PartnerRoomDto): PartnerRoomDetail {
  const status = lower(r.status);
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    addressLine: r.addressLine ?? "",
    city: r.city ?? "",
    latitude: r.latitude,
    longitude: r.longitude,
    accessInstructions: r.accessInstructions ?? "",
    zoneLabel: r.zoneLabel ?? "",
    capacity: r.capacity,
    equipment: r.equipment,
    accessibility: r.accessibility,
    welcomesMinors: r.welcomesMinors,
    pricePerHour: r.pricePerHour ? String(Math.round(Number(r.pricePerHour.amount))) : "",
    rules: r.rules ?? "",
    cancellationPolicy: r.cancellationPolicy ?? "",
    status,
    publication: lower(r.publication),
    isActive: r.isActive,
    reviewNote: r.reviewNote,
    bookable: r.bookable,
    missingFields: r.missingFields,
    editable: status === "draft" || status === "needs_correction",
    identityLocked: status === "approved",
    openings: toRoomOpenings(r.availabilities),
    photos: r.photos.map((p) => ({ id: p.id, url: p.url })),
  };
}

export const toRoomBlock = (b: P.PartnerRoomBlockDto): RoomBlock => ({
  id: b.id,
  startAt: b.startAt,
  endAt: b.endAt,
  label: `${F.dateLabel(b.startAt)} · ${F.timeRangeLabel(b.startAt, b.endAt)}`,
  reason: b.reason,
});

export const toPartnerReservation = (r: P.PartnerReservationDto): PartnerReservation => ({
  id: r.id,
  roomId: r.roomId,
  roomName: r.roomName ?? t("common.room"),
  dateLabel: F.dateLabel(r.startAt),
  timeRangeLabel: F.timeRangeLabel(r.startAt, r.endAt),
  status: lower(r.status),
  participantsCount: r.participantsCount,
  offerTitle: r.offerTitle,
  tutorName: r.tutorName,
});
