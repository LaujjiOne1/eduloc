import { type Href, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { DayAgenda, markersFromOccurrences } from "@/components/ui/day-agenda";
import { HabitCalendar } from "@/components/ui/habit-calendar";
import { TutorBottomNav } from "@/components/ui/tutor-bottom-nav";
import { useTutorAvailability } from "@/hooks/use-tutor-availability";
import { useTutorBookings } from "@/hooks/use-tutor-bookings";
import { toIsoDate } from "@/lib/week";
import { AvailabilityService } from "@/services/availability.service";
import { formatDayLabel } from "@/utils/calendar";
import { useTranslation } from "react-i18next";

const newAvailabilityRoute = (date: string) => `/tutor-dashboard/calendar/availability/new?date=${date}` as Href;
const editAvailabilityRoute = (id: string) => `/tutor-dashboard/calendar/availability/${id}` as Href;

/** Jours planifiés à venir listés sous le jour choisi. */
const UPCOMING_DAYS = 6;

export function CalendarScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state: bookingsState, retry: retryBookings } = useTutorBookings();
  const { state: availabilityState, retry: retryAvailability } = useTutorAvailability();

  const [selectedDateIso, setSelectedDateIso] = useState<string>(() => toIsoDate(new Date()));

  const isLoading = bookingsState.status === "loading" || availabilityState.status === "loading";
  const error =
    bookingsState.status === "error"
      ? bookingsState.message
      : availabilityState.status === "error"
      ? availabilityState.message
      : null;

  const rawBookings = bookingsState.status === "success" ? bookingsState.bookings : null;
  const rawAvailability = availabilityState.status === "success" ? availabilityState.availability : null;

  // ~6 mois : pastilles du calendrier + détail du jour choisi + prochains jours planifiés.
  const occurrences = useMemo(
    () => AvailabilityService.expandCalendar(rawAvailability ?? [], rawBookings ?? [], 180),
    [rawAvailability, rawBookings],
  );
  const markers = useMemo(() => markersFromOccurrences(occurrences), [occurrences]);
  const dayItems = useMemo(() => occurrences.filter((o) => o.date === selectedDateIso), [occurrences, selectedDateIso]);
  const upcoming = useMemo(() => {
    const byDay = new Map<string, typeof occurrences>();
    for (const occurrence of occurrences) {
      if (occurrence.date === selectedDateIso || occurrence.date < toIsoDate(new Date())) continue;
      byDay.set(occurrence.date, [...(byDay.get(occurrence.date) ?? []), occurrence]);
    }
    return [...byDay.entries()].slice(0, UPCOMING_DAYS);
  }, [occurrences, selectedDateIso]);

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />

      <View className="px-5 pb-3">
        <Text className="text-[25px] font-bold text-ink">{t("tutorDashboard.calendar.myCalendar")}</Text>
        <Text className="mt-1 text-[13.5px] text-ink-soft">
          {t("tutorDashboard.calendar.viewAndManageYourAvailabilities")}</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <FadeIn delay={20}>
          <View className="px-5">
            <HabitCalendar
              variant="card"
              selectedDate={selectedDateIso}
              onSelectDate={setSelectedDateIso}
              markers={markers}
              onAdd={() => router.push(newAvailabilityRoute(selectedDateIso))}
            />
          </View>
        </FadeIn>

        <View className="px-5 pt-5">
          {error ? (
            <View className="flex-row items-center gap-3 py-4">
              <Text className="flex-1 text-[13.5px] text-error">{error}</Text>
              <PressableScale
                onPress={() => {
                  retryBookings();
                  retryAvailability();
                }}
                accessibilityLabel={t("common.tryAgain")}
              >
                <Text className="text-[13.5px] font-semibold text-primary">{t("common.tryAgain")}</Text>
              </PressableScale>
            </View>
          ) : (
            <>
              <FadeIn delay={40}>
                <DayAgenda
                  dateLabel={formatDayLabel(selectedDateIso)}
                  items={dayItems}
                  loading={isLoading}
                  onEditAvailability={(id) => router.push(editAvailabilityRoute(id))}
                  onAdd={() => router.push(newAvailabilityRoute(selectedDateIso))}
                />
              </FadeIn>

              {upcoming.length > 0 ? (
                <View className="mt-6">
                  <Text className="mb-3 text-[12.5px] font-bold uppercase tracking-wider text-ink-soft">
                    {t("tutorDashboard.calendar.upcomingScheduledDates")}</Text>
                  {upcoming.map(([date, items]) => (
                    <View key={date} className="mb-4">
                      <DayAgenda
                        dateLabel={formatDayLabel(date)}
                        items={items}
                        onEditAvailability={(id) => router.push(editAvailabilityRoute(id))}
                      />
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>

      <TutorBottomNav active="calendar" />
    </View>
  );
}
