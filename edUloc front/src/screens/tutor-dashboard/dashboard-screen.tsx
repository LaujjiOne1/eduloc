import { type Href, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChevronRightIcon, ClockIcon, TeachIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { DayAgenda, markersFromOccurrences } from "@/components/ui/day-agenda";
import { HabitCalendar } from "@/components/ui/habit-calendar";
import { NotificationBell } from "@/components/ui/notification-bell";
import { TutorBottomNav } from "@/components/ui/tutor-bottom-nav";
import { useTutorAvailability } from "@/hooks/use-tutor-availability";
import { useTutorBookings } from "@/hooks/use-tutor-bookings";
import { useTutorProfile } from "@/hooks/use-tutor-profile";
import { toIsoDate } from "@/lib/week";
import { AvailabilityService } from "@/services/availability.service";
import { useAuthStore } from "@/store/auth.store";
import type { Booking } from "@/types/booking";
import { formatDayLabel } from "@/utils/calendar";
import { useTranslation } from "react-i18next";

const MODE_SWITCH_ROUTE = "/mode-switch" as Href;
const APPOINTMENTS_ROUTE = "/tutor-dashboard/appointments" as Href;
const REQUESTS_ROUTE = "/tutor-dashboard/requests" as Href;
const CALENDAR_ROUTE = "/tutor-dashboard/calendar" as Href;
const newAvailabilityRoute = (date: string) => `/tutor-dashboard/calendar/availability/new?date=${date}` as Href;
const editAvailabilityRoute = (id: string) => `/tutor-dashboard/calendar/availability/${id}` as Href;

function requestRoute(id: string): Href {
  return `/tutor-dashboard/requests/${id}` as Href;
}

export function DashboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state: profileState } = useTutorProfile();
  const { state: bookingsState } = useTutorBookings();
  const { state: availabilityState } = useTutorAvailability();
  // Statut RÉEL du dossier (serveur, mis à jour en direct) — et non un drapeau local posé à l'envoi.
  const isPendingValidation = useAuthStore((s) => s.user?.tutor?.applicationStatus === "pending");

  const [selectedDateIso, setSelectedDateIso] = useState<string>(() => toIsoDate(new Date()));

  // Créneaux disponibles + rendez-vous sur ~6 mois : pastilles du calendrier et détail du jour choisi.
  const rawAvailability = availabilityState.status === "success" ? availabilityState.availability : null;
  const rawBookings = bookingsState.status === "success" ? bookingsState.bookings : null;
  const occurrences = useMemo(
    () => AvailabilityService.expandCalendar(rawAvailability ?? [], rawBookings ?? [], 180),
    [rawAvailability, rawBookings],
  );
  const markers = useMemo(() => markersFromOccurrences(occurrences), [occurrences]);
  const dayItems = useMemo(() => occurrences.filter((o) => o.date === selectedDateIso), [occurrences, selectedDateIso]);

  const firstName = profileState.status === "success" ? profileState.profile.firstName : "";

  const pending = bookingsState.status === "success" ? bookingsState.bookings.filter((b) => b.status === "pending") : [];
  const confirmed =
    bookingsState.status === "success" ? bookingsState.bookings.filter((b) => b.status === "confirmed") : [];
  const nextAppointment = confirmed[0] ?? null;

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-5 pb-[14px] pt-5">
        <Text className="text-[21px] font-bold text-ink">
          edU<Text className="text-primary">loc</Text>
        </Text>
        <View className="flex-row items-center gap-[10px]">
          <PressableScale onPress={() => router.push(MODE_SWITCH_ROUTE)} accessibilityLabel={t("tutorDashboard.dashboard.switchModeTutor")}>
            <View className="flex-row items-center gap-[6px] rounded-full bg-primary-tint py-[7px] pl-[10px] pr-3">
              <TeachIcon size={15} color="#332E86" />
              <Text className="text-[13px] font-bold text-primary">{t("common.tutor")}</Text>
              <View style={{ transform: [{ rotate: "90deg" }] }}>
                <ChevronRightIcon size={13} color="#332E86" />
              </View>
            </View>
          </PressableScale>
          <NotificationBell />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={30}>
          <Text className="mb-[2px] text-[24px] font-bold text-ink">{t("common.hello", { value: firstName ? `, ${firstName}` : "" })}</Text>
          <Text className="mb-5 text-[14px] text-ink-soft">{t("tutorDashboard.dashboard.yourActivity")}</Text>
        </FadeIn>

        {isPendingValidation ? (
          <FadeIn delay={50}>
            <View className="mb-5 rounded-xl border border-warning-tint bg-warning-tint/70 p-4">
              <View className="mb-2 flex-row items-center gap-[6px]">
                <ClockIcon size={16} color="#BD7E28" />
                <Text className="text-[12px] font-bold text-warning">{t("tutorDashboard.dashboard.fileUnderReview")}</Text>
              </View>
              <Text className="text-[13px] leading-[18.5px] text-ink-soft">
                {t("tutorDashboard.dashboard.yourApplicationIsCurrentlyBeing")}</Text>
            </View>
          </FadeIn>
        ) : null}

        {/* Statistiques d'activité */}
        <FadeIn delay={60}>
          <View className="mb-6 flex-row gap-3">
            <StatCard
              value={bookingsState.status === "success" ? pending.length : null}
              label="demandes"
              showArrow
              onPress={() => router.push(REQUESTS_ROUTE)}
              accessibilityLabel={t("tutorDashboard.dashboard.viewAllReceivedRequests")}
            />
            <StatCard
              value={bookingsState.status === "success" ? confirmed.length : null}
              label="RDV"
              onPress={() => router.push(APPOINTMENTS_ROUTE)}
              accessibilityLabel={t("tutorDashboard.dashboard.viewAllAppointments")}
            />
          </View>
        </FadeIn>

        {/* Calendrier et disponibilités (HabitCalendar) */}
        <FadeIn delay={80}>
          <View className="mb-2">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
                {t("tutorDashboard.dashboard.myCalendarAvailabilities")}</Text>
              <PressableScale
                onPress={() => router.push(CALENDAR_ROUTE)}
                accessibilityLabel={t("tutorDashboard.dashboard.openTheFullCalendar")}
              >
                <Text className="text-[12.5px] font-bold text-primary">{t("tutorDashboard.dashboard.manage")}</Text>
              </PressableScale>
            </View>

            <HabitCalendar
              variant="card"
              selectedDate={selectedDateIso}
              onSelectDate={setSelectedDateIso}
              markers={markers}
              onAdd={() => router.push(newAvailabilityRoute(selectedDateIso))}
            />
            <View className="mt-4">
              <DayAgenda
                dateLabel={formatDayLabel(selectedDateIso)}
                items={dayItems}
                loading={availabilityState.status === "loading" || bookingsState.status === "loading"}
                onEditAvailability={(id) => router.push(editAvailabilityRoute(id))}
                onAdd={() => router.push(newAvailabilityRoute(selectedDateIso))}
              />
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={100}>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
              {t("tutorDashboard.dashboard.pendingRequests")}</Text>
            <PressableScale onPress={() => router.push("/tutor-dashboard/requests" as Href)} accessibilityLabel={t("tutorDashboard.dashboard.seeAllRequests")}>
              <Text className="text-[12.5px] font-bold text-primary">{t("tutorDashboard.dashboard.seeAll")}</Text>
            </PressableScale>
          </View>

          {bookingsState.status === "loading" ? (
            <View className="mb-6 h-[130px] rounded-lg bg-line-soft" />
          ) : bookingsState.status === "error" ? (
            <Text className="mb-6 text-[13.5px] text-error">{bookingsState.message}</Text>
          ) : pending.length === 0 ? (
            <View className="mb-6 items-center rounded-lg border border-line bg-surface py-6">
              <Text className="text-[13.5px] text-ink-soft">{t("common.noPendingRequestsAtThe")}</Text>
            </View>
          ) : (
            <PendingRequestCard booking={pending[0]} onPress={() => router.push(requestRoute(pending[0].id))} />
          )}
        </FadeIn>

        <FadeIn delay={140}>
          <Text className="mb-3 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
            {t("common.nextAppointment")}</Text>
          {bookingsState.status === "loading" ? (
            <View className="h-[76px] rounded-lg bg-line-soft" />
          ) : nextAppointment ? (
            <PressableScale onPress={() => router.push(APPOINTMENTS_ROUTE)} accessibilityLabel={t("common.viewMyAppointments")}>
              <View className="rounded-lg border border-line bg-surface p-4">
                <Text className="text-[15px] font-bold text-ink">{nextAppointment.offer.title}</Text>
                <Text className="mt-1 text-[13px] text-ink-soft">
                  {nextAppointment.slot.dateLabel} • {nextAppointment.slot.startTime}
                </Text>
              </View>
            </PressableScale>
          ) : (
            <View className="items-center rounded-lg border border-line bg-surface py-6">
              <Text className="text-[13.5px] text-ink-soft">{t("common.noUpcomingAppointmentsAtThe")}</Text>
            </View>
          )}
        </FadeIn>
      </ScrollView>
      
      <TutorBottomNav active="home" />

    </View>
  );
}

