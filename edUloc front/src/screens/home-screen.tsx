import { type Href, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ChevronRightIcon,
  GraduationCapIcon,
  HouseIcon,
  LevelIcon,
  MessageSquareIcon,
  SearchIcon,
  TeachIcon,
  VerifiedBadgeIcon,
  VideoIcon,
} from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { SailHeader, useRevealStyle, useSail } from "@/components/motion/sail-header";
import { Button } from "@/components/ui/button";
import { Chip, ChipSkeleton } from "@/components/ui/chip";
import { LanguageSelector } from "@/components/ui/language-selector";
import { usePopularCategories } from "@/hooks/use-popular-categories";
import { isApprovedTutor } from "@/lib/auth-routing";
import { useAuthStore } from "@/store/auth.store";
import { useSearchWizardStore } from "@/store/search-wizard.store";
import { useTranslation } from "react-i18next";

// Casting to Href keeps navigation wired per the reference workflow without
// waiting on expo-router's typed route generation, which only tracks routes
// that already exist under app/ as of the last dev-server run.
const SEARCH_ROUTE = "/search" as Href;
const SEARCH_SCHOOL_ROUTE = "/search?cycle=scolaire" as Href;
const SEARCH_UNIVERSITY_ROUTE = "/search?cycle=universitaire" as Href;
const TUTOR_INTRO_ROUTE = "/tutor-intro" as Href;
const LOGIN_ROUTE = "/login" as Href;
const SIGNUP_ROUTE = "/signup" as Href;
// 37_ModeChoice : un tuteur approuvé choisit son espace ; tout autre compte connecté va à l'espace demandeur.
const MODE_CHOICE_ROUTE = "/mode-choice" as Href;
const APPRENTI_DASHBOARD_ROUTE = "/apprenti-dashboard" as Href;

/** Hauteur du bandeau de marque une fois la voile élevée (sans la zone sûre du haut). */
const BAND_HEIGHT = 128;
/** Place réservée en bas du défilement pour la barre flottante (connexion / inscription). */
const FLOATING_BAR_SPACE = 92;

type HomeScreenProps = {
  /** Premier affichage de l'application : la marque occupe l'écran puis s'élève comme une voile. */
  intro?: boolean;
};

