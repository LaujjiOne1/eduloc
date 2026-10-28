import { useCallback, useState } from "react";

import { isApiError } from "@/api/errors";
import { useRealtimeReload } from "@/realtime/use-realtime-event";
import { NotificationService } from "@/services/notification.service";
import { refreshUnreadCount, useNotificationBadgeStore } from "@/store/notification-badge.store";
import type { AppNotification } from "@/types/notification";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type MyNotificationsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "success"; notifications: AppNotification[] };

/** Loads the signed-in user's notification feed for 33_Notifications (new ones appear live). */
export function useMyNotifications() {
  const [state, setState] = useState<MyNotificationsState>({ status: "loading" });

  const load = useCallback(async (silent = false) => {
    if (!silent) setState({ status: "loading" });
    try {
      const notifications = await NotificationService.getMyNotifications();
      setState(notifications.length > 0 ? { status: "success", notifications } : { status: "empty" });
    } catch (error) {
      if (silent) return;
      setState({ status: "error", message: isApiError(error) ? error.message : t("hooks.useMyNotifications.unableToLoadYourNotifications") });
    }
  }, []);

  useLoadEffect(load);

  // Le relais outbox crée la notification juste après l'événement : on laisse un instant avant de relire.
  useRealtimeReload(
    () => {
      setTimeout(() => void load(true), 600);
    },
    ["booking.", "session.", "message.", "call.", "tutor.", "review."],
  );

  // Identité stable : certains écrans relisent au focus (useFocusEffect) sans boucler.
  const retry = useCallback(() => load(), [load]);

  const markRead = useCallback(async (id: string) => {
    setState((current) =>
      current.status === "success"
        ? { status: "success", notifications: current.notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n)) }
        : current,
    );
    try {
      await NotificationService.markRead(id);
    } finally {
      void refreshUnreadCount();
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setState((current) =>
      current.status === "success"
        ? { status: "success", notifications: current.notifications.map((n) => ({ ...n, isRead: true })) }
        : current,
    );
    useNotificationBadgeStore.getState().setUnread(0);
    try {
      await NotificationService.markAllRead();
    } finally {
      void refreshUnreadCount();
    }
  }, []);

  return { state, retry, markRead, markAllRead };
}
