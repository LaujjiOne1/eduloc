import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { PARTNER_ROOM_PLACE_ID } from "@/api/mappers";
import { useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
// TimeRangeWheelPicker is a native vertical wheel right inside this scroll
// view — react-native-gesture-handler's ScrollView is needed so its own
// vertical scroll gesture correctly yields to the wheel's GestureDetector
// instead of swallowing the drag (plain RN ScrollView doesn't participate in
// RNGH's gesture arbitration).
import { ScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ClockIcon,
  PlusIcon,
  XIcon,
} from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { RecurringDayCard } from "@/components/availability/recurring-day-card";
import { SlotModal } from "@/components/availability/slot-modal";
import { markersFromOccurrences } from "@/components/ui/day-agenda";
import { HabitCalendar } from "@/components/ui/habit-calendar";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { type SelectOption, SelectField } from "@/components/ui/select-field";
import { TimeRangeWheelPicker } from "@/components/ui/time-range-wheel-picker";
import { useAvailabilityActions } from "@/hooks/use-availability-actions";
import { useAvailabilityDetail } from "@/hooks/use-availability-detail";
import { useTutorAvailability } from "@/hooks/use-tutor-availability";
import { useTutorBookings } from "@/hooks/use-tutor-bookings";
import { fromIsoDate, toIsoDate } from "@/lib/week";
import { AvailabilityService } from "@/services/availability.service";
import { useTutorProfile } from "@/hooks/use-tutor-profile";
import { formatDayLabel } from "@/utils/calendar";
import { useTranslation } from "react-i18next";
import { t as tr } from "@/i18n";
import { t as translate } from "@/i18n";

const CALENDAR_ROUTE = "/tutor-dashboard/calendar" as Href;
const ONLINE_OPTION: SelectOption = { id: "online", get label() { return tr("common.online"); } };
/** Plage réservée aux séances dans les salles partenaires où le tuteur accepte d'intervenir. */
const PARTNER_ROOM_OPTION: SelectOption = { id: PARTNER_ROOM_PLACE_ID, get label() { return tr("common.partnerRooms"); } };

/** Même choix que dans l'onboarding : un créneau pour une date précise, ou répété chaque semaine. */
type RepeatMode = "once" | "weekly";
const REPEAT_OPTIONS: { id: RepeatMode; label: string; hint: string }[] = [
  { id: "once", get label() { return tr("ui.dayAgenda.oneTimeOnly"); }, get hint() { return tr("common.forASpecificDate"); } },
  { id: "weekly", get label() { return tr("ui.dayAgenda.everyWeek"); }, get hint() { return tr("tutorDashboard.availabilityEdit.repeatsOnTheChosenDays"); } },
];
/** dow : 0 = dimanche … 6 = samedi (convention de l'API). */
const WEEKDAYS = [
  { dow: 1, get label() { return tr("common.monday"); } },
  { dow: 2, get label() { return tr("common.tuesday"); } },
  { dow: 3, get label() { return tr("common.wednesday"); } },
  { dow: 4, get label() { return tr("common.thursday"); } },
  { dow: 5, get label() { return tr("common.friday"); } },
  { dow: 6, get label() { return tr("common.saturday"); } },
  { dow: 0, get label() { return tr("common.sunday"); } },
];

type WeeklyDraftDay = {
  dow: number;
  dayLabel: string;
  active: boolean;
  slots: { id: string; startTime: string; endTime: string }[];
};

type ConfiguredSlot = {
  id: string;
  startTime: string;
  endTime: string;
};

export function AvailabilityEditScreen() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, date: dateParam } = useLocalSearchParams<{ id?: string; date?: string }>();
  const isEditMode = !!id;

  const { state: detailState } = useAvailabilityDetail(id);
  const { state: profileState } = useTutorProfile();
  const { state: actionState, save, saveAll, remove } = useAvailabilityActions();

  // Date selection state
  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  // Date préremplie depuis le calendrier (?date=AAAA-MM-JJ), à venir uniquement.
  const initialDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam >= todayIso ? dateParam : todayIso;
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [selectedDateLabel, setSelectedDateLabel] = useState<string>(formatDayLabel(initialDate));

  // Une seule fois (date) ou chaque semaine (jours de la semaine) — comme dans l'onboarding.
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("once");
  const [weekdays, setWeekdays] = useState<number[]>(() => [fromIsoDate(initialDate).getDay()]);

  // « Chaque semaine » (création) : mêmes cartes de jours et même fenêtre d'ajout que dans l'onboarding du tuteur.
  const initialDow = fromIsoDate(initialDate).getDay();
  const [weeklyDays, setWeeklyDays] = useState<WeeklyDraftDay[]>(() =>
    WEEKDAYS.map((day) => ({ dow: day.dow, dayLabel: day.label, active: day.dow === initialDow, slots: [] })),
  );
  const [slotTarget, setSlotTarget] = useState<{ dow: number; label: string } | null>(null);

  // Pastilles du calendrier : ce qui est déjà planifié (créneaux + rendez-vous).
  const { state: calendarAvailability } = useTutorAvailability();
  const { state: calendarBookings } = useTutorBookings();
  const calendarMarkers = useMemo(
    () =>
      markersFromOccurrences(
        AvailabilityService.expandCalendar(
          calendarAvailability.status === "success" ? calendarAvailability.availability : [],
          calendarBookings.status === "success" ? calendarBookings.bookings : [],
          180,
        ),
      ),
    [calendarAvailability, calendarBookings],
  );

  // Time wheel state (Start and End side by side)
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("10:00");

  // Configured slots for this date (added via the top-right + button)
  const [configuredSlots, setConfiguredSlots] = useState<ConfiguredSlot[]>([]);
  const [slotError, setSlotError] = useState<string | null>(null);

  // Place: "En ligne" or one of the tutor's own registered locations
  // (real Place ids — no location/format checkboxes, the format is derived
  // server-side from the place chosen, AGENTS.md §11).
  const [placeOption, setPlaceOption] = useState<SelectOption | null>(null);

  // Locations registered by the tutor
  const locations = profileState.status === "success" ? profileState.profile.locations : [];
  const placeOptions: SelectOption[] = [ONLINE_OPTION, PARTNER_ROOM_OPTION, ...locations.map((l) => ({ id: l.id, label: l.label }))];

  // Seed form in edit mode
  const [seededEntryId, setSeededEntryId] = useState<string | null>(null);
  if (detailState.status === "success" && seededEntryId !== detailState.entry.id) {
    const entry = detailState.entry;
    setSeededEntryId(entry.id);
    setRepeatMode(entry.kind === "recurring" ? "weekly" : "once");
    setWeekdays([entry.dayOfWeek]);
    setSelectedDate(entry.date ?? todayIso);
    setSelectedDateLabel(entry.dateLabel);
    setStartTime(entry.startTime);
    setEndTime(entry.endTime);
    setConfiguredSlots([
      {
        id: entry.id,
        startTime: entry.startTime,
        endTime: entry.endTime,
      },
    ]);
    setPlaceOption(entry.placeId ? { id: entry.placeId, label: entry.locationLabel } : ONLINE_OPTION);
  }

  const placeId = placeOption && placeOption.id !== "online" ? placeOption.id : null;

  // Add slot handler (+ button in top right of time section)
  const handleAddSlot = () => {
    setSlotError(null);
    if (!startTime || !endTime) {
      setSlotError(tr("tutorDashboard.availabilityEdit.pleaseSelectAStartAnd"));
      return;
    }
    if (startTime >= endTime) {
      setSlotError(tr("common.theEndTimeMustBe2"));
      return;
    }

    const duplicate = configuredSlots.some(
      (s) => s.startTime === startTime && s.endTime === endTime
    );
    if (duplicate) {
      setSlotError(tr("tutorDashboard.availabilityEdit.thisTimeSlotHasAlready"));
      return;
    }

    const newSlot: ConfiguredSlot = {
      id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      startTime,
      endTime,
    };
    setConfiguredSlots((prev) => [...prev, newSlot]);

    // Advance wheel to next hour for convenience
    const [endH] = endTime.split(":");
    const nextStartH = Math.min(22, Number(endH));
    const nextEndH = Math.min(23, nextStartH + 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    setStartTime(`${pad(nextStartH)}:00`);
    setEndTime(`${pad(nextEndH)}:00`);
  };

  const handleRemoveSlot = (slotId: string) => {
    setConfiguredSlots((prev) => prev.filter((s) => s.id !== slotId));
    setSlotError(null);
  };

  // Determine if valid to submit
  const hasValidTime =
    configuredSlots.length > 0 || (!!startTime && !!endTime && startTime < endTime);

  const isWeekly = repeatMode === "weekly";
  // Création « chaque semaine » : cartes de jours + fenêtre d'ajout (comme l'onboarding) ; sinon roue + liste de ce jour.
  const useCards = isWeekly && !isEditMode;
  const weeklySlotCount = weeklyDays.filter((d) => d.active).reduce((sum, d) => sum + d.slots.length, 0);
  const canSubmit = useCards
    ? weeklySlotCount > 0 && !!placeOption
    : (isWeekly ? weekdays.length > 0 : !!selectedDate) && hasValidTime && !!placeOption;

  const toggleWeeklyDay = (dow: number) =>
    setWeeklyDays((days) => days.map((day) => (day.dow === dow ? { ...day, active: !day.active } : day)));
  const addWeeklySlot = (dow: number, startTime: string, endTime: string) =>
    setWeeklyDays((days) =>
      days.map((day) =>
        day.dow === dow
          ? { ...day, active: true, slots: [...day.slots, { id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, startTime, endTime }] }
          : day,
      ),
    );
  const removeWeeklySlot = (dow: number, slotId: string) =>
    setWeeklyDays((days) => days.map((day) => (day.dow === dow ? { ...day, slots: day.slots.filter((slot) => slot.id !== slotId) } : day)));

  const toggleWeekday = (dow: number) => {
    setWeekdays((current) => {
      // Modification d'un créneau existant : un seul jour. Création : plusieurs jours possibles.
      if (isEditMode) return [dow];
      return current.includes(dow) ? current.filter((d) => d !== dow) : [...current, dow];
    });
  };
  const weekdaysLabel = WEEKDAYS.filter((d) => weekdays.includes(d.dow))
    .map((d) => d.label.toLowerCase())
    .join(", ");

  const isSaving = actionState.status === "saving";
  const isDeleting = actionState.status === "deleting";

  const handleSave = async () => {
    if (!canSubmit || !selectedDate) return;

    // Slots to save: either the configured slots list or the active wheel slot
    const slotsToSave: { startTime: string; endTime: string }[] =
      configuredSlots.length > 0
        ? configuredSlots
        : [{ startTime, endTime }];

    if (isEditMode && id) {
      // In edit mode, update the single existing entry (son type — ponctuel / hebdomadaire — ne change pas)
      const firstSlot = slotsToSave[0];
      const entry = await save(
        id,
        isWeekly
          ? { kind: "recurring", dayOfWeek: weekdays[0], startTime: firstSlot.startTime, endTime: firstSlot.endTime, placeId }
          : { kind: "one_off", date: selectedDate, startTime: firstSlot.startTime, endTime: firstSlot.endTime, placeId },
      );
      if (entry) router.replace(CALENDAR_ROUTE);
    } else {
      // Création : chaque plage horaire × (la date choisie | chaque jour de la semaine coché)
      const drafts = useCards
        ? weeklyDays
            .filter((day) => day.active)
            .flatMap((day) =>
              day.slots.map((slot) => ({
                kind: "recurring" as const,
                dayOfWeek: day.dow,
                startTime: slot.startTime,
                endTime: slot.endTime,
                placeId,
              })),
            )
        : isWeekly
        ? weekdays.flatMap((dayOfWeek) =>
            slotsToSave.map((s) => ({
              kind: "recurring" as const,
              dayOfWeek,
              startTime: s.startTime,
              endTime: s.endTime,
              placeId,
            })),
          )
        : slotsToSave.map((s) => ({
            kind: "one_off" as const,
            date: selectedDate,
            startTime: s.startTime,
            endTime: s.endTime,
            placeId,
          }));

      const ok = await saveAll(drafts);
      if (ok) router.replace(CALENDAR_ROUTE);
    }
  };

  const handleDelete = async () => {
    if (!isEditMode || !id) return;
    const ok = await remove(id);
    if (ok) router.replace(CALENDAR_ROUTE);
  };

  const isLoadingDetail =
    (isEditMode && detailState.status === "loading") || profileState.status === "loading";
  const detailError =
    isEditMode && detailState.status === "error" ? detailState.message : null;

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />

      {isLoadingDetail ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#332E86" />
        </View>
      ) : detailError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-[14px] text-error">{detailError}</Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: Math.max(insets.bottom + 90, 110),
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Title Header */}
          <FadeIn delay={20}>
            <View className="mb-5 pt-1">
              <Text className="text-[25px] font-bold text-ink">
                {isEditMode ? tr("tutorDashboard.availabilityEdit.editTheAvailability") : tr("tutorDashboard.availabilityEdit.addAvailabilities")}
              </Text>
              <Text className="mt-1 text-[13.5px] text-ink-soft">
                {tr("tutorDashboard.availabilityEdit.setTheDatesTimeRanges")}</Text>
            </View>
          </FadeIn>

          {actionState.status === "error" ? (
            <View className="mb-4">
              <FormError message={actionState.message} />
            </View>
          ) : null}

          {/* 1. Répétition : une seule fois OU chaque semaine (même choix que dans l'onboarding) */}
          <FadeIn delay={30}>
            <View className="mb-5">
              <Text className="mb-2 text-[14.5px] font-bold text-ink">{tr("tutorDashboard.availabilityEdit.n1Repetition")}</Text>
              <View className="flex-row gap-2 rounded-xl bg-paper-alt p-1" accessibilityRole="tablist">
                {REPEAT_OPTIONS.map((option) => {
                  const active = repeatMode === option.id;
                  return (
                    <PressableScale
                      key={option.id}
                      // Modifier un créneau existant ne change pas son type : supprimez-le puis recréez-le.
                      disabled={isEditMode && !active}
                      onPress={() => setRepeatMode(option.id)}
                      accessibilityLabel={option.label}
                      accessibilityState={{ selected: active, disabled: isEditMode && !active }}
                      style={{ flex: 1 }}
                    >
                      <View className={["items-center rounded-lg px-2 py-2.5", active ? "bg-surface" : "", isEditMode && !active ? "opacity-40" : ""].join(" ")}>
                        <Text className={["text-[13.5px] font-bold", active ? "text-primary" : "text-ink-soft"].join(" ")}>{option.label}</Text>
                        <Text className="mt-0.5 text-[11px] text-ink-faint">{option.hint}</Text>
                      </View>
                    </PressableScale>
                  );
                })}
              </View>
              <Text className="mt-2 text-[12px] text-ink-soft">
                {isWeekly
                  ? tr("tutorDashboard.availabilityEdit.thisSlotIsOfferedEvery")
                  : tr("tutorDashboard.availabilityEdit.thisSlotIsOnlyOffered")}
              </Text>
            </View>
          </FadeIn>

          {useCards ? (
            <FadeIn delay={40}>
              <View>
                <View className="mb-2 flex-row items-center justify-between">
                  <Text className="text-[14.5px] font-bold text-ink">{tr("tutorDashboard.availabilityEdit.n2DaysAndTimes")}</Text>
                  <Text className="text-[12.5px] font-medium text-primary">
                    {tr("common.slotCount", { count: weeklySlotCount })}
                  </Text>
                </View>
                <View className="gap-3">
                  {weeklyDays.map((day) => (
                    <RecurringDayCard
                      key={day.dow}
                      day={day}
                      onToggle={() => toggleWeeklyDay(day.dow)}
                      onAdd={() => setSlotTarget({ dow: day.dow, label: tr("common.everyWeek", { dayLabel: day.dayLabel }) })}
                      onRemove={(slotId) => removeWeeklySlot(day.dow, slotId)}
                    />
                  ))}
                </View>
              </View>
            </FadeIn>
          ) : (
            <>
          {/* Side-by-side or stacked layout matching user's design image */}
          <View className="flex-col lg:flex-row gap-5">
            {/* Left Section: date (une seule fois) ou jours de la semaine (chaque semaine) */}
            <View className="min-w-[300px] lg:flex-1">
              <FadeIn delay={40}>
                {isWeekly ? (
                  <View>
                    <View className="mb-2 flex-row items-center justify-between">
                      <Text className="text-[14.5px] font-bold text-ink">{tr("tutorDashboard.availabilityEdit.n2DaysOfTheWeek")}</Text>
                      <Text className="text-[12.5px] font-medium text-primary">{tr("common.dayCount", { count: weekdays.length })}</Text>
                    </View>
                    <View className="rounded-[28px] border border-line bg-surface p-4">
                      <View className="flex-row flex-wrap gap-2">
                        {WEEKDAYS.map((day) => {
                          const active = weekdays.includes(day.dow);
                          return (
                            <PressableScale
                              key={day.dow}
                              onPress={() => toggleWeekday(day.dow)}
                              accessibilityLabel={tr("tutorDashboard.availabilityEdit.every", { toLowerCase: day.label.toLowerCase() })}
                              accessibilityState={{ selected: active }}
                            >
                              <View className={["rounded-full border px-4 py-2.5", active ? "border-primary bg-primary" : "border-line bg-paper"].join(" ")}>
                                <Text className={["text-[13.5px] font-bold", active ? "text-white" : "text-ink-soft"].join(" ")}>{day.label}</Text>
                              </View>
                            </PressableScale>
                          );
                        })}
                      </View>
                      <Text className="mt-3 text-[12px] text-ink-faint">
                        {isEditMode ? tr("tutorDashboard.availabilityEdit.chooseTheDayOfThis") : tr("tutorDashboard.availabilityEdit.youCanTickSeveralDays")}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View>
                    <View className="mb-2 flex-row items-center justify-between">
                      <Text className="text-[14.5px] font-bold text-ink">{tr("tutorDashboard.availabilityEdit.n2Date")}</Text>
                      <Text className="text-[12.5px] font-medium text-primary">{selectedDateLabel}</Text>
                    </View>
                    <HabitCalendar
                      variant="card"
                      selectedDate={selectedDate}
                      onSelectDate={(date) => {
                        setSelectedDate(date);
                        setSelectedDateLabel(formatDayLabel(date));
                      }}
                      markers={calendarMarkers}
                      minDate={todayIso}
                    />
                  </View>
                )}
              </FadeIn>
            </View>

            {/* Right Section: Time Wheels + Plus Button + Configured Slots */}
            <View className="min-w-[300px] lg:flex-1">
              <FadeIn delay={60}>
                {/* Header with Title and Plus Button in the top right */}
                <View className="mb-2 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="text-[14.5px] font-bold text-ink">
                      {tr("tutorDashboard.availabilityEdit.n3TimeRangeWheel")}</Text>
                    <ClockIcon size={14} color="#9799AF" />
                  </View>

                  {/* Plus button at the top right */}
                  <PressableScale
                    onPress={handleAddSlot}
                    accessibilityLabel={tr("tutorDashboard.availabilityEdit.addThisTimeSlot")}
                  >
                    <View className="flex-row items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 shadow-2xs">
                      <PlusIcon size={14} color="#ffffff" />
                      <Text className="text-[12.5px] font-bold text-white">{tr("common.add")}</Text>
                    </View>
                  </PressableScale>
                </View>

                {/* Time Wheel Picker: Start Time & End Time side by side */}
                <TimeRangeWheelPicker
                  startTime={startTime}
                  endTime={endTime}
                  onChangeStart={(t) => {
                    setStartTime(t);
                    setSlotError(null);
                  }}
                  onChangeEnd={(t) => {
                    setEndTime(t);
                    setSlotError(null);
                  }}
                />

                {/* Error message for invalid time */}
                {slotError || (startTime && endTime && startTime >= endTime) ? (
                  <Text className="mt-2 text-[12.5px] font-medium text-error">
                    {slotError ?? tr("tutorDashboard.availabilityEdit.theEndTimeMustBe")}
                  </Text>
                ) : null}

                {/* List of configured slots for this day (matching the image slots column) */}
                {configuredSlots.length > 0 ? (
                  <View className="mt-4 rounded-xl border border-line bg-surface p-3.5 shadow-2xs">
                    <Text className="mb-2.5 text-[12px] font-bold text-ink-soft uppercase tracking-wider">
                      {tr("tutorDashboard.availabilityEdit.scheduledSlots", { value: isWeekly ? tr("tutorDashboard.availabilityEdit.every2", { value: weekdaysLabel || "semaine" }) : tr("tutorDashboard.availabilityEdit.for", { selectedDateLabel }), length: configuredSlots.length })}</Text>
                    <View className="gap-2">
                      {configuredSlots.map((slot) => (
                        <View
                          key={slot.id}
                          className="flex-row items-center justify-between rounded-lg border border-line-soft bg-paper px-3 py-2.5"
                        >
                          <View className="flex-row items-center gap-2">
                            <View className="h-6 w-6 items-center justify-center rounded-md bg-primary-tint">
                              <ClockIcon size={12} color="#332E86" />
                            </View>
                            <Text className="text-[14px] font-bold text-ink tabular-nums">
                              {slot.startTime} → {slot.endTime}
                            </Text>
                          </View>

                          <PressableScale
                            onPress={() => handleRemoveSlot(slot.id)}
                            accessibilityLabel={tr("tutorDashboard.availabilityEdit.deleteTheToSlot", { startTime: slot.startTime, endTime: slot.endTime })}
                          >
                            <View className="h-7 w-7 items-center justify-center rounded-md">
                              <XIcon size={14} color="#DE3B40" />
                            </View>
                          </PressableScale>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </FadeIn>
            </View>
          </View>

            </>
          )}

          {/* Place Section (replaces format checkboxes — the format is derived
              server-side from the place chosen, one_off draft only takes a
              placeId, not a format) */}
          <FadeIn delay={80}>
            <View className="mt-6 rounded-2xl border border-line bg-surface p-4 sm:p-5 shadow-2xs">
              <Text className="mb-3 text-[14.5px] font-bold text-ink">{tr("tutorDashboard.availabilityEdit.lessonLocation", { value: useCards ? "3" : "4" })}</Text>

              <SelectField
                label={tr("tutorDashboard.availabilityEdit.whereDoYouGiveThis")}
                value={placeOption}
                options={placeOptions}
                placeholder={tr("tutorDashboard.availabilityEdit.selectAPlace")}
                onSelect={setPlaceOption}
              />
              {locations.length === 0 ? (
                <Text className="mt-1 text-[12px] text-ink-faint">
                  {tr("tutorDashboard.availabilityEdit.addTeachingLocationsInYour")}</Text>
              ) : null}
            </View>
          </FadeIn>
        </ScrollView>
      )}

      {/* Fenêtre d'ajout d'un créneau hebdomadaire — la même que dans l'onboarding (sans format : il découle du lieu) */}
      {slotTarget ? (
        <SlotModal
          showFormat={false}
          subtitle={slotTarget.label}
          onClose={() => setSlotTarget(null)}
          onSave={(slot) => {
            addWeeklySlot(slotTarget.dow, slot.startTime, slot.endTime);
            setSlotTarget(null);
          }}
        />
      ) : null}

      {/* Sticky Bottom Summary Bar matching image.png */}
      <View
        className="absolute bottom-0 left-0 right-0 border-t border-line bg-surface/95 px-5 py-3.5 backdrop-blur-md shadow-lg"
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <View className="flex-col sm:flex-row items-center justify-between gap-3 max-w-4xl mx-auto w-full">
          {/* Summary text */}
          <View className="flex-1">
            <Text className="text-[13px] text-ink-soft" numberOfLines={2}>
              {isWeekly ? tr("tutorDashboard.availabilityEdit.availabilityEvery") : tr("tutorDashboard.availabilityEdit.availabilityFor")}
              <Text className="font-bold text-ink">
                {useCards
                  ? weeklyDays.filter((d) => d.active).map((d) => d.dayLabel.toLowerCase()).join(", ") || "—"
                  : isWeekly
                  ? weekdaysLabel || "—"
                  : selectedDateLabel}
              </Text>
              {" • "}
              <Text className="font-semibold text-primary">
                {useCards
                  ? tr("common.slotCount", { count: weeklySlotCount })
                  : configuredSlots.length > 0
                  ? tr("tutorDashboard.availabilityEdit.slotS", { length: configuredSlots.length })
                  : translate("tutorDashboard.availabilityEdit.timeRange", { startTime, endTime })}
              </Text>
              {" • "}
              <Text className="font-medium text-ink-faint">{placeOption?.label ?? tr("tutorDashboard.availabilityEdit.noPlaceChosen")}</Text>
            </Text>
          </View>

          {/* Action buttons */}
          <View className="flex-row items-center gap-2.5 w-full sm:w-auto">
            {isEditMode ? (
              <Button
                label={tr("common.delete")}
                variant="ghost"
                disabled={isSaving || isDeleting}
                loading={isDeleting}
                loadingLabel={tr("common.deleting")}
                onPress={handleDelete}
              />
            ) : null}

            <Button
              label={
                isEditMode
                  ? tr("common.saveChanges")
                  : useCards && weeklySlotCount > 1
                  ? tr("tutorDashboard.availabilityEdit.saveSlots", { weeklySlotCount })
                  : configuredSlots.length > 1
                  ? tr("tutorDashboard.availabilityEdit.saveSlots2", { length: configuredSlots.length })
                  : tr("tutorDashboard.availabilityEdit.saveTheAvailability")
              }
              disabled={!canSubmit || isSaving || isDeleting}
              loading={isSaving}
              loadingLabel={tr("common.saving")}
              onPress={handleSave}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
