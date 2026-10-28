import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { usePartnerReservations } from "@/hooks/use-partner-reservations";
import { useTranslation } from "react-i18next";

/**
 * Séances confirmées dans les salles de la structure. Aucune validation à faire : la réservation est confirmée par le
 * tuteur. On ne voit ni le bénéficiaire ni le demandeur — seulement ce qui sert à accueillir (horaire, effectif, tuteur).
 */
export function PartnerReservationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { roomId } = useLocalSearchParams<{ roomId?: string }>();
  const { state, reload } = usePartnerReservations(roomId);

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      <Text className="px-5 pb-4 text-[24px] font-bold text-ink">{t("common.reservations")}</Text>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        {state.status === "loading" ? (
          <View className="gap-3">
            {[0, 1, 2].map((i) => (
              <View key={i} className="h-[84px] rounded-lg bg-line-soft" />
            ))}
          </View>
        ) : state.status === "error" ? (
          <View className="flex-row items-center gap-3">
            <Text className="flex-1 text-[13.5px] text-error">{state.message}</Text>
            <PressableScale onPress={reload} accessibilityLabel={t("common.tryAgain")}>
              <Text className="text-[13.5px] font-semibold text-primary">{t("common.tryAgain")}</Text>
            </PressableScale>
          </View>
        ) : state.status === "empty" ? (
          <View className="items-center py-10">
            <Text className="text-center text-[14px] leading-[21px] text-ink-soft">
              {t("partnerDashboard.reservations.noConfirmedSessionsYetThey")}</Text>
          </View>
        ) : (
          state.reservations.map((r, index) => (
            <FadeIn key={r.id} delay={30 + index * 30}>
              <View className="mb-3 rounded-lg border border-line bg-surface p-4">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-[15px] font-bold text-ink">{r.roomName}</Text>
                    <Text className="mt-[2px] text-[13px] text-ink-soft">
                      {r.dateLabel} · {r.timeRangeLabel}
                    </Text>
                  </View>
                  <StatusBadge status={r.status} />
                </View>
                <Text className="mt-2 text-[12.5px] text-ink-soft">
                  {t("partnerDashboard.reservations.offerWithTutor", { offerTitle: r.offerTitle, tutorName: r.tutorName })} · {t("common.participantCount", { count: r.participantsCount })}
                </Text>
              </View>
            </FadeIn>
          ))
        )}
      </ScrollView>
    </View>
  );
}
