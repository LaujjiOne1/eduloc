import { type Href, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";

import { GraduationCapIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { ScaleIn } from "@/components/motion/scale-in";
import { useTranslation } from "react-i18next";

// Cast to Href: expo-router's typed-routes union is only regenerated when the
// dev server runs, so a freshly added route (e.g. /home) isn't in it yet.
const HOME_ROUTE = "/home" as Href;

export function SplashScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View className="flex-1 bg-primary items-center justify-center">
      <StatusBar style="light" />
      <PressableScale
        onPress={() => router.push(HOME_ROUTE)}
        accessibilityLabel={t("screens.splash.continueToTheEdulocHome")}
        style={{ flex: 1 }}
      >
        <View className="flex-1 items-center justify-center gap-[18px] px-10">
          <ScaleIn delay={80}>
            <View className="h-25 w-24 items-center justify-center rounded-[18px] bg-white/[0.14]">
              <GraduationCapIcon/>
            </View>
          </ScaleIn>

          <FadeIn delay={220}>
            <Text className="text-center text-[54px] font-bold text-white">edUloc</Text>
          </FadeIn>

          <FadeIn delay={340}>
            <Text className="max-w-[260px] text-center text-[15.5px] leading-[21px] text-white/70">
              {t("screens.splash.theRightSupportInThe")}</Text>
          </FadeIn>
        </View>
      </PressableScale>
    </View>
  );
}
