import { type Href, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ChevronRightIcon,
  LevelIcon,
  LocationIcon,
  SearchIcon,
  SubjectIcon,
  TeachIcon,
} from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { Button } from "@/components/ui/button";
import { Chip, ChipSkeleton } from "@/components/ui/chip";
import { usePopularCategories } from "@/hooks/use-popular-categories";
import { isApprovedTutor } from "@/lib/auth-routing";
import { useAuthStore } from "@/store/auth.store";
import { useSearchWizardStore } from "@/store/search-wizard.store";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/ui/language-selector";

// Casting to Href keeps navigation wired per the reference workflow without
// waiting on expo-router's typed route generation, which only tracks routes
// that already exist under app/ as of the last dev-server run.
// /search resolves to the Need → Level → ForWhom → Location → Objective
// wizard (src/app/search/**). /tutor-intro resolves to the "devenir tuteur"
// onboarding wizard (src/app/tutor-*.tsx, src/screens/tutor-onboarding/**).
const SEARCH_ROUTE = "/search" as Href;
const TUTOR_INTRO_ROUTE = "/tutor-intro" as Href;
const LOGIN_ROUTE = "/login" as Href;
const SIGNUP_ROUTE = "/signup" as Href;
// 37_ModeChoice : un tuteur approuvé choisit son espace ; tout autre compte connecté va à l'espace demandeur.
const MODE_CHOICE_ROUTE = "/mode-choice" as Href;
const APPRENTI_DASHBOARD_ROUTE = "/apprenti-dashboard" as Href;

export function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state: popularCategories, retry } = usePopularCategories();
  const resetSearchWizard = useSearchWizardStore((s) => s.reset);
  const user = useAuthStore((s) => s.user);

  const goToSearch = () => {
    resetSearchWizard();
    router.push(SEARCH_ROUTE);
  };
  const goToTutorIntro = () => router.push(TUTOR_INTRO_ROUTE);
  const goToLogin = () => router.push(LOGIN_ROUTE);
  const goToSignup = () => router.push(SIGNUP_ROUTE);
  const goToMySpace = () => router.push(isApprovedTutor(user) ? MODE_CHOICE_ROUTE : APPRENTI_DASHBOARD_ROUTE);

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-5 pb-[14px] pt-5">
        <Text className="text-[21px] font-bold text-ink ">
          edU<Text className="text-primary">loc</Text>
        </Text>
        <LanguageSelector />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={40}>
          <View className="my-[10px] mb-[26px]">
            <Text className="text-[32px] font-bold leading-[37px] text-ink">
              {t("screens.home.findSupportThatFitsYour")}</Text>
          </View>
        </FadeIn>

        <FadeIn delay={110}>
          <PressableScale onPress={goToSearch} accessibilityLabel={t("common.whatAreYouLookingFor")}>
            <View className="rounded-lg border border-primary bg-surface p-4">
              <View className="flex-row items-center gap-[10px]">
                <SearchIcon size={18} color="#9799AF" />
                <Text className="text-[15px] text-ink-faint">{t("common.whatAreYouLookingFor")}</Text>
              </View>
              <View className="my-[14px] h-px bg-line-soft" />
              <View className="gap-3">
                <View className="flex-row items-center gap-[10px]">
                  <SubjectIcon />
                  <Text className="text-[14.5px] text-ink-soft">{t("common.subject")}</Text>
                </View>
                <View className="flex-row items-center gap-[10px]">
                  <LevelIcon />
                  <Text className="text-[14.5px] text-ink-soft">{t("common.level")}</Text>
                </View>
                <View className="flex-row items-center gap-[10px]">
                  <LocationIcon />
                  <Text className="text-[14.5px] text-ink-soft">{t("screens.home.location")}</Text>
                </View>
              </View>
            </View>
          </PressableScale>
        </FadeIn>

        <FadeIn delay={170}>
          <View className="mt-4">
            <Button
              label={t("screens.home.search")}
              onPress={goToSearch}
              icon={<SearchIcon size={17} color="#fff" />}
              fullWidth
            />
          </View>
        </FadeIn>

        <FadeIn delay={230}>
          <View className="mt-8">
            <Text className="mb-3 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
              {t("screens.home.popularSearches")}</Text>
            <PopularCategories state={popularCategories} onRetry={retry} />
          </View>
        </FadeIn>

        <FadeIn delay={300}>
          <PressableScale onPress={goToTutorIntro} accessibilityLabel={t("screens.home.doYouTeachBecomeA")}>
            <View className="mt-7 rounded-lg border border-primary-tint bg-primary-tint p-4">
              <View className="flex-row items-center gap-3">
                <View className="h-10 w-10 items-center justify-center rounded-md bg-white">
                  <TeachIcon color="#332E86" />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-bold text-ink">{t("screens.home.doYouTeach")}</Text>
                  <Text className="text-[13px] text-ink-soft">{t("screens.home.becomeAVerifiedTutorOn")}</Text>
                </View>
                <ChevronRightIcon />
              </View>
            </View>
          </PressableScale>
        </FadeIn>

      </ScrollView>

      <View
        className="flex-row gap-[10px] border-t border-line-soft px-15 pt-[14px] items-center justify-center "
        style={{ paddingBottom: Math.max(insets.bottom, 20) }}
      >
        {user ? (
          <Button label={t("screens.home.mySpace", { firstName: user.firstName })} variant="animated" animatedGlow onPress={goToMySpace} className="w-65" />
        ) : (
          <>
            <Button label={t("common.signIn")} variant="ghost" onPress={goToLogin} className="w-65" />
            <Button label={t("common.createAnAccount")} variant="animated" animatedGlow onPress={goToSignup} className="w-65" />
          </>
        )}
      </View>
    </View>
  );
}

type PopularCategoriesProps = {
  state: ReturnType<typeof usePopularCategories>["state"];
  onRetry: () => void;
};

function PopularCategories({ state, onRetry }: PopularCategoriesProps) {
  const { t } = useTranslation();
  if (state.status === "loading") {
    return (
      <View className="flex-row flex-wrap gap-2">
        <ChipSkeleton width={128} />
        <ChipSkeleton width={110} />
        <ChipSkeleton width={90} />
        <ChipSkeleton width={100} />
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View className="flex-row items-center gap-3">
        <Text className="flex-1 text-[13.5px] text-error">{state.message}</Text>
        <PressableScale onPress={onRetry} accessibilityLabel={t("screens.home.tryLoadingThePopularSearches")}>
          <Text className="text-[13.5px] font-semibold text-primary">{t("common.tryAgain")}</Text>
        </PressableScale>
      </View>
    );
  }

  if (state.status === "empty") {
    return <Text className="text-[13.5px] text-ink-faint">{t("screens.home.noPopularSearchesAtThe")}</Text>;
  }

  return (
    <View className="flex-row flex-wrap gap-2">
      {state.categories.map((category) => (
        <Chip key={category.id} label={category.label} />
      ))}
    </View>
  );
}
