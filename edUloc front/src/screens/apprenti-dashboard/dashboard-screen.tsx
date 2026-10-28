import { type Href, useRouter } from "expo-router";
import type { ComponentType } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CalendarIcon, ChevronRightIcon, type IconProps, PersonIcon, SearchIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { ApprentiBottomNav } from "@/components/ui/apprenti-bottom-nav";
import { NotificationBell } from "@/components/ui/notification-bell";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMyBookings } from "@/hooks/use-my-bookings";
import { useAuthStore } from "@/store/auth.store";
import { useSearchWizardStore } from "@/store/search-wizard.store";
import { useTranslation } from "react-i18next";

const MODE_SWITCH_ROUTE = "/mode-switch" as Href;
// The saved-beneficiaries address book (34_Beneficiaries) — not to be
// confused with the in-flow src/app/beneficiary.tsx booking wizard step.
const BENEFICIARIES_ROUTE = "/beneficiaries" as Href;
const SEARCH_ROUTE = "/search" as Href;
const BOOKINGS_ROUTE = "/apprenti-dashboard/bookings" as Href;

function bookingRoute(id: string): Href {
  return `/apprenti-dashboard/bookings/${id}` as Href;
}

export function DashboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state: bookingsState } = useMyBookings();
  const firstName = useAuthStore((s) => s.user?.firstName);
  const resetSearchWizard = useSearchWizardStore((s) => s.reset);

  const bookings = bookingsState.status === "success" ? bookingsState.bookings : [];
  const upcoming =
    bookings.find((b) => b.status === "pending") ??
    bookings.find((b) => b.status === "confirmed") ??
    bookings.find((b) => b.status === "in_progress") ??
    null;

  const goToSearch = () => {
    resetSearchWizard();
    router.push(SEARCH_ROUTE);
  };

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-5 pb-[14px] pt-5">
        <Text className="text-[21px] font-bold text-ink">
          Edu<Text className="text-primary">Loc</Text>
        </Text>
        <View className="flex-row items-center gap-[10px]">
          <PressableScale onPress={() => router.push(MODE_SWITCH_ROUTE)} accessibilityLabel={t("apprentiDashboard.dashboard.switchModeLearner")}>
            <View className="flex-row items-center gap-[6px] rounded-full bg-primary-tint py-[7px] pl-[10px] pr-3">
              <PersonIcon size={15} color="#332E86" />
              <Text className="text-[13px] font-bold text-primary">{t("common.learner")}</Text>
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
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, paddingTop: 6 }}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={30}>
          <Text className="mb-[2px] text-[24px] font-bold text-ink">{t("common.hello", { value: firstName ? `, ${firstName}` : "" })}</Text>
          <Text className="mb-5 text-[14px] text-ink-soft">{t("apprentiDashboard.dashboard.whatWouldYouLikeTo")}</Text>
        </FadeIn>

        <FadeIn delay={70}>
          <View className="mb-[26px]">
            <Button label={t("common.findATutor")} onPress={goToSearch} icon={<SearchIcon size={17} color="#fff" />} fullWidth />
          </View>
        </FadeIn>

        <FadeIn delay={100}>
          <Text className="mb-3 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
            {t("common.nextAppointment")}</Text>

          {bookingsState.status === "loading" ? (
            <View className="mb-7 h-[92px] rounded-lg bg-line-soft" />
          ) : bookingsState.status === "error" ? (
            <Text className="mb-7 text-[13.5px] text-error">{bookingsState.message}</Text>
          ) : upcoming ? (
            <PressableScale onPress={() => router.push(bookingRoute(upcoming.id))} accessibilityLabel={`Rendez-vous ${upcoming.offer.title}`}>
              <View className="mb-7 rounded-lg border border-line bg-surface p-4">
                <View className="flex-row items-start justify-between">
                  <View>
                    <Text className="text-[15.5px] font-bold text-ink">{upcoming.offer.subjectLabel}</Text>
                    <Text className="mt-[2px] text-[13px] text-ink-soft">{t("common.with", { tutorName: upcoming.offer.tutorName })}</Text>
                  </View>
                  <StatusBadge status={upcoming.status} />
                </View>
                <View className="my-3 h-px bg-line-soft" />
                <View className="flex-row items-center gap-[6px]">
                  <CalendarIcon size={14} color="#9799AF" />
                  <Text className="text-[13px] text-ink-soft">
                    {upcoming.slot.dateLabel} • {upcoming.slot.startTime}
                  </Text>
                </View>
              </View>
            </PressableScale>
          ) : (
            <View className="mb-7 items-center rounded-lg border border-line bg-surface py-6">
              <Text className="text-[13.5px] text-ink-soft">{t("common.noUpcomingAppointmentsAtThe")}</Text>
            </View>
          )}
        </FadeIn>

        <FadeIn delay={140}>
          <Text className="mb-3 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
            {t("apprentiDashboard.dashboard.myActivities")}</Text>
          <View className="gap-[10px]">
            <ActivityCard label="Rendez-vous" tint="primary" Icon={CalendarIcon} onPress={() => router.push(BOOKINGS_ROUTE)} />
            <ActivityCard label={t("apprentiDashboard.dashboard.beneficiaries")} tint="violet" Icon={PersonIcon} onPress={() => router.push(BENEFICIARIES_ROUTE)} />
          </View>
        </FadeIn>
      </ScrollView>

      <ApprentiBottomNav active="home" />
    </View>
  );
}

const TINT_CLASSES: Record<string, { bg: string; color: string }> = {
  primary: { bg: "bg-primary-tint", color: "#332E86" },
  violet: { bg: "bg-violet-tint", color: "#8D7FE3" },
  accent: { bg: "bg-accent-tint", color: "#0E9C82" },
  warning: { bg: "bg-warning-tint", color: "#BD7E28" },
};

function ActivityCard({
  label,
  tint,
  Icon,
  onPress,
  disabled,
}: {
  label: string;
  tint: keyof typeof TINT_CLASSES;
  Icon: ComponentType<IconProps>;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const { bg, color } = TINT_CLASSES[tint];
  return (
    <PressableScale onPress={onPress} disabled={disabled} accessibilityLabel={label}>
      <View className="flex-row items-center gap-[14px] rounded-lg border border-line bg-surface p-4">
        <View className={["h-[38px] w-[38px] items-center justify-center rounded-md", bg].join(" ")}>
          <Icon size={18} color={color} />
        </View>
        <Text className="flex-1 text-[14.5px] font-semibold text-ink">{label}</Text>
        <ChevronRightIcon size={16} color="#9799AF" />
      </View>
    </PressableScale>
  );
}
