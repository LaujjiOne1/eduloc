import { type Href, useRouter } from "expo-router";
import type { ComponentType } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  BellIcon,
  ChevronRightIcon,
  GraduationCapIcon,
  GridIcon,
  HouseIcon,
  type IconProps,
  LocationIcon,
  LockIcon,
  LogoutIcon,
  PencilIcon,
  PersonIcon,
  SparklesIcon,
  StarIcon,
  SubjectIcon,
  TeachIcon,
  VerifiedBadgeIcon,
} from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { TutorAvatar } from "@/components/ui/tutor-avatar";
import { AuthHeader } from "@/components/ui/auth-header";
import { Chip } from "@/components/ui/chip";
import { TutorBottomNav } from "@/components/ui/tutor-bottom-nav";
import { useTutorOffers } from "@/hooks/use-tutor-offers";
import { useTutorProfile } from "@/hooks/use-tutor-profile";
import { signOut } from "@/lib/sign-out";
import { useAuthStore } from "@/store/auth.store";
import type { TutorProfileSummary } from "@/types/tutor-profile";
import { useTranslation } from "react-i18next";

const EDIT_PROFILE_ROUTE = "/tutor-identity" as Href;
const OFFERS_ROUTE = "/tutor-dashboard/offers" as Href;
const ROOMS_ROUTE = "/tutor-dashboard/rooms" as Href;
const MODE_SWITCH_ROUTE = "/mode-switch" as Href;
const NOTIFICATIONS_ROUTE = "/notifications" as Href;
const APPRENTI_DASHBOARD_ROUTE = "/apprenti-dashboard" as Href;

export function MyProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state: profileState, retry } = useTutorProfile();
  const { state: offersState } = useTutorOffers();
  const setActiveMode = useAuthStore((s) => s.setActiveMode);
  const user = useAuthStore((s) => s.user);

  const activeOfferCount =
    offersState.status === "success"
      ? offersState.offers.filter((o) => o.isActive).length
      : null;

  const handleLogout = () => signOut(router);

  const handleSwitchToApprenti = () => {
    setActiveMode("apprenti");
    router.replace(APPRENTI_DASHBOARD_ROUTE);
  };

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />

      {profileState.status === "loading" ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#332E86" />
        </View>
      ) : profileState.status === "error" ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Text className="text-center text-[14px] text-error">{profileState.message}</Text>
          <PressableScale onPress={retry} accessibilityLabel={t("common.tryAgain")}>
            <Text className="text-[14px] font-semibold text-primary">{t("common.tryAgain")}</Text>
          </PressableScale>
        </View>
      ) : (
        <ProfileContent
          profile={profileState.profile}
          activeOfferCount={activeOfferCount}
          email={user?.email}
          onEdit={() => router.push(EDIT_PROFILE_ROUTE)}
          onGoToOffers={() => router.push(OFFERS_ROUTE)}
          onGoToRooms={() => router.push(ROOMS_ROUTE)}
          onSwitchMode={handleSwitchToApprenti}
          onOpenModeSwitch={() => router.push(MODE_SWITCH_ROUTE)}
          onGoToNotifications={() => router.push(NOTIFICATIONS_ROUTE)}
          onLogout={handleLogout}
        />
      )}

      <TutorBottomNav active="profile" />
    </View>
  );
}

type ProfileContentProps = {
  profile: TutorProfileSummary;
  activeOfferCount: number | null;
  email?: string;
  onEdit: () => void;
  onGoToOffers: () => void;
  onGoToRooms: () => void;
  onSwitchMode: () => void;
  onOpenModeSwitch: () => void;
  onGoToNotifications: () => void;
  onLogout: () => void;
};

