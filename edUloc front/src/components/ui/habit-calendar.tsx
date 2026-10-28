import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type LayoutChangeEvent, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { ChevronRightIcon, PlusIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { SlidingPager } from "@/components/ui/sliding-pager";
import {
  addDays,
  compactDateLabel,
  fromIsoDate,
  isSameDay,
  monthStart,
  monthYearLabel,
  startOfWeek,
  toIsoDate,
  weekDays,
} from "@/lib/week";
import { useTranslation } from "react-i18next";
import { t as translate } from "@/i18n";

const WEEKDAY_INITIALS = ["L", "M", "M", "J", "V", "S", "D"];
const CHIP = 44;
const ROW = 54; // une ligne de jours (pastille + espace)
const SLIDE_MS = 260;
const GRADIENT = ["#332E86", "#3F3994"] as const;

export type DayMarkers = { availability?: boolean; booking?: boolean };

type HabitCalendarProps = {
  /** Jour sélectionné (AAAA-MM-JJ). */
  selectedDate: string;
  onSelectDate: (isoDate: string) => void;
  /** Pastilles sous les jours : créneaux disponibles (menthe) et rendez-vous (ambre). */
  markers?: Record<string, DayMarkers>;
  /** Jours antérieurs non sélectionnables (AAAA-MM-JJ). */
  minDate?: string;
  /** Bouton « + » (ajouter un créneau) ; masqué s'il est absent. */
  onAdd?: () => void;
  addLabel?: string;
  /** « header » : bandeau pleine largeur (écran) ; « card » : carte arrondie (dans une page). */
  variant?: "header" | "card";
  defaultExpanded?: boolean;
  /** Appelé quand la plage affichée change (semaine ou mois) : permet de charger les données à la demande. */
  onViewChange?: (range: { from: string; to: string }) => void;
};

/**
 * Calendrier « habit » aux couleurs d'EduLoc : bouton Aujourd'hui, date du jour sélectionné (la flèche déplie le
 * mois), « + », jours de la semaine, bandeau de semaines qu'on fait glisser, et une poignée qu'on tire (ou qu'on
 * touche) pour passer de la semaine au mois — où l'on glisse de mois en mois.
 */
export function HabitCalendar({
  selectedDate,
  onSelectDate,
  markers = {},
  minDate,
  onAdd,
  addLabel = translate("ui.habitCalendar.addASlot"),
  variant = "card",
  defaultExpanded = false,
  onViewChange,
}: HabitCalendarProps) {
  const { t } = useTranslation();
  const today = useMemo(() => new Date(), []);
  const todayIso = toIsoDate(today);
  const selected = fromIsoDate(selectedDate);

  const [width, setWidth] = useState(0);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [viewMonday, setViewMonday] = useState(() => startOfWeek(selected));
  const [viewMonth, setViewMonth] = useState(() => monthStart(selected));
  // Quand la sélection change de l'extérieur (Aujourd'hui, autre écran), l'affichage la suit.
  const [lastSelected, setLastSelected] = useState(selectedDate);
  if (lastSelected !== selectedDate) {
    setLastSelected(selectedDate);
    setViewMonday(startOfWeek(selected));
    setViewMonth(monthStart(selected));
  }

  // Plage visible : la semaine, ou le mois (voisins inclus : on glisse vers eux).
  const viewFrom = toIsoDate(expanded ? monthStart(viewMonth, -1) : addDays(viewMonday, -7));
  const viewTo = toIsoDate(expanded ? new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 2, 0) : addDays(viewMonday, 13));
  useEffect(() => {
    onViewChange?.({ from: viewFrom, to: viewTo });
  }, [viewFrom, viewTo, onViewChange]);

  // --- Hauteur animée : 0 = semaine, 1 = mois
  const rowsOf = (month: Date) => Math.ceil(((month.getDay() + 6) % 7 + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7);
  const monthHeight = rowsOf(viewMonth) * ROW;
  const progress = useSharedValue(defaultExpanded ? 1 : 0);
  const monthH = useSharedValue(monthHeight);
  useEffect(() => {
    monthH.set(withTiming(monthHeight, { duration: 200 }));
  }, [monthHeight, monthH]);

  const containerStyle = useAnimatedStyle(() => ({ height: ROW + (monthH.get() - ROW) * progress.get() }));
  const weekLayerStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.get() }));
  const monthLayerStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${90 + progress.get() * 180}deg` }] }));

  const settle = useCallback(
    (toExpanded: boolean) => {
      Haptics.selectionAsync().catch(() => undefined);
      setExpanded(toExpanded);
      // On revient sur la semaine / le mois de la date choisie.
      setViewMonday(startOfWeek(fromIsoDate(selectedDate)));
      setViewMonth(monthStart(fromIsoDate(selectedDate)));
    },
    [selectedDate],
  );

  const toggle = () => {
    const next = !expanded;
    progress.set(withTiming(next ? 1 : 0, { duration: SLIDE_MS }));
    settle(next);
  };

  const startProgress = useSharedValue(0);
  const handlePan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-24, 24])
    .onStart(() => {
      startProgress.set(progress.get());
    })
    .onUpdate((event) => {
      const range = Math.max(1, monthH.get() - ROW);
      progress.set(Math.min(1, Math.max(0, startProgress.get() + event.translationY / range)));
    })
    .onEnd((event) => {
      const target = event.velocityY > 400 ? 1 : event.velocityY < -400 ? 0 : progress.get() > 0.5 ? 1 : 0;
      progress.set(withTiming(target, { duration: SLIDE_MS }));
      runOnJS(settle)(target === 1);
    });

  const isDisabled = (iso: string) => !!minDate && iso < minDate;
  // Un glissement ne doit jamais sélectionner le jour sous le doigt / la souris au relâchement.
  const dragging = useRef(false);
  const releasedAt = useRef(0);
  const onDragChange = useCallback((value: boolean) => {
    dragging.current = value;
    if (!value) releasedAt.current = Date.now();
  }, []);
  const isRecentDrag = useCallback(() => dragging.current || Date.now() - releasedAt.current < 300, []);
  const select = (iso: string) => {
    if (isDisabled(iso) || isRecentDrag()) return;
    Haptics.selectionAsync().catch(() => undefined);
    onSelectDate(iso);
  };

  const goToday = () => {
    setViewMonday(startOfWeek(today));
    setViewMonth(monthStart(today));
    if (!isDisabled(todayIso)) onSelectDate(todayIso);
  };

  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width));
  const cell = width / 7;

  const renderChip = (date: Date, muted = false) => {
    const iso = toIsoDate(date);
    const isSelected = iso === selectedDate;
    const isToday = isSameDay(date, today);
    const disabled = isDisabled(iso);
    const mark = markers[iso];
    return (
      <View key={iso} style={{ width: cell, height: ROW }} className="items-center">
        <PressableScale
          onPress={() => select(iso)}
          disabled={disabled}
          accessibilityLabel={`${date.getDate()} ${monthYearLabel(date)}`}
          accessibilityState={{ selected: isSelected, disabled }}
        >
          <View
            style={{
              width: CHIP,
              height: CHIP,
              borderWidth: isToday && !isSelected ? 2 : 1,
              borderColor: isSelected ? "#FFFFFF" : isToday ? "#FFFFFF" : "rgba(255,255,255,0.32)",
              backgroundColor: isSelected ? "#FFFFFF" : "transparent",
              opacity: disabled ? 0.3 : muted ? 0.45 : 1,
            }}
            className="items-center justify-center rounded-[14px]"
          >
            <Text className={["text-[17px] font-bold", isSelected ? "text-primary" : "text-white"].join(" ")}>{date.getDate()}</Text>
            {mark?.availability || mark?.booking ? (
              <View className="absolute bottom-[5px] flex-row gap-[3px]">
                {mark.availability ? <View className="h-[5px] w-[5px] rounded-full" style={{ backgroundColor: isSelected ? "#0E9C82" : "#6EE7C7" }} /> : null}
                {mark.booking ? <View className="h-[5px] w-[5px] rounded-full" style={{ backgroundColor: isSelected ? "#BD7E28" : "#F8C46A" }} /> : null}
              </View>
            ) : null}
          </View>
        </PressableScale>
      </View>
    );
  };

  const renderWeek = (offset: -1 | 0 | 1) => (
    <View className="flex-row" style={{ height: ROW }}>
      {weekDays(addDays(viewMonday, 7 * offset)).map((date) => renderChip(date))}
    </View>
  );

  const renderMonth = (offset: -1 | 0 | 1) => {
    const first = monthStart(viewMonth, offset);
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: days }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1)),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    return (
      <View className="flex-row flex-wrap">
        {cells.map((date, index) =>
          date ? renderChip(date) : <View key={`blank-${offset}-${index}`} style={{ width: cell, height: ROW }} />,
        )}
      </View>
    );
  };

  const shiftWeek = (delta: number) => setViewMonday((current) => addDays(current, 7 * delta));
  const shiftMonth = (delta: number) => setViewMonth((current) => monthStart(current, delta));

  return (
    <View className={variant === "card" ? "overflow-hidden rounded-[28px]" : "overflow-hidden rounded-b-[28px]"}>
      <LinearGradient colors={GRADIENT} style={{ position: "absolute", inset: 0 }} />

      <View className="px-3 pt-3">
        {/* Ligne du haut : Aujourd'hui · date (flèche = mois) · + */}
        <View className="mb-1 flex-row items-center justify-between px-1">
          <PressableScale onPress={goToday} accessibilityLabel={t("ui.habitCalendar.backToToday")}>
            <View className="rounded-full border border-white/70 px-4 py-2">
              <Text className="text-[13.5px] font-bold text-white">{t("common.today")}</Text>
            </View>
          </PressableScale>

          <PressableScale onPress={toggle} accessibilityLabel={expanded ? t("ui.habitCalendar.collapseToWeek") : t("ui.habitCalendar.showTheMonth")}>
            <View className="items-center">
              <View className="flex-row items-center gap-1.5">
                <Text className="text-[18px] font-bold text-white">{compactDateLabel(selected)}</Text>
                <Animated.View style={chevronStyle}>
                  <ChevronRightIcon size={14} color="#FFFFFF" />
                </Animated.View>
              </View>
              <Text className="text-[11.5px] text-white/65">{monthYearLabel(expanded ? viewMonth : viewMonday)}</Text>
            </View>
          </PressableScale>

          {onAdd ? (
            <PressableScale onPress={onAdd} accessibilityLabel={addLabel}>
              <View className="h-[42px] w-[42px] items-center justify-center rounded-full bg-white">
                <PlusIcon size={20} color="#332E86" />
              </View>
            </PressableScale>
          ) : (
            <View style={{ width: 42 }} />
          )}
        </View>

        {/* Jours de la semaine */}
        <View className="mb-1 flex-row" onLayout={onLayout}>
          {WEEKDAY_INITIALS.map((initial, index) => (
            <View key={index} className="flex-1 items-center py-1.5">
              <Text className="text-[12.5px] font-semibold text-white/75">{initial}</Text>
            </View>
          ))}
        </View>

        {/* Semaine ⇄ mois (hauteur animée, fondu enchaîné) */}
        {width > 0 ? (
          <Animated.View style={[{ overflow: "hidden" }, containerStyle]}>
            <Animated.View style={[{ position: "absolute", left: 0, right: 0, top: 0 }, weekLayerStyle]} pointerEvents={expanded ? "none" : "auto"}>
              <SlidingPager
                width={width}
                resetKey={toIsoDate(viewMonday)}
                onPrev={() => shiftWeek(-1)}
                onNext={() => shiftWeek(1)}
                renderPage={renderWeek}
                disabled={expanded}
                onDragChange={onDragChange}
              />
            </Animated.View>
            <Animated.View style={[{ position: "absolute", left: 0, right: 0, top: 0 }, monthLayerStyle]} pointerEvents={expanded ? "auto" : "none"}>
              <SlidingPager
                width={width}
                resetKey={`${viewMonth.getFullYear()}-${viewMonth.getMonth()}`}
                onPrev={() => shiftMonth(-1)}
                onNext={() => shiftMonth(1)}
                renderPage={renderMonth}
                disabled={!expanded}
                onDragChange={onDragChange}
              />
            </Animated.View>
          </Animated.View>
        ) : (
          <View style={{ height: ROW }} />
        )}
      </View>

      {/* Poignée : on la tire vers le bas pour le mois, vers le haut pour la semaine */}
      <GestureDetector gesture={handlePan}>
        <View className="items-center pb-3 pt-1.5">
          <PressableScale onPress={toggle} accessibilityLabel={expanded ? t("ui.habitCalendar.collapseTheCalendar") : t("ui.habitCalendar.expandTheCalendar")}>
            <View className="h-[22px] w-[90px] items-center justify-center">
              <View className="h-[5px] w-[56px] rounded-full bg-white/45" />
            </View>
          </PressableScale>
        </View>
      </GestureDetector>
    </View>
  );
}
