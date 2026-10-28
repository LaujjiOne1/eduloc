import { type Href, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GraduationCapIcon, HouseIcon, TeachIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { type UserMode, useAuthStore } from "@/store/auth.store";
import { useTranslation } from "react-i18next";

const APPRENTI_DASHBOARD_ROUTE = "/apprenti-dashboard" as Href;
const TUTOR_DASHBOARD_ROUTE = "/tutor-dashboard" as Href;
const PARTNER_DASHBOARD_ROUTE = "/partner-dashboard" as Href;

export function ModeChoiceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setActiveMode = useAuthStore((s) => s.setActiveMode);
  const firstName = useAuthStore((s) => s.user?.firstName);

  const choose = (mode: UserMode) => {
    setActiveMode(mode);
    router.push(mode === "apprenti" ? APPRENTI_DASHBOARD_ROUTE : TUTOR_DASHBOARD_ROUTE);
  };

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <View className="flex-1 justify-center gap-[22px] px-6">
        <FadeIn delay={20}>
          <View className="mb-[6px] items-center">
            <Text className="mb-2 text-[24px] font-bold text-ink">{t("common.hello", { value: firstName ? ` ${firstName}` : "" })}</Text>
            <Text className="text-center text-[14.5px] text-ink-soft">
              {t("screens.modeChoice.howWouldYouLikeTo")}</Text>
          </View>
        </FadeIn>

        <FadeIn delay={80}>
          <PressableScale onPress={() => choose("apprenti")} accessibilityLabel={t("screens.modeChoice.learnerModeFindATutor")}>
            <View className="flex-row items-center gap-[14px] rounded-lg border border-line bg-surface p-4">
              <View className="h-[46px] w-[46px] items-center justify-center rounded-md bg-primary-tint">
                <GraduationCapIcon size={22} color="#332E86" />
              </View>
              <View>
                <Text className="text-[15.5px] font-bold text-ink">{t("screens.modeChoice.learnerMode")}</Text>
                <Text className="text-[12.5px] text-ink-soft">{t("common.findATutor2")}</Text>
              </View>
            </View>
          </PressableScale>
        </FadeIn>

        <FadeIn delay={130}>
          <PressableScale onPress={() => choose("tutor")} accessibilityLabel={t("screens.modeChoice.tutorModeOfferMyLessons")}>
            <View className="flex-row items-center gap-[14px] rounded-lg border border-line bg-surface p-4">
              <View className="h-[46px] w-[46px] items-center justify-center rounded-md bg-violet-tint">
                <TeachIcon size={22} color="#8D7FE3" />
              </View>
              <View>
                <Text className="text-[15.5px] font-bold text-ink">{t("common.tutorMode")}</Text>
                <Text className="text-[12.5px] text-ink-soft">{t("screens.modeChoice.offerMyLessons")}</Text>
              </View>
            </View>
          </PressableScale>
        </FadeIn>

        <FadeIn delay={180}>
          {/* Espace Gestionnaire : ni apprenti ni tuteur, il n'agit pas sur le mode actif. */}
          <PressableScale onPress={() => router.push(PARTNER_DASHBOARD_ROUTE)} accessibilityLabel={t("screens.modeChoice.partnerVenueOfferMyRooms")}>
            <View className="flex-row items-center gap-[14px] rounded-lg border border-line bg-surface p-4">
              <View className="h-[46px] w-[46px] items-center justify-center rounded-md bg-accent-tint">
                <HouseIcon size={22} color="#0E9C82" />
              </View>
              <View className="flex-1">
                <Text className="text-[15.5px] font-bold text-ink">{t("screens.modeChoice.partnerVenue")}</Text>
                <Text className="text-[12.5px] text-ink-soft">{t("screens.modeChoice.offerMyStudyRooms")}</Text>
              </View>
            </View>
          </PressableScale>
        </FadeIn>
      </View>
    </View>
  );
}
