import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CalendarIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { ApprentiBottomNav } from "@/components/ui/apprenti-bottom-nav";
import { AuthHeader } from "@/components/ui/auth-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMyBookings } from "@/hooks/use-my-bookings";
import type { Booking, BookingStatus } from "@/types/booking";
import { useTranslation } from "react-i18next";
import { t as tr } from "@/i18n";

function bookingRoute(id: string): Href {
  return `/apprenti-dashboard/bookings/${id}` as Href;
}

type Tab = "upcoming" | "pending" | "history";

const TABS: { id: Tab; label: string; statuses: BookingStatus[] }[] = [
  { id: "upcoming", get label() { return tr("common.upcoming"); }, statuses: ["confirmed", "in_progress"] },
  { id: "pending", get label() { return tr("common.pending2"); }, statuses: ["pending"] },
  { id: "history", get label() { return tr("partnerDashboard.dashboard.history"); }, statuses: ["completed", "cancelled", "refused"] },
];

export function MyBookingsScreen() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("upcoming");
  const { state, retry } = useMyBookings();

  const activeStatuses = TABS.find((t) => t.id === tab)!.statuses;
  const bookings = state.status === "success" ? state.bookings.filter((b) => activeStatuses.includes(b.status)) : [];

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      <Text className="px-5 pb-[14px] text-[25px] font-bold text-ink">{tr("common.myAppointments")}</Text>

      <View className="flex-row w-full gap-[6px] px-5 pb-4">
        {TABS.map(({ id, label }) => {
          const active = id === tab;
          return (
            <PressableScale key={id} onPress={() => setTab(id)} accessibilityLabel={label} >
              <View className={["items-center rounded-full py-[10px]", active ? "bg-primary" : "bg-paper-alt"].join(" ")}>
                <Text className={["text-[13.5px]", active ? "font-bold text-white " : "font-semibold text-ink-soft"].join(" ")}>
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
            <PressableScale onPress={retry} accessibilityLabel={tr("common.tryAgain")}>
              <Text className="text-[13.5px] font-semibold text-primary">{tr("common.tryAgain")}</Text>
            </PressableScale>
          </View>
        ) : bookings.length === 0 ? (
          <View className="items-center py-10">
            <Text className="text-center text-[14px] text-ink-soft">{emptyLabel(tab)}</Text>
          </View>
        ) : (
          bookings.map((booking, index) => (
            <FadeIn key={booking.id} delay={40 + index * 50}>
              <BookingCard booking={booking} onPress={() => router.push(bookingRoute(booking.id))} />
            </FadeIn>
          ))
        )}
      </ScrollView>

      <ApprentiBottomNav active="bookings" />
    </View>
  );
}

function emptyLabel(tab: Tab): string {
  switch (tab) {
    case "upcoming":
      return tr("common.noUpcomingAppointmentsAtThe");
    case "pending":
      return tr("common.noPendingRequestsAtThe");
    case "history":
      return tr("common.noAppointmentsInYourHistory");
  }
}

function BookingCard({ booking, onPress }: { booking: Booking; onPress: () => void }) {
  const { t: tr } = useTranslation();
  return (
    <PressableScale onPress={onPress} accessibilityLabel={tr("common.with2", { subjectLabel: booking.offer.subjectLabel, tutorName: booking.offer.tutorName })}>
      <View className="mb-3 rounded-lg border border-line bg-surface p-4">
        <View className="flex-row items-start justify-between">
          <View>
            <Text className="text-[15px] font-bold text-ink">{booking.offer.subjectLabel}</Text>
            <Text className="mt-[2px] text-[13px] text-ink-soft">{booking.offer.tutorName}</Text>
          </View>
          <StatusBadge status={booking.status} />
        </View>
        <View className="my-3 h-px bg-line-soft" />
        <View className="flex-row items-center gap-[6px]">
          <CalendarIcon size={14} color="#9799AF" />
          <Text className="text-[13px] text-ink-soft">
            {booking.slot.dateLabel} • {booking.slot.startTime}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}
