import { type Href, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RecurringDayCard } from "@/components/availability/recurring-day-card";
import { SlotModal } from "@/components/availability/slot-modal";
import { AddButton, SlotPill } from "@/components/availability/slot-pill";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { StepProgress } from "@/components/ui/step-progress";
import { type DayMarker, WeekStrip } from "@/components/ui/week-strip";
import { addDays, isSameDay, shortDateLabel, startOfWeek } from "@/lib/week";
import { useTutorApplicationStore } from "@/store/tutor-application.store";
import type { LocationFormatId } from "@/types/common";
import { useTranslation } from "react-i18next";
import { t as tr } from "@/i18n";

const TUTOR_DOCUMENTS_ROUTE = "/tutor-documents" as Href;
const TOTAL_STEPS = 9;
/** Semaines proposées à partir de cette semaine (≈ 6 mois). */
const WEEK_COUNT = 26;

type Mode = "recurring" | "dated";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "recurring", get label() { return tr("ui.dayAgenda.everyWeek"); }, get hint() { return tr("tutorOnboarding.tutorAvailability.repeatsEveryWeek"); } },
  { id: "dated", get label() { return tr("ui.dayAgenda.oneTimeOnly"); }, get hint() { return tr("common.forASpecificDate"); } },
];

/** AAAA-MM-JJ (heure locale). */
const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

type SlotTarget = { kind: "recurring"; dayId: string; label: string } | { kind: "dated"; date: string; label: string };

