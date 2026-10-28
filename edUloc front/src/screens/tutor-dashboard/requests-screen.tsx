import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AlertTriangleIcon, CalendarIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TutorBottomNav } from "@/components/ui/tutor-bottom-nav";
import { useTutorBookings } from "@/hooks/use-tutor-bookings";
import type { Booking, BookingStatus } from "@/types/booking";
import { useTranslation } from "react-i18next";
import { t as tr } from "@/i18n";

function requestRoute(id: string): Href {
  return `/tutor-dashboard/requests/${id}` as Href;
}

type Tab = Extract<BookingStatus, "pending" | "confirmed">;

const TABS: { id: Tab; label: string }[] = [
  { id: "pending", get label() { return tr("common.pending2"); } },
  { id: "confirmed", get label() { return tr("tutorDashboard.requests.confirmed"); } },
];

export function RequestsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("pending");
  const { state, retry } = useTutorBookings();

  const bookings = state.status === "success" ? state.bookings.filter((b) => b.status === tab) : [];

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      <Text className="px-5 pb-[14px] text-[25px] font-bold text-ink">{t("tutorDashboard.requests.requests")}</Text>

      <View className="flex-row w-full h-[52px] gap-[14px] px-5 pb-4">
        {TABS.map(({ id, label }) => {
          const active = id === tab;
          return (
            <PressableScale key={id} onPress={() => setTab(id)} accessibilityLabel={label} style={{ flex: 1 }}>
              <View
                className={["items-center rounded-full py-[10px] p-5", active ? "bg-primary" : "bg-paper-alt"].join(" ")}
              >
                <Text className={["text-[13.5px]", active ? "font-bold text-white" : "font-semibold text-ink-soft"].join(" ")}>
                  {label}
                </Text>
              </View>
            </PressableScale>
          );
        })}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 20) }}
        showsVerticalScrollIndicator={false}
      >
        {state.status === "loading" ? (
          <View className="gap-3">
            {[0, 1].map((i) => (
              <View key={i} className="h-[104px] rounded-lg bg-line-soft" />
            ))}
          </View>
        ) : state.status === "error" ? (
          <View className="flex-row items-center gap-3">
            <Text className="flex-1 text-[13.5px] text-error">{state.message}</Text>
            <PressableScale onPress={retry} accessibilityLabel={t("common.tryAgain")}>
              <Text className="text-[13.5px] font-semibold text-primary">{t("common.tryAgain")}</Text>
            </PressableScale>
          </View>
        ) : bookings.length === 0 ? (
          <View className="items-center py-10">
            <Text className="text-center text-[14px] text-ink-soft">
              {tab === "pending" ? t("common.noPendingRequestsAtThe") : t("tutorDashboard.requests.noConfirmedRequestsYet")}
            </Text>
          </View>
        ) : (
          bookings.map((booking, index) => (
            <FadeIn key={booking.id} delay={40 + index * 50}>
              <RequestCard booking={booking} onPress={() => router.push(requestRoute(booking.id))} />
            </FadeIn>
          ))
        )}
      </ScrollView>

      <TutorBottomNav active="requests" />
    </View>
  );
}

function RequestCard({ booking, onPress }: { booking: Booking; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <PressableScale onPress={onPress} accessibilityLabel={t("common.requestFrom", { firstName: booking.beneficiary.firstName })}>
      <View className="mb-3 rounded-lg border border-line bg-surface p-4">
        <View className="flex-row items-start justify-between">
          <View>
            <Text className="text-[15px] font-bold text-ink">{booking.beneficiary.firstName}</Text>
            <Text className="mt-[2px] text-[13px] text-ink-soft">
              {booking.offer.subjectLabel} — {booking.slot.dateLabel} • {booking.slot.startTime}
            </Text>
          </View>
          <StatusBadge status={booking.status} />
        </View>
        <View className="my-3 h-px bg-line-soft" />
        <View className="flex-row items-center gap-[6px]">
          <CalendarIcon size={14} color="#9799AF" />
          <Text className="text-[13px] text-ink-soft">{booking.slot.dateLabel}</Text>
        </View>
        {booking.competingRequests.length > 0 ? (
          <View className="mt-3 flex-row items-center gap-[6px] rounded-md bg-warning-tint px-3 py-2">
            <AlertTriangleIcon size={14} color="#BD7E28" />
            <Text className="flex-1 text-[12.5px] font-semibold text-warning">
              {t("tutorDashboard.requests.sameTimeRequested", { value: booking.competingRequests.length === 1 ? t("tutorDashboard.requests.by1OtherPerson") : t("tutorDashboard.requests.byOtherPeople", { length: booking.competingRequests.length }) })}
            </Text>
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}