type StatCardProps = {
  value: number | null;
  label: string;
  showArrow?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
};

function StatCard({ value, label, showArrow, onPress, accessibilityLabel }: StatCardProps) {
  const cardBody = (
    <View className="relative min-h-[96px] flex-1 items-center justify-center rounded-xl border border-line bg-surface px-3 py-5 shadow-2xs hover:border-primary/40">
      {showArrow ? (
        <View className="absolute right-3 top-3 h-[22px] w-[22px] items-center justify-center rounded-full bg-primary-tint">
          <ChevronRightIcon size={12} color="#332E86" />
        </View>
      ) : null}

      {value === null ? (
        <View className="mb-1 h-[28px] w-8 rounded bg-line-soft" />
      ) : (
        <Text className="text-[28px] font-bold text-primary">{value}</Text>
      )}

      <View className="mt-1 flex-row items-center gap-1">
        <Text className="text-[12.5px] font-medium text-ink-soft">{label}</Text>
        {showArrow ? <ChevronRightIcon size={12} color="#332E86" /> : null}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityRole="button"
        style={{ flex: 1 }}
      >
        {cardBody}
      </PressableScale>
    );
  }

  return cardBody;
}

function PendingRequestCard({ booking, onPress }: { booking: Booking; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <View className="mb-6 rounded-lg border border-line bg-surface p-4">
      <View className="mb-1 flex-row items-start justify-between">
        <View>
          <Text className="text-[15px] font-bold text-ink">{booking.beneficiary.firstName}</Text>
          <Text className="mt-[2px] text-[13px] text-ink-soft">{booking.offer.title.split(" ")[0]}</Text>
        </View>
        <View className="flex-row items-center gap-[6px] self-start rounded-full bg-warning-tint px-[11px] py-[5px]">
          <View className="h-[7px] w-[7px] rounded-full bg-warning" />
          <Text className="text-[12px] font-semibold text-warning">{t("common.pending")}</Text>
        </View>
      </View>
      <Text className="mb-[14px] text-[12.5px] text-ink-soft">
        {booking.slot.dateLabel} • {booking.slot.startTime}
      </Text>
      {/* Both actions open the full request detail (53) before anything is
          confirmed/refused, matching the mock's own hrefs and giving the
          tutor full context before an impactful decision. */}
      <View className="flex-row gap-[10px]">
        <PressableScale onPress={onPress} accessibilityLabel={t("tutorDashboard.dashboard.viewSRequest", { firstName: booking.beneficiary.firstName })} style={{ flex: 1 }}>
          <View className="items-center justify-center rounded-sm border border-line px-4 py-[9px]">
            <Text className="text-[13px] font-semibold text-ink">{t("common.decline")}</Text>
          </View>
        </PressableScale>
        <PressableScale onPress={onPress} accessibilityLabel={t("tutorDashboard.dashboard.viewSRequest", { firstName: booking.beneficiary.firstName })} style={{ flex: 1 }}>
          <View className="items-center justify-center rounded-sm bg-primary px-4 py-[9px]">
            <Text className="text-[13px] font-semibold text-white">{t("common.accept")}</Text>
          </View>
        </PressableScale>
      </View>
    </View>
  );
}
