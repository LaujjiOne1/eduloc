import { type Href, useRouter } from "expo-router";
import { useEffect } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CheckCircleIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { ScaleIn } from "@/components/motion/scale-in";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useBookingWizardStore } from "@/store/booking-wizard.store";
import { useTranslation } from "react-i18next";

const HOME_ROUTE = "/home" as Href;

function bookingDetailRoute(bookingId: string): Href {
  return `/apprenti-dashboard/bookings/${bookingId}` as Href;
}

export function BookingPendingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const offer = useBookingWizardStore((s) => s.offer);
  const slot = useBookingWizardStore((s) => s.slot);
  const createdBookingId = useBookingWizardStore((s) => s.createdBookingId);
  const reset = useBookingWizardStore((s) => s.reset);

  // Guard: this confirmation only makes sense right after a booking was just
  // sent — a direct/stale visit bounces to Home instead of a blank recap.
  useEffect(() => {
    if (!offer || !slot) router.replace(HOME_ROUTE);
  }, [offer, slot, router]);

  if (!offer || !slot) return null;

  const goHome = () => {
    reset();
    router.replace(HOME_ROUTE);
  };

  const goToDetail = () => {
    if (createdBookingId) router.push(bookingDetailRoute(createdBookingId));
  };

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-5 pb-[14px] pt-5">
        <Text className="text-[21px] font-bold text-ink">
          edU<Text className="text-primary">loc</Text>
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 20, alignItems: "center" }}
        showsVerticalScrollIndicator={false}
      >
        <ScaleIn delay={20}>
          <View className="mb-[22px] mt-3 h-[72px] w-[72px] items-center justify-center rounded-full bg-accent-tint">
            <CheckCircleIcon size={34} color="#0E9C82" />
          </View>
        </ScaleIn>

        <FadeIn delay={90}>
          <Text className="mb-[10px] text-center text-[24px] font-bold text-ink">{t("booking.bookingPending.requestSent")}</Text>
        </FadeIn>

        <FadeIn delay={130}>
          <Text className="mb-[22px] text-center text-[14.5px] leading-[21px] text-ink-soft">
            {t("booking.bookingPending.yourRequestHasBeenSent", { value: offer.tutorName.split(" ")[0] })}</Text>
        </FadeIn>

        <FadeIn delay={160}>
          <View className="mb-6">
            <StatusBadge status="pending" />
          </View>
        </FadeIn>

        <FadeIn delay={190}>
          <View className="mb-6 w-full rounded-lg border border-line bg-surface p-4">
            <Text className="text-[15px] font-bold text-ink">{offer.title}</Text>
            <Text className="mt-[3px] text-[13px] text-ink-soft">{t("common.with", { tutorName: offer.tutorName })}</Text>
            <View className="my-3 h-px bg-line-soft" />
            <Text className="text-[13.5px] text-ink-soft">
              {slot.dateLabel} • {slot.timeRangeLabel}
            </Text>
          </View>
        </FadeIn>

        <FadeIn delay={220}>
          <Text className="text-center text-[12.5px] leading-[19px] text-ink-faint">
            {t("booking.bookingPending.requestSentAppointmentConfirmedYou")}</Text>
        </FadeIn>
      </ScrollView>

      <View
        className="border-t border-line-soft bg-surface px-5 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 22) }}
      >
        <View className="gap-[10px]">
          <Button label={t("booking.bookingPending.viewTheRequest")} disabled={!createdBookingId} onPress={goToDetail} />
          <Button label={t("common.backToHome")} variant="ghost" onPress={goHome} />
        </View>
      </View>
    </View>
  );
}