function ProfileContent({
  profile,
  activeOfferCount,
  email,
  onEdit,
  onGoToOffers,
  onGoToRooms,
  onSwitchMode,
  onOpenModeSwitch,
  onGoToNotifications,
  onLogout,
}: ProfileContentProps) {
  const { t } = useTranslation();
  const displayEmail = email || "j•••@gmail.com";

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 28 }}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Identité Tuteur (User Header Card) */}
      <FadeIn delay={30}>
        <View className="mb-5 flex-row items-center justify-between rounded-xl border border-line bg-surface p-4">
          <View className="flex-1 flex-row items-center gap-[14px]">
            <TutorAvatar gender={profile.gender} photoUrl={profile.photoUrl} size={64} />

            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Text className="text-[17.5px] font-bold text-ink" numberOfLines={1}>
                  {profile.firstName} {profile.lastName}
                </Text>
                <View className="flex-row items-center gap-1 rounded-full bg-accent-tint px-2 py-0.5">
                  <VerifiedBadgeIcon size={12} color="#0E9C82" />
                  <Text className="text-[11px] font-bold text-accent">{t("tutorDashboard.myProfile.validated")}</Text>
                </View>
              </View>

              <Text className="mt-0.5 text-[13px] text-ink-soft">{displayEmail}</Text>

              <View className="mt-1 flex-row items-center gap-1.5">
                <StarIcon size={13} color="#BD7E28" filled />
                <Text className="text-[13px] font-bold text-ink">{profile.rating.toFixed(1)}</Text>
                <Text className="text-[12px] text-ink-faint">{t("common.reviews", { reviewCount: profile.reviewCount })}</Text>
              </View>
            </View>
          </View>

          <PressableScale onPress={onEdit} accessibilityLabel={t("tutorDashboard.myProfile.editTheProfile")}>
            <View className="h-9 w-9 items-center justify-center rounded-full border border-line bg-paper">
              <PencilIcon size={16} color="#332E86" />
            </View>
          </PressableScale>
        </View>
      </FadeIn>

      {/* 2. Changement de Mode (Card identique au dashboard demandeur) */}
      <FadeIn delay={60}>
        <Text className="mb-2 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
          {t("common.mode")}</Text>
        <PressableScale onPress={onOpenModeSwitch} accessibilityLabel={t("tutorDashboard.myProfile.tutorModeSwitchMode")}>
          <View className="mb-5 flex-row items-center gap-3 rounded-lg border border-line bg-surface p-4">
            <View className="flex-1 flex-row items-center gap-2.5">
              <View className="h-8 w-8 items-center justify-center rounded-md bg-primary-tint">
                <TeachIcon size={17} color="#332E86" />
              </View>
              <View>
                <Text className="text-[14.5px] font-bold text-ink">{t("common.tutorMode")}</Text>
                <Text className="text-[12px] text-ink-soft">{t("tutorDashboard.myProfile.teachingSpace")}</Text>
              </View>
            </View>
            <PressableScale
              onPress={onSwitchMode}
              accessibilityLabel={t("tutorDashboard.myProfile.switchToLearnerMode")}
            >
              <View className="flex-row items-center gap-[6px] rounded-full border border-line bg-surface px-[14px] py-[9px]">
                <GraduationCapIcon size={14} color="#585B78" />
                <Text className="text-[13.5px] font-semibold text-ink-soft">
                  {t("tutorDashboard.myProfile.switchToLearner")}</Text>
              </View>
            </PressableScale>
          </View>
        </PressableScale>
      </FadeIn>

      {/* 3. Profil Pédagogique (Organisé ergonomiquement) */}
      <FadeIn delay={90}>
        <Text className="mb-2 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
          {t("tutorDashboard.myProfile.teachingProfile")}</Text>
        <View className="mb-5 rounded-lg border border-line bg-surface p-4">
          {/* À propos */}
          <View className="mb-3.5">
            <View className="mb-1.5 flex-row items-center justify-between">
              <Text className="text-[13px] font-bold text-ink">{t("common.about")}</Text>
              <PressableScale onPress={onEdit} accessibilityLabel={t("tutorDashboard.myProfile.editTheBio")}>
                <Text className="text-[12.5px] font-semibold text-primary">{t("common.edit")}</Text>
              </PressableScale>
            </View>
            <Text className="text-[13.5px] leading-[21px] text-ink-soft">
              {profile.bio}
            </Text>
          </View>

          <View className="my-3 h-px bg-line-soft" />

          {/* Compétences clés */}
          <View className="mb-3.5">
            <View className="mb-2 flex-row items-center gap-1.5">
              <SparklesIcon size={15} color="#332E86" />
              <Text className="text-[13px] font-bold text-ink">{t("tutorDashboard.myProfile.keySkills")}</Text>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {profile.skills.map((skill) => (
                <Chip key={skill.id} label={skill.label} />
              ))}
            </View>
          </View>

          <View className="my-3 h-px bg-line-soft" />

          {/* Matières & Niveaux */}
          <View>
            <View className="mb-2 flex-row items-center gap-1.5">
              <SubjectIcon size={15} color="#332E86" />
              <Text className="text-[13px] font-bold text-ink">{t("tutorDashboard.myProfile.subjectsLevels")}</Text>
            </View>
            <View className="gap-2.5">
              {profile.subjects.map((sub, idx) => (
                <View
                  key={sub.skill.id || idx}
                  className="rounded-md border border-line-soft bg-paper/60 p-2.5"
                >
                  <Text className="text-[14px] font-bold text-ink">
                    {sub.skill.label}
                  </Text>
                  <View className="mt-1.5 flex-row flex-wrap gap-1.5">
                    {sub.levels.map((lvl) => (
                      <View
                        key={lvl.id}
                        className="rounded-full bg-primary-tint px-2.5 py-0.5"
                      >
                        <Text className="text-[12px] font-semibold text-primary">
                          {lvl.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      </FadeIn>

      {/* 4. Activité, Offres & Lieux (Carte ergonomique) */}
      <FadeIn delay={120}>
        <Text className="mb-2 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
          {t("tutorDashboard.myProfile.offersPlaces")}</Text>
        <View className="mb-5 rounded-lg border border-line bg-surface p-4">
          {/* Offres */}
          <PressableScale
            onPress={onGoToOffers}
            accessibilityLabel={t("tutorDashboard.myProfile.manageMyLessonOffers")}
          >
            <View className="flex-row items-center gap-3 py-1">
              <View className="h-9 w-9 items-center justify-center rounded-md bg-primary-tint">
                <GridIcon size={18} color="#332E86" />
              </View>
              <View className="flex-1">
                <Text className="text-[14.5px] font-bold text-ink">
                  {activeOfferCount === null
                    ? t("tutorDashboard.myProfile.tutoringOffers")
                    : t("tutorDashboard.myProfile.activeOfferCount", { count: activeOfferCount })}
                </Text>
                <Text className="text-[12.5px] text-ink-soft">
                  {t("tutorDashboard.myProfile.manageAndPublishMyLessons")}</Text>
              </View>
              <ChevronRightIcon size={16} color="#9799AF" />
            </View>
          </PressableScale>

          <View className="my-3.5 h-px bg-line-soft" />

          {/* Salles partenaires */}
          <PressableScale onPress={onGoToRooms} accessibilityLabel={t("tutorDashboard.myProfile.manageMyPartnerRooms")}>
            <View className="flex-row items-center gap-3 py-1">
              <View className="h-9 w-9 items-center justify-center rounded-md bg-violet-tint">
                <HouseIcon size={18} color="#332E86" />
              </View>
              <View className="flex-1">
                <Text className="text-[14.5px] font-bold text-ink">{t("common.partnerRooms")}</Text>
                <Text className="text-[12.5px] text-ink-soft">{t("tutorDashboard.myProfile.chooseWhereITeach")}</Text>
              </View>
              <ChevronRightIcon size={16} color="#9799AF" />
            </View>
          </PressableScale>

          <View className="my-3.5 h-px bg-line-soft" />

          {/* Lieux */}
          <View className="py-1">
            <View className="mb-2 flex-row items-center gap-2">
              <View className="h-9 w-9 items-center justify-center rounded-md bg-accent-tint">
                <LocationIcon size={18} color="#0E9C82" />
              </View>
              <View className="flex-1">
                <Text className="text-[14.5px] font-bold text-ink">
                  {t("tutorDashboard.myProfile.areaOfActivity")}</Text>
                <Text className="text-[12.5px] text-ink-soft">
                  {t("tutorDashboard.myProfile.placesWhereYouGiveYour")}</Text>
              </View>
            </View>

            <View className="mt-1 flex-row flex-wrap gap-2 pl-11">
              {profile.locations.length > 0 ? (
                profile.locations.map((loc) => (
                  <View
                    key={loc.id}
                    className="flex-row items-center gap-1 rounded-full border border-line bg-paper px-3 py-1"
                  >
                    <LocationIcon size={12} color="#585B78" />
                    <Text className="text-[12.5px] font-medium text-ink">
                      {loc.label}
                      {loc.radiusKm ? t("tutorDashboard.myProfile.km", { radiusKm: loc.radiusKm }) : ""}
                    </Text>
                  </View>
                ))
              ) : (
                <Text className="text-[13px] text-ink-faint">
                  {t("tutorDashboard.myProfile.noPlaceRegistered")}</Text>
              )}
            </View>
          </View>
        </View>
      </FadeIn>

      {/* 5. Paramètres du compte (Identique au Demandeur) */}
      <FadeIn delay={150}>
        <Text className="mb-2 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
          {t("common.settings")}</Text>
        <View className="mb-5 rounded-lg border border-line bg-surface px-4">
          <SettingsRow
            Icon={PersonIcon}
            label={t("common.personalInformation")}
            onPress={onEdit}
            accessibilityLabel={t("tutorDashboard.myProfile.editMyPersonalInformation")}
          />
          <SettingsRow
            Icon={BellIcon}
            label={t("common.notifications")}
            onPress={onGoToNotifications}
          />
          <SettingsRow
            Icon={VerifiedBadgeIcon}
            label={t("common.privacy")}
            onPress={() => {}}
            disabled
            accessibilityLabel={t("common.privacyComingSoon")}
          />
          <SettingsRow
            Icon={LockIcon}
            label={t("common.security")}
            onPress={() => {}}
            disabled
            last
            accessibilityLabel={t("common.securityComingSoon")}
          />
        </View>
      </FadeIn>

      {/* 6. Bouton de Déconnexion (Comme demandé par l'utilisateur) */}
      <FadeIn delay={180}>
        <PressableScale onPress={onLogout} accessibilityLabel={t("tutorDashboard.myProfile.logOutOfTheAccount")}>
          <View className="mb-4 flex-row items-center justify-center gap-[10px] rounded-lg border border-error/20 bg-surface py-3.5 shadow-sm active:bg-error-tint">
            <LogoutIcon size={18} color="#AC4A40" />
            <Text className="text-[15px] font-bold text-error">{t("common.logOut")}</Text>
          </View>
        </PressableScale>
      </FadeIn>
    </ScrollView>
  );
}

function SettingsRow({
  Icon,
  label,
  value,
  onPress,
  disabled,
  last,
  accessibilityLabel,
}: {
  Icon: ComponentType<IconProps>;
  label: string;
  value?: string;
  onPress: () => void;
  disabled?: boolean;
  last?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <View>
      <PressableScale
        onPress={onPress}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel ?? label}
      >
        <View className="flex-row items-center gap-[14px] py-[13px]">
          <Icon size={18} color="#585B78" />
          <Text className="flex-1 text-[14.5px] font-semibold text-ink">{label}</Text>
          {value ? <Text className="mr-1 text-[13px] text-ink-soft">{value}</Text> : null}
          <ChevronRightIcon size={16} color="#9799AF" />
        </View>
      </PressableScale>
      {last ? null : <View className="h-px bg-line-soft" />}
    </View>
  );
}
