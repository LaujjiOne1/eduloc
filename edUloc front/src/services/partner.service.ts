import { api } from "@/api/http";
import { ApiError } from "@/api/errors";
import { uploadToSignedUrl } from "@/api/upload";
import type * as P from "@/api/contracts/partner-dto";
import {
  toPartnerPlan,
  toPartnerReservation,
  toPartnerRoom,
  toPartnerSubscription,
  toPartnerVenue,
  toRoomBlock,
  toRoomOpenings,
} from "@/api/partner-mappers";
import { upper } from "@/api/mappers";
import type { VenueDocumentType, VenueType } from "@/api/contracts/dto";
import type { LocalFile } from "@/types/message";
import type {
  PartnerPlan,
  PartnerReservation,
  PartnerRoomDetail,
  PartnerRoomInput,
  PartnerSubscription,
  PartnerVenue,
  PartnerVenueInput,
  RoomBlock,
  RoomOpening,
  VenueDocumentKind,
} from "@/types/partner";

export { ApiError as PartnerServiceError };

const optional = (value: string): string | undefined => (value.trim() ? value.trim() : undefined);

function toVenueBody(input: PartnerVenueInput): P.PartnerVenueInputDto {
  return {
    name: input.name.trim(),
    type: upper(input.type) as VenueType,
    description: optional(input.description),
    legalName: optional(input.legalName),
    registrationNumber: optional(input.registrationNumber),
    nif: optional(input.nif),
    stat: optional(input.stat),
    contactPhone: optional(input.contactPhone),
    contactEmail: optional(input.contactEmail),
  };
}

function toRoomBody(input: Partial<PartnerRoomInput>): P.PartnerRoomInputDto {
  const body: P.PartnerRoomInputDto = {};
  if (input.name !== undefined) body.name = input.name.trim();
  if (input.description !== undefined) body.description = input.description.trim();
  if (input.addressLine !== undefined) body.addressLine = input.addressLine.trim();
  if (input.city !== undefined) body.city = input.city.trim();
  if (input.latitude !== undefined && input.latitude !== null) body.latitude = input.latitude;
  if (input.longitude !== undefined && input.longitude !== null) body.longitude = input.longitude;
  if (input.accessInstructions !== undefined) body.accessInstructions = input.accessInstructions.trim();
  if (input.zoneLabel !== undefined) body.zoneLabel = input.zoneLabel.trim();
  if (input.capacity !== undefined) body.capacity = input.capacity;
  if (input.equipment !== undefined) body.equipment = input.equipment;
  if (input.accessibility !== undefined) body.accessibility = input.accessibility;
  if (input.welcomesMinors !== undefined) body.welcomesMinors = input.welcomesMinors;
  if (input.pricePerHour !== undefined && input.pricePerHour !== null) body.pricePerHour = input.pricePerHour;
  if (input.rules !== undefined) body.rules = input.rules.trim();
  if (input.cancellationPolicy !== undefined) body.cancellationPolicy = input.cancellationPolicy.trim();
  return body;
}

/** Envoi en deux temps : URL signée (le fichier ne traverse jamais l'API), puis enregistrement des métadonnées. */
async function upload(ticketPath: string, registerPath: string, file: LocalFile, extra: Record<string, unknown> = {}) {
  const ticket = await api.post<P.PartnerUploadTicketDto>(ticketPath, {
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    fileName: file.fileName,
  });
  await uploadToSignedUrl(ticket, file);
  return api.post(registerPath, { uploadId: ticket.uploadId, ...extra });
}

/**
 * Espace Gestionnaire de lieu — toutes les routes exigent un compte connecté ; une ressource d'une autre structure
 * répond « introuvable ». Le serveur reste l'autorité (statuts, verrous, publication) : l'écran affiche et propose.
 *
 *   GET|POST|PATCH /partner/venue · POST /partner/venue/submit
 *   POST /partner/venue/documents/upload-url · POST|DELETE /partner/venue/documents[/:id]
 *   GET /partner/plans · GET|POST|DELETE /partner/subscription
 *   GET|POST /partner/rooms · GET|PATCH|DELETE /partner/rooms/:id
 *   POST /partner/rooms/:id/{submit|publish|unpublish|active}
 *   GET|PUT /partner/rooms/:id/availabilities · GET|POST /partner/rooms/:id/blocks · DELETE …/blocks/:blockId
 *   POST /partner/rooms/:id/photos/upload-url · POST /partner/rooms/:id/photos · DELETE …/photos/:photoId
 *   GET /partner/reservations · GET /partner/rooms/:id/reservations
 */
