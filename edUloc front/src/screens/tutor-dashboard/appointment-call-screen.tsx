import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CallView } from "@/components/call/call-view";
import { Button } from "@/components/ui/button";
import { useCall } from "@/hooks/use-call";
import { useConversationCanCall } from "@/hooks/use-conversation-can-call";
import { useTutorBooking } from "@/hooks/use-tutor-booking";
import type { Booking } from "@/types/booking";
import { useTranslation } from "react-i18next";

const isCallable = (status: string) => status === "confirmed" || status === "in_progress";

function backRoute(booking: Booking): Href {
  return booking.status === "pending"
    ? (`/tutor-dashboard/requests/${booking.id}` as Href)
    : (`/tutor-dashboard/appointments/${booking.id}` as Href);
}

export function TutorAppointmentCallScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, callId } = useLocalSearchParams<{ id: string; callId?: string }>();
  const { state } = useTutorBooking(id);
  // Le droit d'appeler se juge sur la paire : une autre séance confirmée suffit, même si cette réservation est refusée / en attente.
  const bookingConversationId = state.status === "success" ? state.booking.conversationId : null;
  const pairCanCall = useConversationCanCall(bookingConversationId);
  const callable = state.status === "success" && (isCallable(state.booking.status) || pairCanCall === true);
  const call = useCall({ conversationId: callable ? bookingConversationId : null, callId });

  if (state.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-ink" style={{ paddingTop: insets.top }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View className="flex-1 items-center justify-center bg-ink px-8" style={{ paddingTop: insets.top }}>
        <Text className="text-center text-[14px] text-white">{state.message}</Text>
      </View>
    );
  }

  const { booking } = state;

  // A PENDING/closed booking has no call to join.
  if (!isCallable(booking.status) && pairCanCall === null) {
    return (
      <View className="flex-1 items-center justify-center bg-ink" style={{ paddingTop: insets.top }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!callable && !callId) {
    return (
      <View className="flex-1 items-center justify-center gap-5 bg-ink px-8" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <Text className="text-center text-[15px] text-white">{t("common.callingWillBeAvailableAfter")}</Text>
        <Button label={t("common.back")} variant="secondary" onPress={() => router.replace(backRoute(booking))} />
      </View>
    );
  }

  return (
    <CallView
      initial={booking.beneficiary.firstName.slice(0, 2).toUpperCase()}
      name={booking.beneficiary.firstName}
      call={call}
      onClose={() => router.replace(backRoute(booking))}
    />
  );
}
