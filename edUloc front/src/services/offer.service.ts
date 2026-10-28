import { api } from "@/api/http";
import { ApiError } from "@/api/errors";
import { formatToDto, toOffer, toSlot } from "@/api/mappers";
import type {
  BackendComputedSlotDto,
  CreateOfferRequestDto,
  OfferDto,
  SlotDto,
  UpdateOfferRequestDto,
} from "@/api/contracts/dto";
import { localDate } from "@/api/format/datetime";
import type { CreateOfferInput, Offer, OfferSlot, UpdateOfferInput } from "@/types/offer";
import { t } from "@/i18n";

export { ApiError as OfferServiceError };

const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function toCreateDto(i: CreateOfferInput): CreateOfferRequestDto {
  return {
    title: i.title,
    description: i.description,
    subjectId: i.subjectId,
    educationLevelId: i.levelId,
    ...(i.trackId ? { trackId: i.trackId } : {}),
    format: formatToDto(i.format),
    durationMinutes: i.durationMinutes,
    ...(i.durationOptions ? { durationOptions: i.durationOptions } : {}),
    price: i.price,
  };
}
function toUpdateDto(i: UpdateOfferInput): UpdateOfferRequestDto {
  const out: UpdateOfferRequestDto = {};
  if (i.title !== undefined) out.title = i.title;
  if (i.description !== undefined) out.description = i.description;
  if (i.subjectId !== undefined) out.subjectId = i.subjectId;
  if (i.levelId !== undefined) out.educationLevelId = i.levelId;
  if (i.trackId !== undefined) out.trackId = i.trackId;
  if (i.format !== undefined) out.format = formatToDto(i.format);
  if (i.durationMinutes !== undefined) out.durationMinutes = i.durationMinutes;
  if (i.durationOptions !== undefined) out.durationOptions = i.durationOptions;
  if (i.price !== undefined) out.price = i.price;
  return out;
}

/**
 * Routes backend : GET /search/offers/:id, GET|POST /tutors/me/offers, PATCH /tutors/me/offers/:id,
 *                  POST /tutors/me/offers/:id/active, GET /search/tutors/:id/slots
 */
export const OfferService = {
  /** Offre + créneaux des `days` prochains jours (les créneaux ne sont plus portés par l'offre, D-14). */
  async getOfferById(id: string, { days = 21 }: { days?: number } = {}): Promise<Offer> {
    const offer = await api.get<OfferDto>(`/search/offers/${id}`, undefined, { auth: false });
    const slots = offer.isActive
      ? await OfferService.getOfferSlotsRaw(offer.tutor.id, offer.id, days, offer.durationMinutes)
      : [];
    return toOffer(offer, slots);
  },

  async getOfferSlotsRaw(tutorId: string, offerId: string, days = 21, durationMinutes = 60, offsetDays = 0): Promise<SlotDto[]> {
    const from = addDays(localDate(new Date().toISOString()), offsetDays);
    if (!Number.isInteger(days) || days < 1 || days > 31) {
      throw ApiError.local("validation_error", t("services.offerservice.theSearchPeriodMustBe"));
    }
    return (await api.get<BackendComputedSlotDto[]>(
      `/search/tutors/${tutorId}/slots`,
      { offerId, from, to: addDays(from, days - 1), duration: durationMinutes },
      { auth: false },
    )).map((slot) => ({ ...slot, offerId }));
  },

  /** `offsetDays` : la fenêtre commence ce nombre de jours après aujourd'hui (le serveur limite chaque appel à 31 jours). */
  async getOfferSlots(tutorId: string, offerId: string, days = 21, durationMinutes = 60, offsetDays = 0): Promise<OfferSlot[]> {
    return (await OfferService.getOfferSlotsRaw(tutorId, offerId, days, durationMinutes, offsetDays)).map(toSlot);
  },

  /** [v1~] plus de paramètre tutorId : « mes offres » (jeton). */
  async getTutorOffers(): Promise<Offer[]> {
    return (await api.get<OfferDto[]>("/tutors/me/offers")).map((o) => toOffer(o));
  },

  async updateOffer(id: string, data: UpdateOfferInput): Promise<Offer> {
    return toOffer(await api.patch<OfferDto>(`/tutors/me/offers/${id}`, toUpdateDto(data)));
  },

  async updateOfferStatus(id: string, isActive: boolean): Promise<Offer> {
    return toOffer(await api.post<OfferDto>(`/tutors/me/offers/${id}/active`, { isActive }));
  },

  /** [v1~] (tutorId, tutorName, tutorInitial, data) → (data) : l'identité vient du jeton. */
  async createOffer(data: CreateOfferInput): Promise<Offer> {
    return toOffer(await api.post<OfferDto>("/tutors/me/offers", toCreateDto(data)));
  },
};
