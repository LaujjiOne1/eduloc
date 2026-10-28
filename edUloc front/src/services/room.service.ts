import { api } from "@/api/http";
import { ApiError } from "@/api/errors";
import { slotId, toAcceptedRoom, toBookingOptions, toPartnerRoom } from "@/api/mappers";
import * as F from "@/api/format/datetime";
import type { AcceptedRoomDto, BookingOptionsDto, DaySlotsDto, PublicRoomDto } from "@/api/contracts/dto";
import type { TeachingModeId } from "@/types/booking";
import type { OfferSlot } from "@/types/offer";
import type { AcceptedRoom, BookingOptions, PartnerRoom } from "@/types/room";

export { ApiError as RoomServiceError };

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Salles partenaires côté Demandeur et Tuteur.
 *   GET    /rooms                              (public) salles réservables, zone approximative uniquement
 *   GET    /rooms/:id                          (public)
 *   GET    /booking-options/:offerId           (public) modes, durées et salles ACCEPTÉES par le tuteur
 *   GET    /booking-options/:offerId/slots     (public) créneaux d'une date (intersection tuteur ∩ salle)
 *   GET    /tutors/me/rooms                    (tuteur approuvé) salles acceptées
 *   PUT    /tutors/me/rooms/:roomId            (tuteur approuvé) accepter d'intervenir — ne réserve rien
 *   DELETE /tutors/me/rooms/:roomId            (tuteur approuvé) retirer son accord
 * Les créneaux et options sont des INDICATIONS : le backend revérifie tout à l'envoi de la demande et à l'acceptation.
 */
export const RoomService = {
  async listRooms(near?: Coordinates, radiusM?: number): Promise<PartnerRoom[]> {
    const rows = await api.get<PublicRoomDto[]>("/rooms", { lat: near?.lat, lng: near?.lng, radiusM }, { auth: false });
    return rows.map(toPartnerRoom);
  },

  async getRoom(id: string, near?: Coordinates): Promise<PartnerRoom> {
    return toPartnerRoom(await api.get<PublicRoomDto>(`/rooms/${id}`, { lat: near?.lat, lng: near?.lng }, { auth: false }));
  },

  async getBookingOptions(offerId: string, near?: Coordinates): Promise<BookingOptions> {
    return toBookingOptions(await api.get<BookingOptionsDto>(`/booking-options/${offerId}`, { lat: near?.lat, lng: near?.lng }, { auth: false }));
  },

  /** Créneaux d'une date (AAAA-MM-JJ locale) pour un mode / une salle / une durée. */
  async getDaySlots(
    offerId: string,
    params: { date: string; mode: TeachingModeId; roomId?: string; durationMinutes?: number },
  ): Promise<OfferSlot[]> {
    const dto = await api.get<DaySlotsDto>(
      `/booking-options/${offerId}/slots`,
      { date: params.date, mode: params.mode.toUpperCase(), roomId: params.roomId, durationMinutes: params.durationMinutes },
      { auth: false },
    );
    return dto.slots.map((s) => ({
      id: slotId(dto.roomId ?? dto.mode, s.startAt),
      availabilityId: dto.roomId ?? "none",
      placeId: null,
      startAt: s.startAt,
      endAt: s.endAt,
      teachingMode: params.mode,
      date: F.localDate(s.startAt),
      dateLabel: F.dateLabel(s.startAt),
      startTime: F.localTime(s.startAt),
      endTime: F.localTime(s.endAt),
      timeRangeLabel: F.timeRangeLabel(s.startAt, s.endAt),
      status: "available" as const,
      pendingRequests: 0,
    }));
  },

  // ---------------- Tuteur ----------------
  async getMyRooms(): Promise<AcceptedRoom[]> {
    return (await api.get<AcceptedRoomDto[]>("/tutors/me/rooms")).map(toAcceptedRoom);
  },
  async acceptRoom(roomId: string): Promise<AcceptedRoom[]> {
    return (await api.put<AcceptedRoomDto[]>(`/tutors/me/rooms/${roomId}`)).map(toAcceptedRoom);
  },
  async withdrawRoom(roomId: string): Promise<AcceptedRoom[]> {
    return (await api.delete<AcceptedRoomDto[]>(`/tutors/me/rooms/${roomId}`)).map(toAcceptedRoom);
  },
};
