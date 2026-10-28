import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { RoomLocationBlock } from "@/components/booking/room-location-block";
import { useEffect } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CalendarIcon, ClockIcon, LocationIcon, MicIcon, PhoneIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useTutorBooking } from "@/hooks/use-tutor-booking";
import type { Booking } from "@/types/booking";
import { useTranslation } from "react-i18next";

function requestRoute(id: string): Href {
  return `/tutor-dashboard/requests/${id}` as Href;
}
function conversationRoute(id: string): Href {
  return `/tutor-dashboard/appointments/${id}/conversation` as Href;
}
function callRoute(id: string): Href {
  return `/tutor-dashboard/appointments/${id}/call` as Href;
}
function startSessionRoute(id: string): Href {
  return `/tutor-dashboard/appointments/${id}/start-session` as Href;
}
function sessionRoute(booking: Booking): Href {
  return booking.sessionMode === "in_person"
    ? (`/tutor-dashboard/appointments/${booking.id}/session/presential` as Href)
    : (`/tutor-dashboard/appointments/${booking.id}/session` as Href);
}

export function TutorAppointmentDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, retry } = useTutorBooking(id);

  // Accepter/Refuser only exist on 53_TutorRequestDetail — a pending booking
  // reached here (e.g. a stale link) belongs there, not in this screen.
  useEffect(() => {
    if (state.status === "success" && state.booking.status === "pending") {
      router.replace(requestRoute(state.booking.id));
    }
  }, [state, router]);

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />

      {state.status === "loading" || (state.status === "success" && state.booking.status === "pending") ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#332E86" />
        </View>
      ) : state.status === "error" ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Text className="text-center text-[14px] text-error">{state.message}</Text>
          <PressableScale onPress={retry} accessibilityLabel={t("common.tryAgain")}>
            <Text className="text-[14px] font-semibold text-primary">{t("common.tryAgain")}</Text>
          </PressableScale>
        </View>
      ) : (
        <AppointmentDetailContent
          booking={state.booking}
          onOpenConversation={() => router.push(conversationRoute(state.booking.id))}
          onOpenCall={() => router.push(callRoute(state.booking.id))}
          onJoinSession={() => router.push(sessionRoute(state.booking))}
        />
      )}

      {state.status === "success" && state.booking.status === "confirmed" ? (
        <View className="border-t border-line-soft bg-surface px-5 pt-4" style={{ paddingBottom: Math.max(insets.bottom, 22) }}>
          <Button label={t("common.startTheSession")} onPress={() => router.push(startSessionRoute(state.booking.id))} />
        </View>
      ) : null}
    </View>
  );
}

function AppointmentDetailContent({
  booking,
  onOpenConversation,
  onOpenCall,
  onJoinSession,
}: {
  booking: Booking;
  onOpenConversation: () => void;
  onOpenCall: () => void;
  onJoinSession: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
      <View className="mb-[6px] flex-row items-start justify-between">
        <Text className="text-[24px] font-bold text-ink">{booking.offer.subjectLabel}</Text>
        <StatusBadge status={booking.status} />
      </View>
      <Text className="mb-5 text-[14px] text-ink-soft">{t("tutorDashboard.appointmentDetail.with", { firstName: booking.beneficiary.firstName })}</Text>

      <View className="mb-4 rounded-lg border border-line bg-surface p-4">
        <View className="mb-2 flex-row items-center gap-2">
          <CalendarIcon size={15} color="#585B78" />
          <Text className="text-[14px] font-semibold text-ink">{booking.slot.dateLabel}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <ClockIcon size={15} color="#585B78" />
          <Text className="text-[14px] font-semibold text-ink">
            {booking.slot.startTime} → {booking.slot.endTime}
          </Text>
        </View>
        {booking.status !== "cancelled" && booking.status !== "refused" ? (
          <View className="mt-2 flex-row items-center gap-2">
            <LocationIcon size={15} color="#585B78" />
            <Text className="text-[14px] font-semibold text-ink">{booking.offer.location}</Text>
          </View>
        ) : null}
      </View>

      <RoomLocationBlock booking={booking} />

      {booking.status === "confirmed" ? <ConfirmedSection onOpenConversation={onOpenConversation} onOpenCall={onOpenCall} /> : null}
      {booking.status === "in_progress" ? <InProgressSection onJoinSession={onJoinSession} /> : null}
      {booking.status === "completed" ? (
        <CompletedSection durationLabel={booking.sessionDurationLabel} onOpenConversation={onOpenConversation} />
      ) : null}
      {booking.status === "cancelled" || booking.status === "refused" ? <ClosedSection status={booking.status} /> : null}
    </ScrollView>
  );
}

function ConfirmedSection({ onOpenConversation, onOpenCall }: { onOpenConversation: () => void; onOpenCall: () => void }) {
  const { t } = useTranslation();
  return (
    <FadeIn delay={30}>
      <View className="flex-row gap-[10px]">
        <Button label={t("common.conversation")} variant="secondary" icon={<MicIcon size={16} color="#332E86" />} onPress={onOpenConversation} className="flex-1 w-full" />
        <Button label={t("common.call")} icon={<PhoneIcon size={16} color="#fff" />} onPress={onOpenCall} className="flex-1 w-f" />
      </View>
    </FadeIn>
  );
}

function InProgressSection({ onJoinSession }: { onJoinSession: () => void }) {
  const { t } = useTranslation();
  return (
    <FadeIn delay={30}>
      <View className="mb-5 items-center rounded-lg border border-primary-tint bg-primary-tint p-5">
        <Text className="mb-3 text-center text-[14px] font-semibold text-primary">{t("common.theSessionIsInProgress")}</Text>
        <Button label={t("common.joinTheSession")} onPress={onJoinSession} />
      </View>
    </FadeIn>
  );
}

function CompletedSection({ durationLabel, onOpenConversation }: { durationLabel?: string; onOpenConversation: () => void }) {
  const { t } = useTranslation();
  return (
    <FadeIn delay={30}>
      <View className="mb-5 rounded-lg border border-line bg-surface p-4">
        <Text className="text-[13.5px] text-ink-soft">{t("common.sessionCompleted", { value: durationLabel ? t("common.duration", { durationLabel }) : "" })}</Text>
      </View>
      <Button label={t("common.conversation")} variant="secondary" fullWidth onPress={onOpenConversation} />
    </FadeIn>
  );
}

function ClosedSection({ status }: { status: "cancelled" | "refused" }) {
  const { t } = useTranslation();
  return (
    <FadeIn delay={30}>
      <View className="items-center rounded-lg border border-line bg-surface py-8">
        <Text className="text-center text-[13.5px] text-ink-soft">
          {status === "cancelled" ? t("common.thisAppointmentWasCancelled") : t("tutorDashboard.appointmentDetail.thisRequestWasDeclined")}
        </Text>
      </View>
    </FadeIn>
  );
}
