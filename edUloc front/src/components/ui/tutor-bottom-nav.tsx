import { type Href, useRouter } from "expo-router";
import type { ComponentType } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HouseIcon, type IconProps, MessageSquareIcon, PersonIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { t } from "@/i18n";

export type TutorTab = "home" | "requests" | "calendar" | "conversations" | "offers" | "profile";

const TABS: { id: TutorTab; label: string; route: Href; Icon: ComponentType<IconProps> }[] = [
  { id: "home", get label() { return t("common.home"); }, route: "/tutor-dashboard" as Href, Icon: HouseIcon },
  { id: "conversations", get label() { return t("ui.tutorBottomNav.messages"); }, route: "/tutor-dashboard/conversations" as Href, Icon: MessageSquareIcon },
  { id: "profile", get label() { return t("common.profile"); }, route: "/tutor-dashboard/profile" as Href, Icon: PersonIcon },
];

const ACTIVE_COLOR = "#332E86";

/**
 * Bottom menu shared by the 5 top-level tutor dashboard screens.
 * Sub-screens reached by pushing further omit it, matching their back-button headers.
 */
export function TutorBottomNav({ active }: { active: TutorTab }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-shrink-0 border-t border-line-soft bg-surface"
      style={{ minHeight: 64 + insets.bottom, paddingBottom: Math.max(insets.bottom, 6) }}
    >
      <View className="h-[58px] w-full flex-row items-center justify-between px-5">
        {TABS.map(({ id, label, route, Icon }) => {
          const isActive = id === active;
          const color = isActive ? ACTIVE_COLOR : "#9799AF";

          return (
            <PressableScale
              key={id}
              onPress={() => {
                if (!isActive) router.push(route);
              }}
              accessibilityLabel={label}
              accessibilityRole="link"
              style={{ flex: 1 }}
            >
              <View className="items-center gap-1 px-[2px] pb-2 pt-[10px]">
                <Icon size={21} color={color} />
                <Text style={{ color, fontSize: 10.5, fontWeight: isActive ? "700" : "500" }}>
                  {label}
                </Text>
              </View>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}
