import { Text, View } from "react-native";

import { LocationIcon, LockIcon } from "@/components/icons";
import type { Booking } from "@/types/booking";
import { useTranslation } from "react-i18next";

/** L'adresse exacte n'est donnée que pour une séance confirmée (ou en cours / terminée) : le backend la renvoie alors. */
const REVEALED = new Set<Booking["status"]>(["confirmed", "in_progress", "completed"]);

/**
 * Complément d'une réservation en SALLE PARTENAIRE : effectif, tarif de la salle, et — seulement une fois la séance
 * confirmée — adresse exacte et instructions d'accès (contrôle fait par l'API, pas seulement masqué ici).
 * Ne rend rien pour une autre forme de séance.
 */
export function RoomLocationBlock({ booking }: { booking: Booking }) {
  const { t } = useTranslation();
  if (booking.teachingMode !== "partner_room") return null;
  const revealed = REVEALED.has(booking.status);
  const closed = booking.status === "cancelled" || booking.status === "refused";

  return (
    <View className="mb-4 rounded-lg border border-line bg-surface p-4">
      <Text className="mb-2 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{t("booking.roomLocationBlock.partnerRoom")}</Text>
      {booking.room ? (
        <Text className="text-[14.5px] font-bold text-ink">
          {[booking.room.name, booking.room.zoneLabel].filter(Boolean).join(" — ")}
        </Text>
      ) : null}
      <Text className="mt-1 text-[13px] text-ink-soft">
        {t("common.participantCount", { count: booking.participantsCount })}
        {booking.roomFeeLabel ? t("booking.roomLocationBlock.roomFeeIndicative", { roomFeeLabel: booking.roomFeeLabel }) : ""}
      </Text>

      {revealed && booking.locationAddress ? (
        <View className="mt-3 rounded-md bg-primary-tint p-3">
          <View className="flex-row items-center gap-2">
            <LocationIcon size={15} color="#332E86" />
            <Text className="flex-1 text-[14px] font-bold text-ink">{booking.locationAddress}</Text>
          </View>
          {booking.accessInstructions ? (
            <Text className="mt-2 text-[13px] leading-[19px] text-ink-soft">{t("booking.roomLocationBlock.access", { accessInstructions: booking.accessInstructions })}</Text>
          ) : null}
        </View>
      ) : !closed ? (
        <View className="mt-3 flex-row items-start gap-2">
          <LockIcon size={14} color="#9799AF" />
          <Text className="flex-1 text-[12.5px] leading-[18px] text-ink-faint">
            {booking.status === "pending"
              ? t("booking.roomLocationBlock.theRoomIsNotReserved")
              : t("booking.roomLocationBlock.theExactAddressIsNot")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
