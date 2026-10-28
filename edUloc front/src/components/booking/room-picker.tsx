import { useState } from "react";
import { Text, View } from "react-native";

import { CheckIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import type { PartnerRoom } from "@/types/room";
import { useTranslation } from "react-i18next";

type RoomPickerProps = {
  rooms: PartnerRoom[];
  value: string | null;
  onChange: (roomId: string) => void;
};

/**
 * Salles partenaires où le tuteur accepte d'intervenir (le serveur n'envoie que celles-là : une salle proche mais non
 * acceptée n'est jamais proposée). Aucune adresse exacte : zone approximative et distance estimée seulement.
 */
export function RoomPicker({ rooms, value, onChange }: RoomPickerProps) {
  const { t } = useTranslation();
  if (rooms.length === 0) {
    return (
      <View className="rounded-lg border border-line bg-surface p-4">
        <Text className="text-[13.5px] text-ink-soft">{t("booking.roomPicker.noPartnerRoomIsAvailable")}</Text>
      </View>
    );
  }
  return (
    <View className="gap-[10px]">
      {rooms.map((room) => (
        <RoomCard key={room.id} room={room} selected={room.id === value} onPress={() => onChange(room.id)} />
      ))}
    </View>
  );
}

function RoomCard({ room, selected, onPress }: { room: PartnerRoom; selected: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <View
      className={["rounded-lg border p-4", selected ? "border-primary bg-primary-tint" : "border-line bg-surface"].join(" ")}
    >
      <PressableScale onPress={onPress} accessibilityLabel={t("booking.roomPicker.chooseTheRoom", { name: room.name })}>
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            {room.distanceLabel ? (
              <View className="mb-[6px] self-start rounded-full bg-accent-tint px-[10px] py-[3px]">
                <Text className="text-[12.5px] font-bold text-accent">{t("booking.roomPicker.fromYou", { distanceLabel: room.distanceLabel })}</Text>
              </View>
            ) : null}
            <Text className="text-[15px] font-bold text-ink">{room.name}</Text>
            {room.zoneLabel ? <Text className="mt-[2px] text-[12.5px] text-ink-soft">{room.zoneLabel}</Text> : null}
            <Text className="mt-[6px] text-[12.5px] text-ink-soft">
              {t("common.seatCount", { count: room.capacity })}
              {room.pricePerHourLabel ? ` · ${room.pricePerHourLabel}` : ""}
            </Text>
            {room.equipment.length > 0 ? (
              <Text className="mt-1 text-[12px] text-ink-faint" numberOfLines={2}>
                {room.equipment.join(" · ")}
              </Text>
            ) : null}
          </View>
          {selected ? (
            <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
              <CheckIcon size={11} color="#fff" />
            </View>
          ) : (
            <View className="h-5 w-5 rounded-full border-2 border-line" />
          )}
        </View>
      </PressableScale>

      <PressableScale onPress={() => setOpen((v) => !v)} accessibilityLabel={open ? t("booking.roomPicker.hideDetails") : t("booking.roomPicker.showDetails")}>
        <Text className="mt-3 text-[12.5px] font-bold text-primary">{open ? t("booking.roomPicker.hideDetails") : t("booking.roomPicker.showDetails")}</Text>
      </PressableScale>
      {open ? (
        <View className="mt-2 gap-[6px]">
          {room.description ? <Text className="text-[12.5px] leading-[18px] text-ink-soft">{room.description}</Text> : null}
          {room.accessibility.length > 0 ? (
            <Text className="text-[12.5px] text-ink-soft">{t("booking.roomPicker.accessibility", { join: room.accessibility.join(", ") })}</Text>
          ) : null}
          {room.rules ? <Text className="text-[12.5px] text-ink-soft">{t("booking.roomPicker.rules", { rules: room.rules })}</Text> : null}
          {room.cancellationPolicy ? (
            <Text className="text-[12.5px] text-ink-soft">{t("booking.roomPicker.cancellation", { cancellationPolicy: room.cancellationPolicy })}</Text>
          ) : null}
          <Text className="text-[12px] text-ink-faint">
            {t("booking.roomPicker.theExactAddressWillBe")}</Text>
        </View>
      ) : null}
    </View>
  );
}
