import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MicIcon, VideoIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { Button } from "@/components/ui/button";
import { formatDuration, useElapsedSeconds } from "@/hooks/use-elapsed-seconds";
import { useMyBooking } from "@/hooks/use-my-booking";
import { useTranslation } from "react-i18next";

function bookingRoute(id: string): Href {
  return `/apprenti-dashboard/bookings/${id}` as Href;
}
function otpRoute(id: string): Href {
  return `/apprenti-dashboard/bookings/${id}/otp` as Href;
}
function completedRoute(id: string): Href {
  return `/apprenti-dashboard/bookings/${id}/session/completed` as Href;
}

export function SessionInProgressScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useMyBooking(id);
  const [muted, setMuted] = useState(false);
  const [videoOn, setVideoOn] = useState(true);

  useEffect(() => {
    if (state.status !== "success") return;
    if (state.booking.status === "confirmed") router.replace(otpRoute(state.booking.id));
    else if (state.booking.status === "completed") router.replace(completedRoute(state.booking.id));
  }, [state, router]);

  const sessionStartedAt = state.status === "success" ? state.booking.sessionStartedAt : undefined;
  const seconds = useElapsedSeconds(sessionStartedAt);

  // Terminer la séance est réservé au TUTEUR (D-08) : le demandeur attend. L'écran bascule tout seul sur
  // « séance terminée » via l'événement temps réel « session.completed » (useMyBooking).
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
        {id ? <Button label={t("common.back")} variant="secondary" onPress={() => router.replace(bookingRoute(id))} /> : null}
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

      <View className="items-center px-5">
        <Text className="text-center text-[13px] text-white/60">
          {t("apprentiDashboard.sessionInProgress.waitingForToEndThe", { value: booking.offer.tutorName.split(" ")[0] })}</Text>
      </View>
    </View>
  );
}
