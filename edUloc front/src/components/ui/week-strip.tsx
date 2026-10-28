import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type LayoutChangeEvent, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { addDays, isSameDay, weekDays, weekMonthLabel, weekRangeLabel } from "@/lib/week";
import { useTranslation } from "react-i18next";

const WEEKDAY_INITIALS = ["L", "M", "M", "J", "V", "S", "D"];
const WEEKDAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const SLIDE_MS = 220;
/** Part de la largeur (ou vitesse) au-delà de laquelle le geste change de semaine. */
const SWIPE_RATIO = 0.22;
const SWIPE_VELOCITY = 450;

/** available : créneaux ponctuels · recurring : seulement des horaires hebdomadaires · unavailable : jour désactivé. */
export type DayMarker = "available" | "recurring" | "unavailable" | null;

type WeekStripProps = {
  /** Lundi de la première semaine proposée (la semaine courante). */
  firstMonday: Date;
  weekCount: number;
  weekIndex: number;
  onWeekChange: (index: number) => void;
  /** Jour sélectionné dans la semaine : 0 = lundi … 6 = dimanche. */
  selectedDay: number;
  onSelectDay: (dayIndex: number) => void;
  /** Pastille sous le jour : créneaux disponibles / jour désactivé. */
  markerFor: (dayIndex: number) => DayMarker;
  /** Grille verrouillée (horaires qui se répètent chaque semaine) : ni glissement, ni flèches, ni sélection. */
  locked?: boolean;
};

/**
 * Bandeau de semaines (style « Modern Agenda ») : on glisse horizontalement — ou on utilise les flèches — pour
 * passer d'une semaine à l'autre ; le jour choisi se garde d'une semaine à l'autre et le mois affiché suit
 * la semaine visible. Trois semaines sont montées (précédente, courante, suivante) : le glissement est fluide et
 * identique sur mobile et sur le web.
 */
