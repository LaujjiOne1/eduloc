import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { useTutorBooking } from "@/hooks/use-tutor-booking";
import { useTutorSessionAction } from "@/hooks/use-tutor-session-action";
import type { Booking } from "@/types/booking";
import { useTranslation } from "react-i18next";

const CODE_LENGTH = 6;

function appointmentRoute(id: string): Href {
  return `/tutor-dashboard/appointments/${id}` as Href;
}
function sessionRoute(booking: Booking): Href {
  return booking.sessionMode === "in_person"
    ? (`/tutor-dashboard/appointments/${booking.id}/session/presential` as Href)
    : (`/tutor-dashboard/appointments/${booking.id}/session` as Href);
}
function completedRoute(id: string): Href {
  return `/tutor-dashboard/appointments/${id}/session/completed` as Href;
}

export function StartSessionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state: bookingState } = useTutorBooking(id);
  const { state: actionState, start } = useTutorSessionAction();
  const [code, setCode] = useState("");
  const isBusy = actionState.status === "starting";

  // A session already underway or finished has no more use for the code entry.
  useEffect(() => {
    if (bookingState.status !== "success") return;
    if (bookingState.booking.status === "in_progress") router.replace(sessionRoute(bookingState.booking));
    else if (bookingState.booking.status === "completed") router.replace(completedRoute(bookingState.booking.id));
  }, [bookingState, router]);

  const handleValidate = async (bookingId: string) => {
    const booking = await start(bookingId, code);
    if (booking) router.replace(sessionRoute(booking));
  };

  if (bookingState.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-paper" style={{ paddingTop: insets.top }}>
        <ActivityIndicator color="#332E86" />
      </View>
    );
  }

  if (bookingState.status === "error" || bookingState.booking.status !== "confirmed") {
    const message =
      bookingState.status === "error" ? bookingState.message : t("tutorDashboard.startSession.thisSessionCanOnlyStart");
    return (
      <View className="flex-1 items-center justify-center gap-5 bg-paper px-8" style={{ paddingTop: insets.top }}>
        <Text className="text-center text-[14px] text-ink-soft">{message}</Text>
        {id ? <Button label={t("common.backToTheAppointment")} onPress={() => router.replace(appointmentRoute(id))} /> : null}
      </View>
    );
  }

  const { booking } = bookingState;

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />

      <View className="flex-1 items-center px-6 pt-5">
        <Text className="mb-[6px] text-[21px] font-bold text-ink">{t("tutorDashboard.startSession.lesson", { subjectLabel: booking.offer.subjectLabel })}</Text>
        <Text className="mb-6 text-[14px] text-ink-soft">
          {booking.beneficiary.firstName} • {booking.slot.dateLabel} • {booking.slot.startTime}
        </Text>
        <Text className="mb-4 text-center text-[14px] leading-[21px] text-ink-soft">
          {booking.teachingMode === "online"
            ? t("tutorDashboard.startSession.theBeneficiarySendsYouTheir")
            : t("tutorDashboard.startSession.theBeneficiaryTellsYouTheir")}
        </Text>

        {actionState.status === "error" ? <FormError message={actionState.message} /> : null}

        <OtpInput value={code} onChange={setCode} length={CODE_LENGTH} editable={!isBusy} />

      </View>

      <View className="border-t border-line-soft bg-surface px-5 pt-4" style={{ paddingBottom: Math.max(insets.bottom, 22) }}>
        <Button
          label={t("common.startTheSession")}
          disabled={code.length !== CODE_LENGTH || isBusy}
          loading={isBusy}
          loadingLabel={t("tutorDashboard.startSession.starting")}
          onPress={() => handleValidate(booking.id)}
        />
      </View>
    </View>
  );
}

type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
  length: number;
  editable: boolean;
};

/** 6 auto-advancing single-digit boxes — the code the beneficiary reads out loud. */
function OtpInput({ value, onChange, length, editable }: OtpInputProps) {
  const { t } = useTranslation();
  const inputs = useRef<(TextInput | null)[]>([]);

  const handleChangeDigit = (index: number, text: string) => {
    const digit = text.replace(/\D/g, "").slice(-1);
    const next = value.split("");
    next[index] = digit;
    onChange(next.join("").slice(0, length));
    if (digit && index < length - 1) inputs.current[index + 1]?.focus();
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === "Backspace" && !value[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  return (
    <View className="flex-row justify-center gap-2">
      {Array.from({ length }, (_, i) => (
        <TextInput
          key={i}
          ref={(ref) => {
            inputs.current[i] = ref;
          }}
          value={value[i] ?? ""}
          onChangeText={(text) => handleChangeDigit(i, text)}
          onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
          keyboardType="number-pad"
          maxLength={1}
          editable={editable}
          className="h-12 w-[38px] rounded-sm border border-line bg-surface text-center text-[18px] font-bold text-ink"
          accessibilityLabel={t("tutorDashboard.startSession.digitOfTheCode", { value: i + 1 })}
        />
      ))}
    </View>
  );
}
