import type { TeachingModeId } from "@/types/booking";
import type { OfferPlace, OfferSlot } from "@/types/offer";
import { t } from "@/i18n";

/** Libellé court du mode d'enseignement d'un créneau (déterminé par le lieu de la plage, calculé par le serveur). */
export const TEACHING_MODE_LABELS: Record<TeachingModeId, string> = {
  get online() { return t("common.online"); },
  get at_home_beneficiary() { return t("lib.teachingMode.atHome"); },
  get at_home_tutor() { return t("common.atTheTutorSPlace"); },
  get public_place() { return t("common.publicPlace"); },
  get partner_room() { return t("booking.roomLocationBlock.partnerRoom"); },
};

/** Modes en présentiel, dans l'ordre où ils sont proposés au demandeur. */
export const IN_PERSON_MODES: TeachingModeId[] = ["at_home_beneficiary", "at_home_tutor", "public_place", "partner_room"];

const PLACE_TYPE_TO_MODE: Record<OfferPlace["type"], TeachingModeId> = {
  online: "online",
  beneficiary_home: "at_home_beneficiary",
  tutor_home: "at_home_tutor",
  public_place: "public_place",
  partner_room: "partner_room",
};

/** Mode d'un créneau : celui calculé par le serveur, sinon déduit du lieu de la plage. */
export function slotTeachingMode(slot: OfferSlot, places: OfferPlace[]): TeachingModeId {
  if (slot.teachingMode) return slot.teachingMode;
  const place = places.find((p) => p.id === slot.placeId);
  return place ? PLACE_TYPE_TO_MODE[place.type] : "online";
}

/** Modes que le tuteur accepte pour cette offre (un mode présentiel n'existe que si le tuteur a déclaré le lieu). */
export function offerTeachingModes(places: OfferPlace[]): TeachingModeId[] {
  return Array.from(new Set(places.map((p) => PLACE_TYPE_TO_MODE[p.type])));
}
