import { useFocusEffect, useRouter } from "expo-router";
import { type ComponentType, useCallback, useEffect, useRef } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  BellIcon,
  CalendarIcon,
  CheckCircleIcon,
  FileIcon,
  type IconProps,
  MicIcon,
  PhoneIcon,
  StarIcon,
  XCircleIcon,
} from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { ApprentiBottomNav } from "@/components/ui/apprenti-bottom-nav";
import { TutorBottomNav } from "@/components/ui/tutor-bottom-nav";
import { AuthHeader } from "@/components/ui/auth-header";
import { useMyNotifications } from "@/hooks/use-my-notifications";
import { routeForNotification } from "@/lib/notification-routing";
import { useAuthStore } from "@/store/auth.store";
import type { AppNotification, AppNotificationType } from "@/types/notification";
import { useTranslation } from "react-i18next";

const NOTIFICATION_VISUAL: Record<AppNotificationType, { Icon: ComponentType<IconProps>; bgClass: string; color: string }> = {
  booking_request: { Icon: CalendarIcon, bgClass: "bg-warning-tint", color: "#BD7E28" },
  booking_confirmed: { Icon: CheckCircleIcon, bgClass: "bg-accent-tint", color: "#0E9C82" },
  booking_refused: { Icon: XCircleIcon, bgClass: "bg-error-tint", color: "#AC4A40" },
  booking_cancelled: { Icon: XCircleIcon, bgClass: "bg-error-tint", color: "#AC4A40" },
  session_started: { Icon: CheckCircleIcon, bgClass: "bg-primary-tint", color: "#332E86" },
  session_completed: { Icon: CheckCircleIcon, bgClass: "bg-accent-tint", color: "#0E9C82" },
  review_request: { Icon: StarIcon, bgClass: "bg-warning-tint", color: "#BD7E28" },
  tutor_application: { Icon: BellIcon, bgClass: "bg-primary-tint", color: "#332E86" },
  tutor_application_approved: { Icon: CheckCircleIcon, bgClass: "bg-accent-tint", color: "#0E9C82" },
  tutor_application_rejected: { Icon: XCircleIcon, bgClass: "bg-error-tint", color: "#AC4A40" },
  tutor_suspended: { Icon: XCircleIcon, bgClass: "bg-error-tint", color: "#AC4A40" },
  voice_message: { Icon: MicIcon, bgClass: "bg-primary-tint", color: "#332E86" },
  document_message: { Icon: FileIcon, bgClass: "bg-primary-tint", color: "#332E86" },
  incoming_call: { Icon: PhoneIcon, bgClass: "bg-accent-tint", color: "#0E9C82" },
  missed_call: { Icon: PhoneIcon, bgClass: "bg-error-tint", color: "#AC4A40" },
  reminder: { Icon: CalendarIcon, bgClass: "bg-warning-tint", color: "#BD7E28" },
  system: { Icon: BellIcon, bgClass: "bg-surface-tint", color: "#606482" },
};

function groupByDate(notifications: AppNotification[]): { label: string; items: AppNotification[] }[] {
  const groups: { label: string; items: AppNotification[] }[] = [];
  for (const notification of notifications) {
    const group = groups.find((g) => g.label === notification.dateGroup);
    if (group) group.items.push(notification);
    else groups.push({ label: notification.dateGroup, items: [notification] });
  }
  return groups;
}

