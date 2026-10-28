import { type Href, useRouter } from "expo-router";
import type { ComponentType } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  BellIcon,
  ChevronRightIcon,
  GraduationCapIcon,
  HouseIcon,
  type IconProps,
  LockIcon,
  LogoutIcon,
  PersonIcon,
  TeachIcon,
  VerifiedBadgeIcon,
} from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { LessonAlarmCard } from "@/components/ui/lesson-alarm-card";
import { ApprentiBottomNav } from "@/components/ui/apprenti-bottom-nav";
import { TutorBottomNav } from "@/components/ui/tutor-bottom-nav";
import { AuthHeader } from "@/components/ui/auth-header";
import { signOut } from "@/lib/sign-out";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/ui/language-selector";

const MODE_SWITCH_ROUTE = "/mode-switch" as Href;
const NOTIFICATIONS_ROUTE = "/notifications" as Href;
const PARTNER_DASHBOARD_ROUTE = "/partner-dashboard" as Href;

/** « jean.rakoto@mail.com » → « j•••@mail.com » : l'e-mail n'est jamais affiché en entier. */
function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  return `${name.charAt(0)}•••@${domain}`;
}

export function AccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeMode = useAuthStore((s) => s.activeMode);
  const user = useAuthStore((s) => s.user);

  const displayName = user ? `${user.firstName} ${user.lastName}`.trim() : "";
  const initials = displayName.split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2);
  const isApprenti = activeMode === "apprenti";

  const handleLogout = () => signOut(router);

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 20) }}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={30}>
          <View className="mb-[22px] flex-row items-center gap-[14px]">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-primary-tint">
              <Text className="text-[19px] font-bold text-primary">{initials}</Text>
            </View>
            <View>
              <Text className="text-[17px] font-bold text-ink">{displayName}</Text>
              <Text className="text-[13px] text-ink-soft">{user ? maskEmail(user.email) : ""}</Text>
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={70}>
          <Text className="mb-2 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{t("common.mode")}</Text>
          <PressableScale
            onPress={() => router.push(MODE_SWITCH_ROUTE)}
            accessibilityLabel={t("screens.account.switchModeLabel", { value: isApprenti ? t("common.learner") : t("common.tutor") })}
          >
            <View className="mb-[22px] flex-row items-center gap-3 rounded-lg border border-line bg-surface p-4">
              <View className="flex-1 flex-row items-center gap-2">
                {isApprenti ? (
                  <GraduationCapIcon size={17} color="#332E86" />
                ) : (
                  <TeachIcon size={17} color="#332E86" />
                )}
                <Text className="text-[14.5px] font-bold text-ink">{t("screens.account.mode", { value: isApprenti ? t("common.learner") : t("common.tutor") })}</Text>
              </View>
              <View className="flex-row items-center gap-[6px] rounded-full border border-line bg-surface px-[14px] py-[9px]">
                <TeachIcon size={13} color="#585B78" />
                <Text className="text-[13.5px] font-semibold text-ink-soft">
                  {t("screens.account.switchTo", { value: isApprenti ? t("common.tutor") : t("common.learner") })}
                </Text>
              </View>
            </View>
          </PressableScale>
        </FadeIn>

        <FadeIn delay={90}>
          <Text className="mb-2 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{t("screens.account.reminders")}</Text>
          <View className="mb-[22px]">
            <LessonAlarmCard />
          </View>
        </FadeIn>

        <FadeIn delay={110}>
          <View className="rounded-lg border border-line bg-surface px-4">
            <SettingsRow
              Icon={PersonIcon}
              label={t("common.personalInformation")}
              onPress={() => {}}
              disabled
              accessibilityLabel={t("screens.account.personalInformationComingSoon")}
            />
            <SettingsRow
              Icon={HouseIcon}
              label={t("screens.account.myStudyVenuesPartner")}
              onPress={() => router.push(PARTNER_DASHBOARD_ROUTE)}
              accessibilityLabel={t("screens.account.manageMyPartnerStudyVenues")}
            />
            <LanguageSelector variant="row" />
            <View className="h-px bg-line-soft" />
            <SettingsRow Icon={BellIcon} label={t("common.notifications")} onPress={() => router.push(NOTIFICATIONS_ROUTE)} />
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

        <FadeIn delay={150}>
          <PressableScale onPress={handleLogout} accessibilityLabel={t("common.logOut")}>
            <View className="mt-[22px] flex-row items-center gap-[10px] py-2">
              <LogoutIcon size={18} color="#AC4A40" />
              <Text className="text-[14.5px] font-bold text-error">{t("common.logOut")}</Text>
            </View>
          </PressableScale>
        </FadeIn>
      </ScrollView>

      {isApprenti ? <ApprentiBottomNav active="profile" /> : <TutorBottomNav active="profile" />}
    </View>
  );
}

function SettingsRow({
  Icon,
  label,
  onPress,
  disabled,
  last,
  accessibilityLabel,
}: {
  Icon: ComponentType<IconProps>;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  last?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <View>
      <PressableScale onPress={onPress} disabled={disabled} accessibilityLabel={accessibilityLabel ?? label}>
        <View className="flex-row items-center gap-[14px] py-[13px]">
          <Icon size={18} color="#585B78" />
          <Text className="flex-1 text-[14.5px] font-semibold text-ink">{label}</Text>
          <ChevronRightIcon size={16} color="#9799AF" />
        </View>
      </PressableScale>
      {last ? null : <View className="h-px bg-line-soft" />}
    </View>
  );
}
