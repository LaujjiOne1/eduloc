import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TeachIcon } from "@/components/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { useTutorBooking } from "@/hooks/use-tutor-booking";
import { useTutorSessionAction } from "@/hooks/use-tutor-session-action";
import { useTranslation } from "react-i18next";

function appointmentRoute(id: string): Href {
  return `/tutor-dashboard/appointments/${id}` as Href;
}
function startSessionRoute(id: string): Href {
  return `/tutor-dashboard/appointments/${id}/start-session` as Href;
}
function completedRoute(id: string): Href {
  return `/tutor-dashboard/appointments/${id}/session/completed` as Href;
}

export function SessionInProgressPresentialScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useTutorBooking(id);
  const { state: actionState, complete } = useTutorSessionAction();
  const isCompleting = actionState.status === "completing";

  // Reaching this screen without the session actually started (e.g. a direct
  // link) sends the tutor back through 64_TutorStartSession, which offers
  // this same "en présentiel" shortcut — no state is invented here.
  useEffect(() => {
    if (state.status !== "success") return;
    if (state.booking.status === "confirmed") router.replace(startSessionRoute(state.booking.id));
    else if (state.booking.status === "completed") router.replace(completedRoute(state.booking.id));
  }, [state, router]);

  const handleComplete = async (bookingId: string) => {
    const booking = await complete(bookingId);
    if (booking) router.replace(completedRoute(bookingId));
  };

  if (state.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-paper" style={{ paddingTop: insets.top }}>
        <ActivityIndicator color="#332E86" />
      </View>
    );
  }

  if (state.status === "error" || state.booking.status !== "in_progress") {
    const message = state.status === "error" ? state.message : t("common.thisSessionIsNotIn");
    return (
      <View className="flex-1 items-center justify-center gap-5 bg-paper px-8" style={{ paddingTop: insets.top }}>
        <Text className="text-center text-[14px] text-ink-soft">{message}</Text>
        {id ? <Button label={t("common.back")} variant="secondary" onPress={() => router.replace(appointmentRoute(id))} /> : null}
      </View>
    );
  }

  const { booking } = state;

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-5 pb-[14px] pt-5">
        <Text className="text-[21px] font-bold text-ink">
          Edu<Text className="text-primary">Loc</Text>
        </Text>
      </View>

      <View className="flex-1 items-center px-6 pt-6">
        <View className="mb-5 h-16 w-16 items-center justify-center rounded-full bg-primary-tint">
          <TeachIcon size={28} color="#332E86" />
        </View>
        <Text className="mb-[6px] text-[20px] font-bold text-ink">{t("tutorDashboard.sessionInProgressPresential.inPersonLesson")}</Text>
        <Text className="mb-1 text-[14px] text-ink-soft">{booking.offer.subjectLabel}</Text>
        <Text className="mb-5 text-[13px] text-ink-faint">{booking.beneficiary.firstName}</Text>
        <View className="mb-2">
          <StatusBadge status="in_progress" />
        </View>
        <Text className="mt-[10px] text-[13px] text-ink-soft">{t("tutorDashboard.sessionInProgressPresential.since", { startTime: booking.slot.startTime })}</Text>
      </View>

      <View className="border-t border-line-soft bg-surface px-5 pt-4" style={{ paddingBottom: Math.max(insets.bottom, 22) }}>
        {actionState.status === "error" ? <FormError message={actionState.message} /> : null}
        <Button
          label={t("tutorDashboard.sessionInProgressPresential.end")}
          disabled={isCompleting}
          loading={isCompleting}
          loadingLabel={t("common.endingTheSession")}
          onPress={() => handleComplete(booking.id)}
        />
      </View>
    </View>
  );
}
