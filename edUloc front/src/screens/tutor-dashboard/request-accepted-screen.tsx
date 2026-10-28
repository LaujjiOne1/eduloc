import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CheckCircleIcon } from "@/components/icons";
import { ScaleIn } from "@/components/motion/scale-in";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useTutorBooking } from "@/hooks/use-tutor-booking";
import { useTranslation } from "react-i18next";

const APPOINTMENTS_ROUTE = "/tutor-dashboard/appointments" as Href;

export function RequestAcceptedScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useTutorBooking(id);

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-5 pb-[14px] pt-5">
        <Text className="text-[21px] font-bold text-ink">
          Edu<Text className="text-primary">Loc</Text>
        </Text>
      </View>

      {state.status === "loading" ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#332E86" />
        </View>
      ) : state.status === "error" ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-[14px] text-error">{state.message}</Text>
        </View>
      ) : (
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

          <Text className="mb-[10px] text-center text-[22px] font-bold text-ink">{t("tutorDashboard.requestAccepted.requestAccepted")}</Text>
          <Text className="mb-[22px] text-center text-[14.5px] leading-[21px] text-ink-soft">
            {t("tutorDashboard.requestAccepted.theAppointmentWithIsNow", { firstName: state.booking.beneficiary.firstName })}</Text>
          <View className="mb-6">
            <StatusBadge status="confirmed" />
          </View>
        </ScrollView>
      )}

      <View className="border-t border-line-soft bg-surface px-5 pt-4" style={{ paddingBottom: Math.max(insets.bottom, 22) }}>
        <Button label={t("common.viewMyAppointments")} onPress={() => router.replace(APPOINTMENTS_ROUTE)} />
      </View>
    </View>
  );
}
