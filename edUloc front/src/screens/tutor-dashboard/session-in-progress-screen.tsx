import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MicIcon, VideoIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { formatDuration, useElapsedSeconds } from "@/hooks/use-elapsed-seconds";
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

export function TutorSessionInProgressScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useTutorBooking(id);
  const { state: actionState, complete } = useTutorSessionAction();
  const isCompleting = actionState.status === "completing";
  const [muted, setMuted] = useState(false);
  const [videoOn, setVideoOn] = useState(true);

  useEffect(() => {
    if (state.status !== "success") return;
    if (state.booking.status === "confirmed") router.replace(startSessionRoute(state.booking.id));
    else if (state.booking.status === "completed") router.replace(completedRoute(state.booking.id));
  }, [state, router]);

  const sessionStartedAt = state.status === "success" ? state.booking.sessionStartedAt : undefined;
  const seconds = useElapsedSeconds(sessionStartedAt);

  const handleComplete = async (bookingId: string) => {
    const booking = await complete(bookingId);
    if (booking) router.replace(completedRoute(bookingId));
  };

  if (state.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-ink" style={{ paddingTop: insets.top }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (state.status === "error" || state.booking.status !== "in_progress") {
    const message = state.status === "error" ? state.message : t("common.thisSessionIsNotIn");
    return (
      <View className="flex-1 items-center justify-center gap-5 bg-ink px-8" style={{ paddingTop: insets.top }}>
        <Text className="text-center text-[14px] text-white">{message}</Text>
        {id ? <Button label={t("common.back")} variant="secondary" onPress={() => router.replace(appointmentRoute(id))} /> : null}
      </View>
    );
  }

  const { booking } = state;

  return (
    <View className="flex-1 bg-ink" style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 20) }}>
      <View className="flex-1 items-center justify-center">
        <Text className="text-[13px] font-semibold text-white/35">{t("common.liveVideo")}</Text>
      </View>

      <View className="items-center px-5 py-4">
        <Text className="text-[14px] font-bold text-white">
          {booking.offer.subjectLabel} — {formatDuration(seconds)}
        </Text>
      </View>

      <View className="flex-row justify-center gap-4 px-6 pb-5">
        <PressableScale onPress={() => setMuted((m) => !m)} accessibilityLabel={muted ? t("common.unmuteMicrophone") : t("common.muteMicrophone")}>
          <View className={["h-[50px] w-[50px] items-center justify-center rounded-full", muted ? "bg-error" : "bg-white/12"].join(" ")}>
            <MicIcon size={20} color="#fff" />
          </View>
        </PressableScale>
        <PressableScale onPress={() => setVideoOn((v) => !v)} accessibilityLabel={videoOn ? t("common.turnCameraOff") : t("common.turnCameraOn")}>
          <View className={["h-[50px] w-[50px] items-center justify-center rounded-full", videoOn ? "bg-primary" : "bg-white/12"].join(" ")}>
            <VideoIcon size={20} color="#fff" />
          </View>
        </PressableScale>
      </View>

      <View className="px-5">
        {actionState.status === "error" ? <FormError message={actionState.message} /> : null}
        <Button
          label={t("tutorDashboard.sessionInProgress.endTheSession")}
          disabled={isCompleting}
          loading={isCompleting}
          loadingLabel={t("common.endingTheSession")}
          onPress={() => handleComplete(booking.id)}
          className="bg-error"
        />
      </View>
    </View>
  );
}