export function HomeScreen({ intro = false }: HomeScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state: popularCategories, retry } = usePopularCategories();
  const resetSearchWizard = useSearchWizardStore((s) => s.reset);
  const user = useAuthStore((s) => s.user);

  const sail = useSail({ intro });
  const barStyle = useRevealStyle(sail.progress, 60);
  // Le contenu se révèle pendant que la voile s'élève, au lieu de s'animer caché derrière elle.
  const contentStyle = useRevealStyle(sail.progress, 24, 0.25);
  const bandHeight = insets.top + BAND_HEIGHT;

  const open = (route: Href) => {
    resetSearchWizard();
    router.push(route);
  };
  const goToTutorIntro = () => router.push(TUTOR_INTRO_ROUTE);
  const goToLogin = () => router.push(LOGIN_ROUTE);
  const goToSignup = () => router.push(SIGNUP_ROUTE);
  const goToMySpace = () => router.push(isApprovedTutor(user) ? MODE_CHOICE_ROUTE : APPRENTI_DASHBOARD_ROUTE);

  return (
    <View className="flex-1 bg-paper">
      <StatusBar style="light" />

      <Animated.View style={[{ flex: 1 }, contentStyle]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: bandHeight + 22,
          paddingBottom: FLOATING_BAR_SPACE + Math.max(insets.bottom, 12),
        }}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={40}>
          <Text className="mb-[22px] text-[30px] font-bold leading-[35px] text-ink">{t("screens.home.findSupportThatFitsYour")}</Text>
        </FadeIn>

        <FadeIn delay={100}>
          <PressableScale onPress={() => open(SEARCH_ROUTE)} accessibilityLabel={t("common.whatAreYouLookingFor")}>
            <View
              className="flex-row items-center gap-3 rounded-full border border-line bg-surface px-5 py-4"
              style={{ shadowColor: "#14162B", shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 3 }}
            >
              <SearchIcon size={18} color="#14162B" />
              <View className="flex-1">
                <Text className="text-[15px] font-bold text-ink">{t("common.whatAreYouLookingFor")}</Text>
                <Text className="text-[12.5px] text-ink-soft">
                  {t("common.subject")} • {t("common.level")}
                </Text>
              </View>
            </View>
          </PressableScale>
        </FadeIn>

        <FadeIn delay={160}>
          <View className="mt-8">
            <Text className="mb-1 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-primary">{t("screens.home.chooseYourPath")}</Text>
            <Text className="mb-4 text-[14px] text-ink-soft">{t("screens.home.chooseYourPathHint")}</Text>
            <View className="gap-3">
              <PathCard
                icon={<LevelIcon size={22} color="#332E86" />}
                tint="bg-primary-tint"
                title={t("screens.home.school")}
                levels={t("screens.home.schoolLevels")}
                description={t("screens.home.schoolDescription")}
                action={t("screens.home.searchSchool")}
                onPress={() => open(SEARCH_SCHOOL_ROUTE)}
              />
              <PathCard
                icon={<GraduationCapIcon size={22} color="#5848C2" />}
                tint="bg-violet-tint"
                title={t("screens.home.university")}
                levels={t("screens.home.universityLevels")}
                description={t("screens.home.universityDescription")}
                action={t("screens.home.searchUniversity")}
                onPress={() => open(SEARCH_UNIVERSITY_ROUTE)}
              />
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={220}>
          <View className="mt-8">
            <Text className="mb-3 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{t("screens.home.popularSearches")}</Text>
            <PopularCategories state={popularCategories} onRetry={retry} />
          </View>
        </FadeIn>

        <FadeIn delay={280}>
          <View className="mt-9">
            <Text className="mb-4 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{t("screens.home.whatEdulocOffers")}</Text>
            <View className="flex-row flex-wrap gap-3">
              <ServiceTile icon={<VideoIcon size={20} color="#332E86" />} title={t("screens.home.serviceFormatTitle")} description={t("screens.home.serviceFormatDescription")} />
              <ServiceTile icon={<MessageSquareIcon size={20} color="#332E86" />} title={t("screens.home.serviceChatTitle")} description={t("screens.home.serviceChatDescription")} />
              <ServiceTile icon={<HouseIcon size={20} color="#332E86" />} title={t("screens.home.serviceRoomsTitle")} description={t("screens.home.serviceRoomsDescription")} />
              <ServiceTile icon={<VerifiedBadgeIcon size={20} color="#0E9C82" />} title={t("screens.home.serviceVerifiedTitle")} description={t("screens.home.serviceVerifiedDescription")} />
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={340}>
          <PressableScale onPress={goToTutorIntro} accessibilityLabel={t("screens.home.doYouTeachBecomeA")}>
            <View className="mt-9 rounded-lg border border-primary-tint bg-primary-tint p-4">
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
      </Animated.View>

      <SailHeader
        progress={sail.progress}
        lifted={sail.lifted}
        onLift={sail.lift}
        compactHeight={bandHeight}
        accessibilityLabel={t("screens.splash.continueToTheEdulocHome")}
        expanded={
          <View className="flex-1 items-center justify-center gap-[18px] px-10">
            <View className="flex-row items-center gap-[14px]">
              <View className="h-[64px] w-[64px] items-center justify-center rounded-[18px] bg-white/[0.14]">
                <GraduationCapIcon size={34} color="#FFFFFF" />
              </View>
              <Text className="text-[48px] font-bold text-white">edUloc</Text>
            </View>
            <Text className="max-w-[260px] text-center text-[15.5px] leading-[21px] text-white/70">{t("screens.splash.theRightSupportInThe")}</Text>
            <Text className="mt-6 text-[13px] font-semibold uppercase tracking-[0.08em] text-white/55">{t("screens.splash.tapToContinue")}</Text>
          </View>
        }
        compact={
          <View className="flex-1 justify-end px-5 pb-6" style={{ paddingTop: insets.top + 14 }}>
            <View className="absolute right-5" style={{ top: insets.top + 14 }}>
              <LanguageSelector />
            </View>
            <View className="flex-row items-center gap-[10px]">
              <View className="h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-white/[0.14]">
                <GraduationCapIcon size={22} color="#FFFFFF" />
              </View>
              <Text className="text-[30px] font-bold text-white">edUloc</Text>
            </View>
            <Text className="mt-2 text-[13.5px] text-white/75">{t("screens.splash.theRightSupportInThe")}</Text>
          </View>
        }
      />

      {/* Barre flottante : connexion et inscription restent à portée de pouce, au-dessus du contenu. */}
      <Animated.View
        pointerEvents={sail.lifted ? "box-none" : "none"}
        style={[{ position: "absolute", left: 16, right: 16, zIndex: 20, bottom: Math.max(insets.bottom, 12) + 8 }, barStyle]}
      >
        <View
          className="flex-row items-center gap-[10px] rounded-full border border-line bg-surface p-2"
          style={{ shadowColor: "#14162B", shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 }}
        >
          {user ? (
            <View className="flex-1">
              <Button label={t("screens.home.mySpace", { firstName: user.firstName })} variant="animated" animatedGlow onPress={goToMySpace} fullWidth />
            </View>
          ) : (
            <>
              <View className="flex-1">
                <Button label={t("common.signIn")} variant="ghost" onPress={goToLogin} fullWidth />
              </View>
              <View className="flex-1">
                <Button label={t("common.createAnAccount")} variant="animated" animatedGlow onPress={goToSignup} fullWidth />
              </View>
            </>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

type PathCardProps = {
  icon: ReactNode;
  tint: string;
  title: string;
  levels: string;
  description: string;
  action: string;
  onPress: () => void;
};

/** Un parcours (scolaire ou universitaire) : ce que couvre EduLoc et un accès direct à la recherche adaptée. */
function PathCard({ icon, tint, title, levels, description, action, onPress }: PathCardProps) {
  return (
    <PressableScale onPress={onPress} accessibilityLabel={`${title} — ${action}`}>
      <View className="rounded-xl border border-line bg-surface p-4">
        <View className="flex-row items-center gap-3">
          <View className={["h-11 w-11 items-center justify-center rounded-md", tint].join(" ")}>{icon}</View>
          <View className="flex-1">
            <Text className="text-[16px] font-bold text-ink">{title}</Text>
            <Text className="text-[12.5px] font-semibold text-ink-soft">{levels}</Text>
          </View>
        </View>
        <Text className="mt-3 text-[13.5px] leading-[19px] text-ink-soft">{description}</Text>
        <View className="mt-3 flex-row items-center gap-1">
          <Text className="text-[13.5px] font-bold text-primary">{action}</Text>
          <ChevronRightIcon size={15} />
        </View>
      </View>
    </PressableScale>
  );
}

type ServiceTileProps = {
  icon: ReactNode;
  title: string;
  description: string;
};

function ServiceTile({ icon, title, description }: ServiceTileProps) {
  return (
    <View className="rounded-xl border border-line bg-surface p-4" style={{ width: "48%", flexGrow: 1 }}>
      <View className="mb-3 h-10 w-10 items-center justify-center rounded-md bg-paper-alt">{icon}</View>
      <Text className="text-[14px] font-bold text-ink">{title}</Text>
      <Text className="mt-1 text-[12.5px] leading-[17px] text-ink-soft">{description}</Text>
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
