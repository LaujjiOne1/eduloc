import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { WHEEL_ITEM_HEIGHT, WHEEL_VISIBLE_ITEMS, WheelColumn, type WheelItemData } from "@/components/ui/wheel-column";
import { useTranslation } from "react-i18next";
import { currentIntlLocale } from "@/i18n";

type BirthDateSelectModalProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (date: Date) => void;
  initialDate?: Date;
  minYear?: number;
  maxYear?: number;
  /** Âge minimal exigé : « Valider » reste désactivé en dessous. */
  minAge?: number;
};

/** Dégradés aux couleurs EduLoc : le fond glisse de l'un à l'autre quand on passe de la 1re à la 2e moitié de l'année. */
const GRADIENT_FIRST_HALF = ["#ffffff", "#F3F0FC", "#ECEAF9"] as const;
const GRADIENT_SECOND_HALF = ["#F3F0FC", "#ECEAF9", "#E1F5EF"] as const;

const DEFAULT_DATE = new Date(1997, 4, 12);
const DAY_WIDTH = 72;
const MONTH_WIDTH = 142;
const YEAR_WIDTH = 92;

const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

const monthItems = (): WheelItemData[] =>
  Array.from({ length: 12 }, (_, month) => {
    const name = new Intl.DateTimeFormat(currentIntlLocale(), { month: "long" }).format(new Date(2000, month, 1));
    return { key: month, label: name.charAt(0).toUpperCase() + name.slice(1) };
  });