export function TutorAvailabilityScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const weeklyAvailability = useTutorApplicationStore((s) => s.weeklyAvailability);
  const dateAvailability = useTutorApplicationStore((s) => s.dateAvailability);
  const toggleWeeklyDay = useTutorApplicationStore((s) => s.toggleWeeklyDay);
  const addWeeklySlot = useTutorApplicationStore((s) => s.addWeeklySlot);
  const removeWeeklySlot = useTutorApplicationStore((s) => s.removeWeeklySlot);
  const addDateSlot = useTutorApplicationStore((s) => s.addDateSlot);
  const removeDateSlot = useTutorApplicationStore((s) => s.removeDateSlot);

  const [mode, setMode] = useState<Mode>("recurring");

  // Semaine affichée (0 = cette semaine) et jour choisi dans le bandeau (0 = lundi … 6 = dimanche).
  const today = useMemo(() => new Date(), []);
  const firstMonday = useMemo(() => startOfWeek(today), [today]);
  const [weekIndex, setWeekIndex] = useState(0);
  const [selectedDay, setSelectedDay] = useState(() => (new Date().getDay() + 6) % 7);
  const monday = addDays(firstMonday, weekIndex * 7);
  const scrollRef = useRef<ScrollView>(null);
  const listTop = useRef(0);
  const cardTop = useRef<number[]>([]);

  const dateOf = (dayIndex: number) => addDays(monday, dayIndex);
  const isPast = (date: Date) => toIsoDate(date) < toIsoDate(today);
  const slotsOn = (date: Date) => dateAvailability.filter((slot) => slot.date === toIsoDate(date));

  const markerFor = (dayIndex: number): DayMarker => {
    const day = weeklyAvailability[dayIndex];
    if (!day) return null;
    if (mode === "dated") {
      if (slotsOn(dateOf(dayIndex)).length > 0) return "available";
      return day.active && day.slots.length > 0 ? "recurring" : null;
    }
    return day.active && day.slots.length > 0 ? "available" : null;
  };

  // Le jour choisi dans le bandeau fait défiler la liste jusqu'à sa carte.
  const selectDay = (dayIndex: number) => {
    setSelectedDay(dayIndex);
    const y = listTop.current + (cardTop.current[dayIndex] ?? 0);
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  };

  // --- Modale d'ajout d'un créneau (récurrent ou ponctuel)
  const [target, setTarget] = useState<SlotTarget | null>(null);

  const handleSaveSlot = (slot: { startTime: string; endTime: string; format: LocationFormatId }) => {
    if (!target) return;
    if (target.kind === "recurring") addWeeklySlot(target.dayId, slot.startTime, slot.endTime, slot.format);
    else addDateSlot(target.date, slot.startTime, slot.endTime, slot.format);
    setTarget(null);
  };

  const upcomingDated = dateAvailability.filter((slot) => slot.date >= toIsoDate(today));
  const recurringCount = weeklyAvailability.filter((d) => d.active).reduce((sum, d) => sum + d.slots.length, 0);
  const totalSlots = recurringCount + upcomingDated.length;

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      <StepProgress step={9} total={TOTAL_STEPS} title={t("common.availabilities")} />

      <View className="px-5 pb-3">
        <FadeIn delay={40}>
          <Text className="mb-1 text-[24px] font-bold text-ink">{t("tutorOnboarding.tutorAvailability.yourAvailabilities")}</Text>
          <Text className="mb-3 text-[13.5px] text-ink-soft">
            {t("tutorOnboarding.tutorAvailability.chooseWhetherYourHoursRepeat")}</Text>
        </FadeIn>

        {/* Répéter chaque semaine OU une seule fois */}
        <View className="mb-3 flex-row gap-2 rounded-xl bg-paper-alt p-1 items-center justify-center" accessibilityRole="tablist">
          {MODES.map((option) => {
            const active = mode === option.id;
            return (
              <PressableScale
                key={option.id}
                onPress={() => setMode(option.id)}
                accessibilityLabel={option.label}
                accessibilityState={{ selected: active }}
                // style={{ flex: 1 }}
              >
                <View className={["items-center rounded-lg px-2 py-2.5", active ? "bg-surface" : ""].join(" ")}>
                  <Text className={["text-[13.5px] font-bold", active ? "text-primary" : "text-ink-soft"].join(" ")}>
                    {option.label}
                  </Text>
                  <Text className="mt-0.5 text-[11px] text-ink-faint">{option.hint}</Text>
                </View>
              </PressableScale>
            );
          })}
        </View>

        <WeekStrip
          firstMonday={firstMonday}
          weekCount={WEEK_COUNT}
          weekIndex={weekIndex}
          onWeekChange={setWeekIndex}
          selectedDay={selectedDay}
          onSelectDay={selectDay}
          markerFor={markerFor}
          locked={mode === "recurring"}
        />
        {mode === "recurring" ? (
          <Text className="mt-2 text-[12px] text-ink-soft">
            {t("tutorOnboarding.tutorAvailability.gridLockedTheseHoursApply")}</Text>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {mode === "recurring" ? (
          <View className="gap-3">
            {weeklyAvailability.map((day, index) => (
              <FadeIn key={day.dayId} delay={40 + index * 20}>
                <RecurringDayCard
                  day={day}
                  onToggle={() => toggleWeeklyDay(day.dayId)}
                  onAdd={() => setTarget({ kind: "recurring", dayId: day.dayId, label: t("common.everyWeek", { dayLabel: day.dayLabel }) })}
                  onRemove={(slotId) => removeWeeklySlot(day.dayId, slotId)}
                />
              </FadeIn>
            ))}
          </View>
        ) : (
          <View
            className="gap-3"
            onLayout={(event) => {
              listTop.current = event.nativeEvent.layout.y;
            }}
          >
            {weeklyAvailability.map((day, index) => {
              const date = dateOf(index);
              const past = isPast(date);
              const slots = slotsOn(date);
              return (
                <View key={day.dayId} onLayout={(event) => { cardTop.current[index] = event.nativeEvent.layout.y; }}>
                  <FadeIn key={`${day.dayId}-${weekIndex}`} delay={40 + index * 20}>
                    <DatedDayCard
                      dayLabel={day.dayLabel}
                      date={date}
                      isToday={isSameDay(date, today)}
                      selected={index === selectedDay}
                      past={past}
                      slots={slots}
                      recurring={day.active ? day.slots : []}
                      onAdd={() => setTarget({ kind: "dated", date: toIsoDate(date), label: `${day.dayLabel} ${shortDateLabel(date)}` })}
                      onRemove={removeDateSlot}
                    />
                  </FadeIn>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Fenêtre d'ajout d'un créneau (roues d'heures) — commune avec le tableau de bord */}
      {target ? (
        <SlotModal
          subtitle={target.kind === "dated" ? tr("tutorOnboarding.tutorAvailability.oneTimeOnlySuffix", { label: target.label }) : target.label}
          onClose={() => setTarget(null)}
          onSave={handleSaveSlot}
        />
      ) : null}

      <View
        className="border-t border-line-soft bg-surface px-5 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 22) }}
      >
        <Button
          label={tr("tutorOnboarding.tutorAvailability.continueWithSlots", { count: totalSlots })}
          onPress={() => router.push(TUTOR_DOCUMENTS_ROUTE)}
        />
      </View>
    </View>
  );
}

/** Mode « Une seule fois » : une date précise de la semaine affichée, avec un rappel des horaires hebdomadaires. */
function DatedDayCard({
  dayLabel,
  date,
  isToday,
  selected,
  past,
  slots,
  recurring,
  onAdd,
  onRemove,
}: {
  dayLabel: string;
  date: Date;
  isToday: boolean;
  selected: boolean;
  past: boolean;
  slots: { id: string; startTime: string; endTime: string; format: LocationFormatId }[];
  recurring: { id: string; startTime: string; endTime: string }[];
  onAdd: () => void;
  onRemove: (slotId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      className={[
        "rounded-xl border bg-surface p-4",
        selected ? "border-primary" : "border-line",
        past ? "opacity-50" : "",
      ].join(" ")}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 flex-row flex-wrap items-center gap-2">
          <Text className="text-[15.5px] font-bold text-ink">{dayLabel}</Text>
          <Text className="text-[13px] text-ink-soft">{shortDateLabel(date)}</Text>
          {isToday ? (
            <View className="rounded bg-primary-tint px-2 py-0.5">
              <Text className="text-[11px] font-bold text-primary">{t("common.today")}</Text>
            </View>
          ) : null}
          {past ? <Text className="text-[12px] text-ink-faint">{t("tutorOnboarding.tutorAvailability.past")}</Text> : null}
        </View>
        {past ? null : <AddButton label={t("tutorOnboarding.tutorAvailability.addASlotOn", { dayLabel, shortDateLabel: shortDateLabel(date) })} onPress={onAdd} />}
      </View>

      {slots.length > 0 ? (
        <View className="mt-3.5 flex-row flex-wrap gap-2 border-t border-line-soft pt-3">
          {slots.map((slot) => (
            <SlotPill key={slot.id} startTime={slot.startTime} endTime={slot.endTime} format={slot.format} onRemove={() => onRemove(slot.id)} />
          ))}
        </View>
      ) : null}

      {recurring.length > 0 ? (
        <Text className="mt-3 text-[11.5px] text-ink-faint">
          {t("tutorOnboarding.tutorAvailability.alreadyEvery", { toLowerCase: dayLabel.toLowerCase(), join: recurring.map((slot) => `${slot.startTime} – ${slot.endTime}`).join(", ") })}
        </Text>
      ) : slots.length === 0 && !past ? (
        <Text className="mt-2.5 text-[12px] italic text-ink-faint">{t("tutorOnboarding.tutorAvailability.noSlotsThatDayTap")}</Text>
      ) : null}
    </View>
  );
}
