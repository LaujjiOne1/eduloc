import { type Href, useRouter } from "expo-router";
import type { ComponentType } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HouseIcon, type IconProps, MessageSquareIcon, PersonIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { t } from "@/i18n";

export type ApprentiTab =
  | "home"
  | "conversations"
  | "profile"
  | "bookings"
  | "search"
  | "notifications";

const CONVERSATIONS_ROUTE = "/apprenti-dashboard/conversations" as Href;
const ACCOUNT_ROUTE = "/account" as Href;

const TABS: { id: ApprentiTab; label: string; route: Href; Icon: ComponentType<IconProps> }[] = [
  { id: "home", get label() { return t("common.home"); }, route: "/apprenti-dashboard" as Href, Icon: HouseIcon },
  { id: "conversations", get label() { return t("chat.conversationsListView.conversations"); }, route: CONVERSATIONS_ROUTE, Icon: MessageSquareIcon },
  { id: "profile", get label() { return t("common.profile"); }, route: ACCOUNT_ROUTE, Icon: PersonIcon },
];

const ACTIVE_COLOR = "#332E86";

/**
 * Bottom navigation for apprenti / beneficiary screens.
 * Contains 3 core tabs: Accueil, Conversations, and Profil.
 */
export function ApprentiBottomNav({ active }: { active: ApprentiTab }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-shrink-0 border-t border-line-soft bg-surface"
      style={{ minHeight: 64 + insets.bottom, paddingBottom: Math.max(insets.bottom, 6) }}
    >
      <View className="h-[58px] w-full flex-row items-center justify-around px-8">
        {TABS.map(({ id, label, route, Icon }) => {
          const isActive =
            id === active ||
            (id === "conversations" && active === "bookings");
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
                <Icon size={22} color={color} />
                <Text
                  style={{
                    color,
                    fontSize: 11,
                    fontWeight: isActive ? "700" : "500",
                  }}
                >
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
