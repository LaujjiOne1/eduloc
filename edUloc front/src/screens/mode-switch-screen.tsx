import { type Href, useRouter } from "expo-router";
import type { ComponentType } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CheckIcon,
  ChevronRightIcon,
  GraduationCapIcon,
  type IconProps,
  LogoutIcon,
  SettingsIcon,
  TeachIcon,
  XCircleIcon,
} from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { signOut } from "@/lib/sign-out";
import { type UserMode, useAuthStore } from "@/store/auth.store";
import { useTranslation } from "react-i18next";

const APPRENTI_DASHBOARD_ROUTE = "/apprenti-dashboard" as Href;
const TUTOR_DASHBOARD_ROUTE = "/tutor-dashboard" as Href;

export function ModeSwitchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeMode = useAuthStore((s) => s.activeMode);
  const setActiveMode = useAuthStore((s) => s.setActiveMode);

  const switchTo = (mode: UserMode) => {
    if (mode === activeMode) return;
    setActiveMode(mode);
    router.replace(mode === "apprenti" ? APPRENTI_DASHBOARD_ROUTE : TUTOR_DASHBOARD_ROUTE);
  };

  const handleLogout = () => signOut(router);

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-5 pb-1 pt-[18px]">
        <Text className="text-[18px] font-bold text-ink">{t("screens.modeSwitch.currentMode")}</Text>
        {/* The mock's close button links back to 35_Account, but this screen
            is also reached directly from both dashboards' header chip —
            router.back() returns to whichever screen actually opened it. */}
        <PressableScale onPress={() => router.back()} accessibilityLabel={t("common.close")}>
          <View className="h-8 w-8 items-center justify-center rounded-full bg-paper-alt">
            <XCircleIcon size={16} color="#585B78" />
          </View>
        </PressableScale>
      </View>

      <View className="px-5 pb-5 pt-4">
        <ModeOptionCard
          title={t("common.learner")}
          description={t("common.findATutor2")}
          Icon={GraduationCapIcon}
          active={activeMode === "apprenti"}
          onPress={() => switchTo("apprenti")}
        />
        <ModeOptionCard
          title={t("common.tutor")}
          description={t("screens.modeSwitch.manageYourLessonsAndRequests")}
          Icon={TeachIcon}
          active={activeMode === "tutor"}
          onPress={() => switchTo("tutor")}
        />

        <View className="my-3 h-px bg-line-soft" />

        {/* "Paramètres" has no dedicated screen/spec in this batch (AGENTS.md
            §2) — shown per the mock, disabled rather than a dead link. */}
        <PressableScale onPress={() => {}} disabled accessibilityLabel={t("screens.modeSwitch.settingsComingSoon")}>
          <View className="flex-row items-center gap-[14px] py-[13px]">
            <SettingsIcon size={18} color="#585B78" />
            <Text className="flex-1 text-[14.5px] font-semibold text-ink">{t("common.settings")}</Text>
            <ChevronRightIcon size={16} color="#9799AF" />
          </View>
        </PressableScale>

        <PressableScale onPress={handleLogout} accessibilityLabel={t("common.logOut")}>
          <View className="flex-row items-center gap-[14px] py-[13px]">
            <LogoutIcon size={18} color="#AC4A40" />
            <Text className="flex-1 text-[14.5px] font-semibold text-error">{t("common.logOut")}</Text>
            <ChevronRightIcon size={16} color="#9799AF" />
          </View>
        </PressableScale>
      </View>
    </View>
  );
}

function ModeOptionCard({
  title,
  description,
  Icon,
  active,
  onPress,
}: {
  title: string;
  description: string;
  Icon: ComponentType<IconProps>;
  active: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const content = (
    <View
      className={[
        "mb-[10px] flex-row items-center gap-[14px] rounded-lg border p-4",
        active ? "border-primary bg-primary-tint" : "border-line bg-surface",
      ].join(" ")}
    >
      <View
        className="h-[42px] w-[42px] items-center justify-center rounded-md bg-surface"
        style={{ shadowColor: "#14162B", shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}
      >
        <Icon size={20} color="#332E86" />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-bold text-ink">{title}</Text>
        <Text className="mt-[2px] text-[12.5px] text-ink-soft">{description}</Text>
      </View>
      <View
        className={[
          "h-[22px] w-[22px] items-center justify-center rounded-full border-2",
          active ? "border-primary bg-primary" : "border-line",
        ].join(" ")}
      >
        {active ? <CheckIcon size={11} color="#fff" /> : null}
      </View>
    </View>
  );

  // The currently-active mode isn't a pressable no-op — only the inactive
  // card (the actual "switch to..." action) responds to taps.
  if (active) return content;

  return (
    <PressableScale onPress={onPress} accessibilityLabel={t("screens.modeSwitch.switchToMode", { title })}>
      {content}
    </PressableScale>
  );
}
