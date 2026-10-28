import { Text, View } from "react-native";

import { PlusIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { Button } from "@/components/ui/button";
import type { DayMarkers } from "@/components/ui/habit-calendar";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CalendarOccurrence } from "@/types/availability";
import { useTranslation } from "react-i18next";

/** Pastilles du calendrier : un jour a des créneaux disponibles et/ou des rendez-vous. */
export function markersFromOccurrences(occurrences: CalendarOccurrence[]): Record<string, DayMarkers> {
  const markers: Record<string, DayMarkers> = {};
  for (const occurrence of occurrences) {
    const mark = (markers[occurrence.date] ??= {});
    if (occurrence.kind === "booking") mark.booking = true;
    else mark.availability = true;
  }
  return markers;
}

type DayAgendaProps = {
  /** « Jeudi 15 octobre » */
  dateLabel: string;
  items: CalendarOccurrence[];
  onEditAvailability: (availabilityId: string) => void;
  onAdd?: () => void;
  loading?: boolean;
};

/** Détail du jour sélectionné sous le calendrier : créneaux disponibles et rendez-vous, ou état vide avec « Ajouter ». */
export function DayAgenda({ dateLabel, items, onEditAvailability, onAdd, loading }: DayAgendaProps) {
  const { t } = useTranslation();
  return (
    <View>
      <View className="mb-2.5 flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-[16px] font-bold text-ink">{dateLabel}</Text>
          <Text className="text-[12px] text-ink-soft">
            {loading ? t("common.loading") : items.length === 0 ? t("ui.dayAgenda.nothingPlanned") : t("ui.dayAgenda.slotOrLessonCount", { count: items.length })}
          </Text>
        </View>
        {onAdd ? (
          <PressableScale onPress={onAdd} accessibilityLabel={t("ui.dayAgenda.addASlotOn", { dateLabel })}>
            <View className="flex-row items-center gap-1 rounded-full border border-primary bg-primary-tint/30 px-3 py-1.5">
              <PlusIcon size={13} color="#332E86" />
              <Text className="text-[12px] font-bold text-primary">{t("ui.dayAgenda.slot")}</Text>
            </View>
          </PressableScale>
        ) : null}
      </View>

      {loading ? (
        <View className="h-[88px] rounded-2xl bg-line-soft" />
      ) : items.length === 0 ? (
        <View className="items-center rounded-2xl border border-line bg-surface p-5">
          <Text className="text-[14.5px] font-bold text-ink">{t("ui.dayAgenda.noSlotsOnThisDay")}</Text>
          <Text className="mt-1 max-w-[280px] text-center text-[13px] text-ink-soft">
            {t("ui.dayAgenda.youHaveNoAvailabilityOr")}</Text>
          {onAdd ? (
            <View className="mt-3.5">
              <Button label={t("ui.dayAgenda.addASlotOnThis")} size="sm" onPress={onAdd} />
            </View>
          ) : null}
        </View>
      ) : (
        <View className="rounded-2xl border border-line bg-surface px-4 py-1.5">
          {items.map((item, index) => (
            <View key={`${item.kind}-${item.availabilityId ?? item.bookingId}-${item.startTime}-${index}`} className={index > 0 ? "border-t border-line-soft" : ""}>
              <AgendaRow item={item} onEditAvailability={onEditAvailability} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function AgendaRow({ item, onEditAvailability }: { item: CalendarOccurrence; onEditAvailability: (id: string) => void }) {
  const { t } = useTranslation();
  if (item.kind === "booking") {
    return (
      <View className="flex-row items-center gap-[10px] py-3">
        <View className="w-[96px] rounded-md bg-accent-tint px-2 py-1 items-center">
          <Text className="text-[12.5px] font-bold text-accent">
            {item.startTime} – {item.endTime}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-[13.5px] font-bold text-ink" numberOfLines={1}>
            {item.label}
          </Text>
          <Text className="text-[11.5px] text-ink-faint">{t("common.confirmedAppointment")}</Text>
        </View>
        <StatusBadge status="confirmed" />
      </View>
    );
  }

  return (
    <PressableScale
      onPress={() => item.availabilityId && onEditAvailability(item.availabilityId)}
      accessibilityLabel={t("ui.dayAgenda.editTheAvailabilityFrom", { startTime: item.startTime })}
    >
      <View className="flex-row items-center gap-[10px] py-3">
        <View className="w-[96px] rounded-md bg-primary-tint px-2 py-1 items-center">
          <Text className="text-[12.5px] font-bold text-primary">
            {item.startTime} – {item.endTime}
          </Text>
        </View>
        <View className="flex-1">
          <View className="flex-row flex-wrap items-center gap-1.5">
            <Text className="text-[13.5px] font-semibold text-ink">{t("ui.dayAgenda.availableSlot")}</Text>
            <View className={["rounded px-1.5 py-0.5", item.recurring ? "bg-primary-tint" : "bg-warning-tint"].join(" ")}>
              <Text className={["text-[10.5px] font-bold", item.recurring ? "text-primary" : "text-warning"].join(" ")}>
                {item.recurring ? t("ui.dayAgenda.everyWeek") : t("ui.dayAgenda.oneTimeOnly")}
              </Text>
            </View>
          </View>
          <Text className="text-[11.5px] text-ink-faint" numberOfLines={1}>
            {item.label || t("ui.dayAgenda.available")}
          </Text>
        </View>
        <Text className="text-[12px] font-bold text-primary">{t("ui.dayAgenda.edit")}</Text>
      </View>
    </PressableScale>
  );
}