export function ageOn(birth: Date, today = new Date()): number {
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** « 14 mars 1996 » / « 14 March 1996 » selon la langue active. */
export function formatBirthDate(date: Date): string {
  return new Intl.DateTimeFormat(currentIntlLocale(), { day: "numeric", month: "long", year: "numeric" }).format(date);
}

/**
 * Sélecteur de date de naissance en modale, inspiré de TimerSelectMenu : trois roues
 * (jour · mois · année) aimantées, retour haptique, fond en dégradé animé — aux couleurs d'EduLoc.
 */
export function BirthDateSelectModal({
  visible,
  onClose,
  onSelect,
  initialDate,
  minYear = 1920,
  maxYear = new Date().getFullYear() - 15,
  minAge = 15,
}: BirthDateSelectModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const years = useMemo<WheelItemData[]>(
    () => Array.from({ length: maxYear - minYear + 1 }, (_, i) => ({ key: minYear + i, label: String(minYear + i) })),
    [minYear, maxYear],
  );

  const [parts, setParts] = useState(() => toParts(initialDate, minYear, maxYear));
  // L'état initial vient du champ : le parent ne monte la modale qu'à l'ouverture (chaque ouverture repart de zéro).

  const dayCount = daysInMonth(parts.year, parts.month);
  const dayItems = useMemo<WheelItemData[]>(
    () => Array.from({ length: dayCount }, (_, i) => ({ key: i + 1, label: String(i + 1).padStart(2, "0") })),
    [dayCount],
  );
  const day = Math.min(parts.day, dayCount);
  const date = new Date(parts.year, parts.month, day);
  const age = ageOn(date);
  const tooYoung = age < minAge;

  const setMonth = (month: number) => setParts((p) => ({ ...p, month, day: Math.min(p.day, daysInMonth(p.year, month)) }));
  const setYear = (year: number) => setParts((p) => ({ ...p, year, day: Math.min(p.day, daysInMonth(year, p.month)) }));

  // Fond : fondu entre les deux dégradés selon la moitié de l'année.
  const secondHalf = useSharedValue(parts.month >= 6 ? 1 : 0);
  useEffect(() => {
    secondHalf.value = withTiming(parts.month >= 6 ? 1 : 0, { duration: 500 });
  }, [parts.month, secondHalf]);
  const secondHalfStyle = useAnimatedStyle(() => ({ opacity: secondHalf.value }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end bg-ink/45">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel={t("ui.birthDateSelectModal.closeWithoutSaving")} />

        <View className="overflow-hidden rounded-t-[28px]" accessibilityViewIsModal>
          <LinearGradient colors={GRADIENT_FIRST_HALF} style={{ position: "absolute", inset: 0 }} />
          <Animated.View pointerEvents="none" style={[{ position: "absolute", inset: 0 }, secondHalfStyle]}>
            <LinearGradient colors={GRADIENT_SECOND_HALF} style={{ flex: 1 }} />
          </Animated.View>

          <View className="px-6 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 20) }}>
            <View className="mb-4 h-1 w-10 self-center rounded-full bg-line" />

            <View className="mb-5 flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-soft">
                  {t("common.dateOfBirth")}</Text>
                <Text className="mt-0.5 text-[19px] font-bold text-ink">{formatBirthDate(date)}</Text>
              </View>
              <View className={["rounded-full border px-3 py-1", tooYoung ? "border-error bg-error-tint" : "border-primary/20 bg-primary-tint"].join(" ")}>
                <Text className={["text-[12.5px] font-bold", tooYoung ? "text-error" : "text-primary"].join(" ")}>
                  {age >= 0 ? t("common.yearsOld", { age }) : "—"}
                </Text>
              </View>
            </View>

            <View className="mb-1 flex-row justify-center gap-1">
              {[
                [t("ui.birthDateSelectModal.day"), DAY_WIDTH],
                [t("ui.birthDateSelectModal.month"), MONTH_WIDTH],
                [t("ui.birthDateSelectModal.year"), YEAR_WIDTH],
              ].map(([title, width]) => (
                <Text
                  key={title}
                  className="text-center text-[11px] font-bold uppercase tracking-[0.06em] text-ink-faint"
                  style={{ width: width as number }}
                >
                  {title}
                </Text>
              ))}
            </View>

            <View className="items-center justify-center">
              {/* Bande de sélection commune aux trois roues */}
              <View
                pointerEvents="none"
                className="absolute inset-x-0 rounded-xl border border-primary/20 bg-white/70"
                style={{ top: WHEEL_ITEM_HEIGHT * Math.floor(WHEEL_VISIBLE_ITEMS / 2), height: WHEEL_ITEM_HEIGHT }}
              />
              <View className="flex-row justify-center gap-1">
                <WheelColumn
                  items={dayItems}
                  selectedIndex={day - 1}
                  onSelect={(index) => setParts((p) => ({ ...p, day: index + 1 }))}
                  width={DAY_WIDTH}
                  accessibilityLabel={t("ui.birthDateSelectModal.day")}
                />
                <WheelColumn items={monthItems()} selectedIndex={parts.month} onSelect={setMonth} width={MONTH_WIDTH} accessibilityLabel={t("ui.birthDateSelectModal.month")} />
                <WheelColumn
                  items={years}
                  selectedIndex={Math.max(0, parts.year - minYear)}
                  onSelect={(index) => setYear(minYear + index)}
                  width={YEAR_WIDTH}
                  accessibilityLabel={t("ui.birthDateSelectModal.year")}
                />
              </View>
            </View>

            <Text className="mt-3 min-h-[18px] text-center text-[12.5px] text-error">
              {tooYoung ? t("ui.birthDateSelectModal.youMustBeAtLeast", { minAge }) : ""}
            </Text>

            <View className="mt-3 flex-row gap-3">
              <View className="flex-1">
                <Button label={t("common.cancel")} variant="ghost" onPress={onClose} />
              </View>
              <View className="flex-1">
                <Button label={t("common.confirm")} disabled={tooYoung} onPress={() => onSelect(date)} />
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function toParts(initial: Date | undefined, minYear: number, maxYear: number) {
  const base = initial ?? DEFAULT_DATE;
  const year = Math.min(maxYear, Math.max(minYear, base.getFullYear()));
  const month = base.getMonth();
  return { year, month, day: Math.min(base.getDate(), daysInMonth(year, month)) };
}
