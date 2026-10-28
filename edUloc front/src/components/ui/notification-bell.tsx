import { type Href, useRouter } from "expo-router";
import { Text, View } from "react-native";

import { BellIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { useNotificationBadgeStore } from "@/store/notification-badge.store";
import { useTranslation } from "react-i18next";

const NOTIFICATIONS_ROUTE = "/notifications" as Href;

/** Cloche des en-têtes de tableau de bord, avec la pastille du nombre de notifications non lues. */
export function NotificationBell() {
  const { t } = useTranslation();
  const router = useRouter();
  const unread = useNotificationBadgeStore((s) => s.unread);

  return (
    <PressableScale
      onPress={() => router.push(NOTIFICATIONS_ROUTE)}
      accessibilityLabel={unread > 0 ? t("ui.notificationBell.unreadCount", { count: unread }) : t("common.notifications")}
    >
      <View className="h-[38px] w-[38px] items-center justify-center rounded-full border border-line">
        <BellIcon size={18} color="#585B78" />
        {unread > 0 ? (
          <View className="absolute -right-1 -top-1 h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-paper bg-error px-1">
            <Text className="text-[10px] font-bold leading-[12px] text-white">{unread > 99 ? "99+" : unread}</Text>
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}