export function NotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeMode = useAuthStore((s) => s.activeMode);
  const { state, retry, markRead, markAllRead } = useMyNotifications();

  const unreadCount = state.status === "success" ? state.notifications.filter((n) => !n.isRead).length : 0;

  // Comme Messenger : ce qu'on a vu à l'écran est lu en quittant la liste (les nouvelles restent mises en avant pendant la consultation).
  const hasUnread = useRef(false);
  const markAllReadRef = useRef(markAllRead);
  useEffect(() => {
    hasUnread.current = unreadCount > 0;
    markAllReadRef.current = markAllRead;
  });
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (hasUnread.current) void markAllReadRef.current();
      };
    }, []),
  );

  const open = (notification: AppNotification) => {
    if (!notification.isRead) void markRead(notification.id);
    const route = routeForNotification(
      { type: notification.type, bookingId: notification.target?.bookingId ?? null },
      activeMode,
    );
    if (route) router.push(route);
  };

  const isApprenti = activeMode === "apprenti";
  const groups = state.status === "success" ? groupByDate(state.notifications) : [];

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      {/* The mock's back arrow always points to 21_ApprentiDashboard, but this
          screen is also reached from 51_TutorDashboard's own bell icon —
          router.back() returns to whichever dashboard actually opened it. */}
      <AuthHeader onBack={() => router.back()} />
      <View className="flex-row items-center justify-between px-5 pb-2">
        <Text className="text-[24px] font-bold text-ink">{t("common.notifications")}</Text>
        {unreadCount > 0 ? (
          <PressableScale onPress={() => void markAllRead()} accessibilityLabel={t("screens.notifications.markAllAsRead")}>
            <Text className="text-[13px] font-semibold text-primary">{t("screens.notifications.markAllAsRead")}</Text>
          </PressableScale>
        ) : null}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 20) }}
        showsVerticalScrollIndicator={false}
      >
        {state.status === "loading" ? (
          <View className="gap-3 pt-3">
            {[0, 1, 2].map((i) => (
              <View key={i} className="h-[62px] rounded-lg bg-line-soft" />
            ))}
          </View>
        ) : state.status === "error" ? (
          <View className="flex-row items-center gap-3 pt-3">
            <Text className="flex-1 text-[13.5px] text-error">{state.message}</Text>
            <PressableScale onPress={retry} accessibilityLabel={t("common.tryAgain")}>
              <Text className="text-[13.5px] font-semibold text-primary">{t("common.tryAgain")}</Text>
            </PressableScale>
          </View>
        ) : state.status === "empty" ? (
          <View className="items-center py-10">
            <Text className="text-center text-[14px] text-ink-soft">{t("screens.notifications.noNotificationsAtTheMoment")}</Text>
          </View>
        ) : (
          groups.map((group, groupIndex) => (
            <View key={group.label}>
              <Text className="mb-[2px] mt-[14px] text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
                {group.label}
              </Text>
              {group.items.map((notification, index) => (
                <FadeIn key={notification.id} delay={40 + (groupIndex * 3 + index) * 40}>
                  <NotificationRow notification={notification} onPress={() => open(notification)} />
                </FadeIn>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {isApprenti ? <ApprentiBottomNav active="notifications" /> : <TutorBottomNav active="home" />}
    </View>
  );
}

function NotificationRow({ notification, onPress }: { notification: AppNotification; onPress: () => void }) {
  const { t } = useTranslation();
  const { Icon, bgClass, color } = NOTIFICATION_VISUAL[notification.type];
  return (
    <PressableScale onPress={onPress} accessibilityLabel={notification.isRead ? notification.title : t("screens.notifications.unreadTitle", { title: notification.title })}>
    <View className={["flex-row gap-3 py-[14px]", notification.isRead ? "" : "-mx-2 rounded-lg bg-primary-tint/40 px-2"].join(" ")}>
      <View className={["h-[38px] w-[38px] items-center justify-center rounded-md", bgClass].join(" ")}>
        <Icon size={17} color={color} />
      </View>
      <View className="flex-1">
        <Text className="text-[14px] font-bold text-ink">{notification.title}</Text>
        <Text className="mt-[2px] text-[13px] leading-[18px] text-ink-soft">{notification.message}</Text>
      </View>
      <View className="items-end gap-1.5">
        <Text className="text-[11px] text-ink-faint">{notification.timeLabel}</Text>
        {notification.isRead ? null : <View className="h-2 w-2 rounded-full bg-primary" />}
      </View>
    </View>
    </PressableScale>
  );
}