export function WeekStrip({ firstMonday, weekCount, weekIndex, onWeekChange, selectedDay, onSelectDay, markerFor, locked = false }: WeekStripProps) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  const today = useMemo(() => new Date(), []);
  const translateX = useSharedValue(0);
  const monday = addDays(firstMonday, weekIndex * 7);
  const last = weekCount - 1;

  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width));

  // La nouvelle semaine est montée au centre : on remet le glissement à zéro.
  useEffect(() => {
    translateX.set(0);
  }, [weekIndex, translateX]);

  const commit = useCallback(
    (index: number) => {
      Haptics.selectionAsync().catch(() => undefined);
      onWeekChange(index);
    },
    [onWeekChange],
  );

  /** Flèches / « Aujourd'hui » : glissement animé vers une semaine voisine, saut direct sinon. */
  const goTo = useCallback(
    (index: number) => {
      const target = Math.min(last, Math.max(0, index));
      if (target === weekIndex || !width || locked) return;
      if (Math.abs(target - weekIndex) === 1) {
        const direction = target > weekIndex ? -1 : 1;
        translateX.set(
          withTiming(direction * width, { duration: SLIDE_MS }, (finished) => {
            if (finished) runOnJS(commit)(target);
          }),
        );
      } else {
        commit(target);
      }
    },
    [last, weekIndex, width, translateX, commit, locked],
  );

  const pan = Gesture.Pan()
    .enabled(width > 0 && !locked)
    // Un glissement vertical appartient à la page, un glissement horizontal au bandeau.
    .activeOffsetX([-10, 10])
    .failOffsetY([-14, 14])
    .onUpdate((event) => {
      const atStart = weekIndex === 0 && event.translationX > 0;
      const atEnd = weekIndex === last && event.translationX < 0;
      translateX.set(atStart || atEnd ? event.translationX * 0.2 : event.translationX);
    })
    .onEnd((event) => {
      const goesNext = event.translationX < 0;
      const far = Math.abs(event.translationX) > width * SWIPE_RATIO || Math.abs(event.velocityX) > SWIPE_VELOCITY;
      const target = weekIndex + (goesNext ? 1 : -1);
      if (far && target >= 0 && target <= last) {
        translateX.set(
          withTiming((goesNext ? -1 : 1) * width, { duration: SLIDE_MS }, (finished) => {
            if (finished) runOnJS(commit)(target);
          }),
        );
      } else {
        translateX.set(withTiming(0, { duration: SLIDE_MS }));
      }
    });

  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.get() }] }));

  const pages = [weekIndex - 1, weekIndex, weekIndex + 1];

  return (
    <View
      className={["rounded-xl border border-line bg-surface p-3.5", locked ? "opacity-50" : ""].join(" ")}
      pointerEvents={locked ? "none" : "auto"}
      accessibilityState={{ disabled: locked }}
    >
      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-[17px] font-bold text-ink">{weekMonthLabel(monday)}</Text>
          <Text className="mt-0.5 text-[12px] text-ink-soft">
            {t("ui.weekStrip.weekOf", { range: weekRangeLabel(monday) })}
            {weekIndex === 0 ? t("ui.weekStrip.thisWeek") : ""}
          </Text>
        </View>
        {weekIndex !== 0 ? (
          <PressableScale onPress={() => goTo(0)} accessibilityLabel={t("ui.weekStrip.backToThisWeek")}>
            <View className="mr-2 rounded-full border border-primary bg-primary-tint/40 px-3 py-1.5">
              <Text className="text-[12px] font-bold text-primary">{t("common.today")}</Text>
            </View>
          </PressableScale>
        ) : null}
        <PressableScale onPress={() => goTo(weekIndex - 1)} disabled={weekIndex === 0} accessibilityLabel={t("ui.weekStrip.previousWeek")}>
          <View className={["h-8 w-8 items-center justify-center rounded-full border border-line", weekIndex === 0 ? "opacity-40" : ""].join(" ")}>
            <ChevronLeftIcon size={15} color="#332E86" />
          </View>
        </PressableScale>
        <PressableScale onPress={() => goTo(weekIndex + 1)} disabled={weekIndex === last} accessibilityLabel={t("ui.weekStrip.nextWeek")}>
          <View className={["ml-1.5 h-8 w-8 items-center justify-center rounded-full border border-line", weekIndex === last ? "opacity-40" : ""].join(" ")}>
            <ChevronRightIcon size={15} color="#332E86" />
          </View>
        </PressableScale>
      </View>

      <View onLayout={onLayout} style={{ overflow: "hidden" }}>
        {width > 0 ? (
          <GestureDetector gesture={pan}>
            <Animated.View style={[{ flexDirection: "row", width: width * 3, marginLeft: -width }, slideStyle]}>
              {pages.map((page, slot) => (
                <View key={slot} style={{ width }} className="flex-row">
                  {page < 0 || page > last
                    ? null
                    : weekDays(addDays(firstMonday, page * 7)).map((date, dayIndex) => {
                        const selected = page === weekIndex && dayIndex === selectedDay;
                        const isToday = isSameDay(date, today);
                        const marker = markerFor(dayIndex);
                        return (
                          <PressableScale
                            key={dayIndex}
                            onPress={() => {
                              Haptics.selectionAsync().catch(() => undefined);
                              onSelectDay(dayIndex);
                            }}
                            disabled={page !== weekIndex}
                            accessibilityLabel={page === weekIndex ? `${WEEKDAY_NAMES[dayIndex]} ${date.getDate()}` : undefined}
                            accessibilityState={{ selected }}
                            style={{ flex: 1 }}
                          >
                            <View
                              className={[
                                "mx-0.5 items-center rounded-xl py-2",
                                selected ? "bg-primary" : isToday ? "border border-primary bg-primary-tint/30" : "bg-paper",
                              ].join(" ")}
                            >
                              <Text className={["text-[11px] font-semibold", selected ? "text-white/80" : "text-ink-soft"].join(" ")}>
                                {WEEKDAY_INITIALS[dayIndex]}
                              </Text>
                              <Text className={["mt-0.5 text-[16px] font-bold", selected ? "text-white" : "text-ink"].join(" ")}>
                                {date.getDate()}
                              </Text>
                              <View
                                className={[
                                  "mt-1 h-[5px] w-[5px] rounded-full",
                                  marker === "available"
                                    ? selected ? "bg-white" : "bg-accent"
                                    : marker === "recurring"
                                      ? selected ? "bg-white/70" : "bg-primary/40"
                                    : marker === "unavailable"
                                      ? selected ? "bg-white/40" : "bg-line"
                                      : "bg-transparent",
                                ].join(" ")}
                              />
                            </View>
                          </PressableScale>
                        );
                      })}
                </View>
              ))}
            </Animated.View>
          </GestureDetector>
        ) : (
          <View className="h-[74px]" />
        )}
      </View>
    </View>
  );
}
