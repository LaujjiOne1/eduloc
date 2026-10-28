import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LockIcon } from "@/components/icons";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { useMyBooking } from "@/hooks/use-my-booking";
import { useSessionCode } from "@/hooks/use-session-code";
import { useShareSessionCode } from "@/hooks/use-share-session-code";
import { useTranslation } from "react-i18next";

function bookingRoute(id: string): Href {
  return `/apprenti-dashboard/bookings/${id}` as Href;
}
function sessionRoute(id: string): Href {
  return `/apprenti-dashboard/bookings/${id}/session` as Href;
}

export function SessionOtpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state: bookingState } = useMyBooking(id);
  const { state: codeState } = useSessionCode(bookingState.status === "success" ? bookingState.booking.id : undefined);
  const { state: shareState, share } = useShareSessionCode(bookingState.status === "success" ? bookingState.booking.id : undefined);

  // Une séance déjà en cours n'a plus besoin de cet écran. Le tuteur démarre la séance depuis SON appli avec ce code :
  // useMyBooking suit l'événement temps réel « session.started » et on bascule ici sans action de l'utilisateur.
  useEffect(() => {
    if (bookingState.status === "success" && bookingState.booking.status === "in_progress") {
      router.replace(sessionRoute(bookingState.booking.id));
    }
  }, [bookingState, router]);

  if (bookingState.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-paper" style={{ paddingTop: insets.top }}>
        <ActivityIndicator color="#332E86" />
      </View>
    );
  }

  if (bookingState.status === "error" || bookingState.booking.status !== "confirmed") {
    const message =
      bookingState.status === "error"
        ? bookingState.message
        : t("apprentiDashboard.sessionOtp.theSessionCodeIsOnly");
    return (
      <View className="flex-1 items-center justify-center gap-5 bg-paper px-8" style={{ paddingTop: insets.top }}>
        <Text className="text-center text-[14px] text-ink-soft">{message}</Text>
        {id ? <Button label={t("common.backToTheAppointment")} onPress={() => router.replace(bookingRoute(id))} /> : null}
      </View>
    );
  }

  const { booking } = bookingState;

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />

      <View className="flex-1 items-center px-6 pt-5">
        <View className="mb-[18px] h-16 w-16 items-center justify-center rounded-full bg-primary-tint">
          <LockIcon size={28} color="#332E86" />
        </View>
        <Text className="mb-2 text-[22px] font-bold text-ink">{t("common.sessionCode")}</Text>
        <Text className="mb-[22px] text-center text-[14px] leading-[21px] text-ink-soft">
          {t("apprentiDashboard.sessionOtp.giveThisCodeToWhen", { value: booking.offer.tutorName.split(" ")[0], subjectLabel: booking.offer.subjectLabel })}</Text>

        <View className="w-full items-center rounded-lg border border-primary-tint bg-primary-tint p-[22px]">
          {codeState.status === "loading" ? (
            <View className="h-9 w-[160px] rounded bg-white/60" />
          ) : codeState.status === "error" ? (
            <FormError message={codeState.message} />
          ) : (
            <Text className="text-[34px] font-bold tracking-[0.12em] text-primary-dark">{codeState.code}</Text>
          )}
        </View>

        {booking.teachingMode === "online" ? (
          <View className="mt-4 w-full">
            <Text className="mb-3 text-center text-[13px] leading-[19px] text-ink-soft">
              {t("apprentiDashboard.sessionOtp.onlineLessonYouCanSend")}</Text>
            {shareState.status === "error" ? (
              <View className="mb-3">
                <FormError message={shareState.message} />
              </View>
            ) : null}
            {shareState.status === "sent" ? (
              <Text className="mb-3 text-center text-[13px] font-semibold text-accent">{t("apprentiDashboard.sessionOtp.codeSentToTheTutor")}</Text>
            ) : null}
            <Button
              label={shareState.status === "sent" ? t("common.resendTheCode") : t("apprentiDashboard.sessionOtp.sendTheCodeToThe")}
              variant="secondary"
              loading={shareState.status === "sending"}
              loadingLabel={t("common.sending")}
              disabled={codeState.status !== "success" || shareState.status === "sending"}
              onPress={share}
            />
          </View>
        ) : null}

        <Text className="mt-[18px] text-center text-[12.5px] text-ink-faint">
          {t("apprentiDashboard.sessionOtp.thisScreenUpdatesByItself")}</Text>
      </View>

      <View className="border-t border-line-soft bg-surface px-5 pt-4" style={{ paddingBottom: Math.max(insets.bottom, 22) }}>
        <Button label={t("common.backToTheAppointment")} onPress={() => router.replace(bookingRoute(booking.id))} />
      </View>
    </View>
  );
}
