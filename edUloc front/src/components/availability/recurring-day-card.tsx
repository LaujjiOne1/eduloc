import { Text, View } from "react-native";

import { CheckIcon } from "@/components/icons";
import { AddButton, SlotPill } from "@/components/availability/slot-pill";
import { PressableScale } from "@/components/motion/pressable-scale";
import type { LocationFormatId } from "@/types/common";
import { useTranslation } from "react-i18next";

/** Un jour de la grille hebdomadaire : activé ou non, avec ses plages horaires. */
export type RecurringDay = {
  dayLabel: string;
  active: boolean;
  slots: { id: string; startTime: string; endTime: string; format?: LocationFormatId }[];
};

/**
 * Carte d'un jour de la grille « chaque semaine » — la même dans l'onboarding du tuteur et dans l'ajout de
 * créneau du tableau de bord : case à cocher du jour, nombre de créneaux, « Ajouter » et plages avec corbeille.
 */
export function RecurringDayCard({
  day,
  onToggle,
  onAdd,
  onRemove,
}: {
  day: RecurringDay;
  onToggle: () => void;
  onAdd: () => void;
  onRemove: (slotId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className={["rounded-xl border p-4", day.active ? "border-line bg-surface" : "border-line/60 bg-paper-alt/60 opacity-70"].join(" ")}>
      <View className="flex-row items-center justify-between">
        <PressableScale onPress={onToggle} accessibilityLabel={t("availability.recurringDayCard.turnOnOrOff", { dayLabel: day.dayLabel })} style={{ flex: 1 }}>
          <View className="flex-row items-center gap-3">
            <View
              className={[
                "h-6 w-6 items-center justify-center rounded-md border",
                day.active ? "border-primary bg-primary" : "border-line bg-surface",
              ].join(" ")}
            >
              {day.active ? <CheckIcon size={14} color="#fff" /> : null}
            </View>
            <Text className={["text-[15.5px] font-bold", day.active ? "text-ink" : "text-ink-soft"].join(" ")}>
              {day.dayLabel}
            </Text>
            {day.active ? (
              <View className="rounded bg-accent-tint/60 px-2 py-0.5">
                <Text className="text-[11px] font-bold text-accent">
                  {t("common.slotCount", { count: day.slots.length })}
                </Text>
              </View>
            ) : (
              <Text className="text-[12px] text-ink-faint">{t("availability.recurringDayCard.unavailable")}</Text>
            )}
          </View>
        </PressableScale>
        {day.active ? <AddButton label={t("availability.recurringDayCard.addATimeRangeFor", { dayLabel: day.dayLabel })} onPress={onAdd} /> : null}
      </View>

      {day.active && day.slots.length > 0 ? (
        <View className="mt-3.5 flex-row flex-wrap gap-2 border-t border-line-soft pt-3">
          {day.slots.map((slot) => (
            <SlotPill key={slot.id} startTime={slot.startTime} endTime={slot.endTime} format={slot.format} onRemove={() => onRemove(slot.id)} />
          ))}
        </View>
      ) : day.active ? (
        <Text className="mt-2.5 text-[12px] italic text-ink-faint">
          {t("availability.recurringDayCard.noTimeRangeSetFor")}</Text>
      ) : null}
    </View>
  );
}