export const PartnerService = {
  // ---------------- structure ----------------
  /** null : le compte n'a pas encore de structure partenaire (404 VENUE_NOT_FOUND). */
  async getVenue(): Promise<PartnerVenue | null> {
    try {
      return toPartnerVenue(await api.get<P.PartnerVenueDto>("/partner/venue"));
    } catch (error) {
      if (error instanceof ApiError && error.problemCode === "VENUE_NOT_FOUND") return null;
      throw error;
    }
  },
  async createVenue(input: PartnerVenueInput): Promise<PartnerVenue> {
    return toPartnerVenue(await api.post<P.PartnerVenueDto>("/partner/venue", toVenueBody(input)));
  },
  async updateVenue(input: PartnerVenueInput): Promise<PartnerVenue> {
    return toPartnerVenue(await api.patch<P.PartnerVenueDto>("/partner/venue", toVenueBody(input)));
  },
  /** DRAFT | NEEDS_CORRECTION → SUBMITTED. Exige un contact et au moins un justificatif. */
  async submitVenue(): Promise<PartnerVenue> {
    return toPartnerVenue(await api.post<P.PartnerVenueDto>("/partner/venue/submit"));
  },
  async uploadVenueDocument(kind: VenueDocumentKind, file: LocalFile): Promise<void> {
    await upload("/partner/venue/documents/upload-url", "/partner/venue/documents", file, { type: upper(kind) as VenueDocumentType });
  },
  async removeVenueDocument(documentId: string): Promise<void> {
    await api.delete(`/partner/venue/documents/${documentId}`);
  },

  // ---------------- offre commerciale ----------------
  async listPlans(): Promise<PartnerPlan[]> {
    return (await api.get<P.PartnerPlanDto[]>("/partner/plans")).map(toPartnerPlan);
  },
  async getSubscription(): Promise<PartnerSubscription> {
    return toPartnerSubscription(await api.get<P.PartnerSubscriptionDto>("/partner/subscription"));
  },
  /** Après la validation de la structure et d'au moins une salle. Un plan gratuit s'active aussitôt, un plan payant attend EduLoc. */
  async selectPlan(planId: string): Promise<PartnerSubscription> {
    return toPartnerSubscription(await api.post<P.PartnerSubscriptionDto>("/partner/subscription", { planId }));
  },
  async cancelSubscription(): Promise<PartnerSubscription> {
    return toPartnerSubscription(await api.delete<P.PartnerSubscriptionDto>("/partner/subscription"));
  },

  // ---------------- salles ----------------
  async getRoom(roomId: string): Promise<PartnerRoomDetail> {
    return toPartnerRoom(await api.get<P.PartnerRoomDto>(`/partner/rooms/${roomId}`));
  },
  async createRoom(input: PartnerRoomInput): Promise<PartnerRoomDetail> {
    return toPartnerRoom(await api.post<P.PartnerRoomDto>("/partner/rooms", toRoomBody(input)));
  },
  async updateRoom(roomId: string, input: Partial<PartnerRoomInput>): Promise<PartnerRoomDetail> {
    return toPartnerRoom(await api.patch<P.PartnerRoomDto>(`/partner/rooms/${roomId}`, toRoomBody(input)));
  },
  async deleteRoom(roomId: string): Promise<void> {
    await api.delete(`/partner/rooms/${roomId}`);
  },
  /** Soumission INDIVIDUELLE de cette salle (les autres salles de la structure ne sont pas concernées). */
  async submitRoom(roomId: string): Promise<PartnerRoomDetail> {
    return toPartnerRoom(await api.post<P.PartnerRoomDto>(`/partner/rooms/${roomId}/submit`));
  },
  /** Exige : salle validée, structure validée, offre commerciale active, pas dépubliée par EduLoc. */
  async publishRoom(roomId: string): Promise<PartnerRoomDetail> {
    return toPartnerRoom(await api.post<P.PartnerRoomDto>(`/partner/rooms/${roomId}/publish`));
  },
  async unpublishRoom(roomId: string): Promise<PartnerRoomDetail> {
    return toPartnerRoom(await api.post<P.PartnerRoomDto>(`/partner/rooms/${roomId}/unpublish`));
  },
  /** Fermeture / réouverture temporaire, sans repasser par la validation. */
  async setRoomActive(roomId: string, isActive: boolean): Promise<PartnerRoomDetail> {
    return toPartnerRoom(await api.post<P.PartnerRoomDto>(`/partner/rooms/${roomId}/active`, { isActive }));
  },

  // ---------------- calendrier de la salle ----------------
  /**
   * Remplace toutes les plages d'ouverture. Aucune séance confirmée n'est annulée : `uncoveredConfirmedBookings`
   * indique combien sortent des nouvelles plages.
   */
  async replaceOpenings(
    roomId: string,
    openings: { dayOfWeek: number; startTime: string; endTime: string }[],
  ): Promise<{ openings: RoomOpening[]; uncoveredConfirmedBookings: number }> {
    const result = await api.put<P.PartnerReplaceAvailabilitiesResultDto>(`/partner/rooms/${roomId}/availabilities`, {
      availabilities: openings,
    });
    return { openings: toRoomOpenings(result.availabilities), uncoveredConfirmedBookings: result.uncoveredConfirmedBookings };
  },
  async listBlocks(roomId: string): Promise<RoomBlock[]> {
    return (await api.get<P.PartnerRoomBlockDto[]>(`/partner/rooms/${roomId}/blocks`)).map(toRoomBlock);
  },
  /** 422 BLOCK_OVERLAPS_CONFIRMED_BOOKING : une fermeture n'écrase jamais une séance confirmée. */
  async addBlock(roomId: string, block: { startAt: string; endAt: string; reason?: string }): Promise<RoomBlock> {
    return toRoomBlock(await api.post<P.PartnerRoomBlockDto>(`/partner/rooms/${roomId}/blocks`, block));
  },
  async removeBlock(roomId: string, blockId: string): Promise<void> {
    await api.delete(`/partner/rooms/${roomId}/blocks/${blockId}`);
  },

  // ---------------- photos ----------------
  async uploadPhoto(roomId: string, file: LocalFile): Promise<void> {
    await upload(`/partner/rooms/${roomId}/photos/upload-url`, `/partner/rooms/${roomId}/photos`, file);
  },
  async removePhoto(roomId: string, photoId: string): Promise<void> {
    await api.delete(`/partner/rooms/${roomId}/photos/${photoId}`);
  },

  // ---------------- séances confirmées ----------------
  /** Séances CONFIRMED / IN_PROGRESS / COMPLETED : horaire, salle, effectif et tuteur — jamais le bénéficiaire. */
  async listReservations(roomId?: string): Promise<PartnerReservation[]> {
    const path = roomId ? `/partner/rooms/${roomId}/reservations` : "/partner/reservations";
    return (await api.get<P.PartnerReservationDto[]>(path)).map(toPartnerReservation);
  },
};
