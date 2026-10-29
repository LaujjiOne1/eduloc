import { LinearGradient } from "expo-linear-gradient";
import { useMemo } from "react";
import { Text, View } from "react-native";

import { WHEEL_ITEM_HEIGHT, WHEEL_VISIBLE_ITEMS, WheelColumn, type WheelItemData } from "@/components/ui/wheel-column";
import { useTranslation } from "react-i18next";

export type TimeRangeWheelPickerProps = {
  /** « HH:mm » */
  startTime: string;
  endTime: string;
  onChangeStart: (time: string) => void;
  onChangeEnd: (time: string) => void;
  disabled?: boolean;
};

/** Pas des minutes : assez fin pour un créneau, assez court pour une roue lisible. */
const MINUTE_STEP = 5;
const HOUR_WIDTH = 56;
const MINUTE_WIDTH = 56;

const pad = (value: number) => String(value).padStart(2, "0");

const HOURS: WheelItemData[] = Array.from({ length: 24 }, (_, hour) => ({ key: hour, label: pad(hour) }));
const MINUTES: WheelItemData[] = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => ({
  key: i * MINUTE_STEP,
  label: pad(i * MINUTE_STEP),
}));

/** « 14:20 » → heure 14, index de minute 4 (minute arrondie au pas le plus proche). */
function parse(time: string): { hour: number; minuteIndex: number } {
  const [h, m] = time.split(":").map(Number);
  const hour = Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 0;
  const minuteIndex = Number.isFinite(m) ? Math.min(MINUTES.length - 1, Math.round(m / MINUTE_STEP)) : 0;
  return { hour, minuteIndex };
}

/**
 * Sélecteur d'horaire (début → fin) à roues — même présentation que la date de naissance : roues aimantées avec
 * perspective, bande de sélection, retour haptique à chaque cran et fond en dégradé aux couleurs d'EduLoc.
 */
export function TimeRangeWheelPicker({ startTime, endTime, onChangeStart, onChangeEnd, disabled }: TimeRangeWheelPickerProps) {
  const { t } = useTranslation();
  const start = useMemo(() => parse(startTime), [startTime]);
  const end = useMemo(() => parse(endTime), [endTime]);

  const set = (current: { hour: number; minuteIndex: number }, patch: { hour?: number; minuteIndex?: number }) => {
    const next = { ...current, ...patch };
    return `${pad(next.hour)}:${pad(MINUTES[next.minuteIndex].key as number)}`;
  };

  return (
    <View className="overflow-hidden rounded-2xl border border-line" accessibilityRole="none">
      <LinearGradient colors={["#ffffff", "#F3F0FC", "#ECEAF9"]} style={{ position: "absolute", inset: 0 }} />

      <View className="px-3 pb-3 pt-3">
        {/* Titres des colonnes */}
        <View className="mb-1 flex-row items-center justify-center">
          <View className="items-center" style={{ width: HOUR_WIDTH + MINUTE_WIDTH + 16 }}>
            <Text className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-faint">{t("ui.timeRangeWheelPicker.start")}</Text>
          </View>
          <View style={{ width: 36 }} />
          <View className="items-center" style={{ width: HOUR_WIDTH + MINUTE_WIDTH + 16 }}>
            <Text className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-faint">{t("ui.timeRangeWheelPicker.end")}</Text>
          </View>
        </View>

        <View className="items-center justify-center">
          {/* Bande de sélection commune aux quatre roues */}
          <View
            pointerEvents="none"
            className="absolute inset-x-0 rounded-xl border border-primary/20 bg-white/70"
            style={{ top: WHEEL_ITEM_HEIGHT * Math.floor(WHEEL_VISIBLE_ITEMS / 2), height: WHEEL_ITEM_HEIGHT }}
          />
          <View className="flex-row items-center justify-center">
            <View className="flex-row items-center">
              <WheelColumn
                items={HOURS}
                selectedIndex={start.hour}
                onSelect={(hour) => onChangeStart(set(start, { hour }))}
                width={HOUR_WIDTH}
                accessibilityLabel={t("ui.timeRangeWheelPicker.startHour")}
                disabled={disabled}
              />
              <Text className="w-4 text-center text-[20px] font-bold text-primary">:</Text>
              <WheelColumn
                items={MINUTES}
                selectedIndex={start.minuteIndex}
                onSelect={(minuteIndex) => onChangeStart(set(start, { minuteIndex }))}
                width={MINUTE_WIDTH}
                accessibilityLabel={t("ui.timeRangeWheelPicker.startMinute")}
                disabled={disabled}
              />
            </View>

            <View className="mx-1 w-[28px] items-center">
              <Text className="text-[16px] font-bold text-primary">→</Text>
            </View>

            <View className="flex-row items-center">
              <WheelColumn
                items={HOURS}
                selectedIndex={end.hour}
                onSelect={(hour) => onChangeEnd(set(end, { hour }))}
                width={HOUR_WIDTH}
                accessibilityLabel={t("ui.timeRangeWheelPicker.endHour")}
                disabled={disabled}
              />
              <Text className="w-4 text-center text-[20px] font-bold text-primary">:</Text>
              <WheelColumn
                items={MINUTES}
                selectedIndex={end.minuteIndex}
                onSelect={(minuteIndex) => onChangeEnd(set(end, { minuteIndex }))}
                width={MINUTE_WIDTH}
                accessibilityLabel={t("ui.timeRangeWheelPicker.endMinute")}
                disabled={disabled}
              />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
