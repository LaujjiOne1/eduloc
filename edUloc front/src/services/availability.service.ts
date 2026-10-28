import { api } from "@/api/http";
import { ApiError } from "@/api/errors";
import { PARTNER_ROOM_PLACE_ID, toAvailability } from "@/api/mappers";
import type { AvailabilityDto, AvailabilityInputDto } from "@/api/contracts/dto";
import { dateLabel, dayOfWeekOf, hhmmRangeLabel, localDate } from "@/api/format/datetime";
import type { CalendarOccurrence, TutorAvailabilityDraft, TutorAvailabilitySlot } from "@/types/availability";
import type { Booking } from "@/types/booking";
import { t } from "@/i18n";

export { ApiError as AvailabilityServiceError };

/** placeId = null signifie « En ligne » dans l'écran : le serveur rattache alors la plage au lieu « En ligne » du tuteur. */
/** placeId = "partner_room" : plage réservée aux séances en salle partenaire (le serveur crée le lieu symbolique). */
const placeFields = (placeId: string | null) =>
  placeId === null ? { online: true } : placeId === PARTNER_ROOM_PLACE_ID ? { partnerRoom: true } : { placeId };

function toInput(d: TutorAvailabilityDraft): AvailabilityInputDto {
  if (d.startTime >= d.endTime) throw ApiError.local("validation_error", t("common.theEndTimeMustBe2"));
  if (d.kind === "one_off") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw ApiError.local("validation_error", t("services.availabilityservice.invalidDate"));
    return { dayOfWeek: dayOfWeekOf(d.date), startTime: d.startTime, endTime: d.endTime, validFrom: d.date, validUntil: d.date, ...placeFields(d.placeId), offerId: d.offerId ?? null };
  }
  return { dayOfWeek: d.dayOfWeek, startTime: d.startTime, endTime: d.endTime, validFrom: d.validFrom ?? null, validUntil: d.validUntil ?? null, ...placeFields(d.placeId), offerId: d.offerId ?? null };
}
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Routes : /tutors/me/availabilities[/:id] — une disponibilité est une RÈGLE (récurrente ou ponctuelle, D-03). */
export const AvailabilityService = {
  async getAvailability(): Promise<TutorAvailabilitySlot[]> {
    return (await api.get<AvailabilityDto[]>("/tutors/me/availabilities")).map(toAvailability);
  },
  async getAvailabilityById(id: string): Promise<TutorAvailabilitySlot> {
    const items = await api.get<AvailabilityDto[]>("/tutors/me/availabilities");
    const availability = items.find((item) => item.id === id);
    if (!availability) throw ApiError.local("not_found", t("services.availabilityservice.availabilityNotFound"));
    return toAvailability(availability);
  },
  async createAvailability(draft: TutorAvailabilityDraft): Promise<TutorAvailabilitySlot> {
    return toAvailability(await api.post<AvailabilityDto>("/tutors/me/availabilities", toInput(draft)));
  },
  async updateAvailability(id: string, draft: TutorAvailabilityDraft): Promise<TutorAvailabilitySlot> {
    return toAvailability(await api.patch<AvailabilityDto>(`/tutors/me/availabilities/${id}`, toInput(draft)));
  },
  async deleteAvailability(id: string): Promise<void> {
    await api.delete(`/tutors/me/availabilities/${id}`);
  },

  /**
   * [v1+] Vue calendrier 56_TutorCalendar : déplie les règles sur [from, from+days] et y fusionne
   * les rendez-vous confirmés / en cours. Calcul client (pas de route dédiée en v1).
   */
  expandCalendar(rules: TutorAvailabilitySlot[], bookings: Booking[], days = 14, from = localDate(new Date().toISOString())): CalendarOccurrence[] {
    const out: CalendarOccurrence[] = [];
    for (let i = 0; i <= days; i++) {
      const date = addDays(from, i);
      const dow = dayOfWeekOf(date);
      for (const r of rules) {
        if (r.kind === "one_off" ? r.date !== date : r.dayOfWeek !== dow) continue;
        out.push({ date, dateLabel: dateLabel(date), startTime: r.startTime, endTime: r.endTime, timeRangeLabel: r.timeRangeLabel, kind: "availability", recurring: r.kind === "recurring", availabilityId: r.id, label: r.locationLabel });
      }
      for (const b of bookings) {
        if (b.slot.date !== date || !["confirmed", "in_progress"].includes(b.status)) continue;
        out.push({ date, dateLabel: dateLabel(date), startTime: b.slot.startTime, endTime: b.slot.endTime, timeRangeLabel: hhmmRangeLabel(b.slot.startTime, b.slot.endTime), kind: "booking", bookingId: b.id, label: `${b.offer.title} · ${b.beneficiary.firstName}` });
      }
    }
    return out.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  },
};
