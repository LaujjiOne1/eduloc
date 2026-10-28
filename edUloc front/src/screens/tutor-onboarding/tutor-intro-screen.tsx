import { type Href, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CheckIcon, TeachIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "react-i18next";

const TUTOR_IDENTITY_ROUTE = "/tutor-identity" as Href;
const LOGIN_ROUTE = "/login" as Href;


export function TutorIntroScreen() {
  const { t } = useTranslation();
  const HIGHLIGHTS = [t("tutorOnboarding.tutorIntro.highlightProfile"), t("tutorOnboarding.tutorIntro.highlightOffers"), t("tutorOnboarding.tutorIntro.highlightVerification")];
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Filling out the whole 9-step wizard only to hit a 401 on submit is a bad
  // surprise (the API requires a signed-in account to create a tutor
  // application) — gate right here, before any time is invested, mirroring
  // book-date-screen.tsx's reserve() pattern.
  const handleStart = () => {
    if (useAuthStore.getState().user === null) {
      useAuthStore.getState().setReturnTo(TUTOR_IDENTITY_ROUTE);
      router.push(LOGIN_ROUTE);
      return;
    }
    router.push(TUTOR_IDENTITY_ROUTE);
  };

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <View className="flex-1 justify-center gap-[22px] px-8">
        <FadeIn delay={30}>
          <View className="h-[60px] w-[60px] items-center justify-center rounded-[18px] bg-primary-tint">
            <TeachIcon size={28} color="#332E86" />
          </View>
        </FadeIn>

        <FadeIn delay={80}>
          <Text className="mb-3 text-[29px] font-bold leading-[35px] text-ink">
            {t("tutorOnboarding.tutorIntro.becomeATutorOnEduloc")}</Text>
          <Text className="text-[15px] leading-[21px] text-ink-soft">
            {t("tutorOnboarding.tutorIntro.shareYourSkillsWithPeople")}</Text>
          <Text className="mt-3 text-[13px] leading-[19px] text-ink-soft">
            {t("tutorOnboarding.tutorIntro.signInOrCreateAn")}</Text>
        </FadeIn>

        <FadeIn delay={140}>
          <View className="mt-[6px] gap-3">
            {HIGHLIGHTS.map((label) => (
              <View key={label} className="flex-row items-center gap-3">
                <CheckIcon size={18} color="#0E9C82" />
                <Text className="text-[13.5px] font-semibold text-ink">{label}</Text>
              </View>
            ))}
          </View>
        </FadeIn>
      </View>

      <View
        className="border-t border-line-soft bg-surface px-5 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 22) }}
      >
        <Button label={t("tutorOnboarding.tutorIntro.getStarted")} onPress={handleStart} />
      </View>
    </View>
  );
}
