import { api } from "@/api/http";
import { toNotification } from "@/api/mappers";
import type { NotificationPageDto } from "@/api/contracts/dto";
import type { AppNotification } from "@/types/notification";

/** Routes backend : GET /notifications, GET /notifications/unread-count, POST /notifications/:id/read, POST /notifications/read. */
export const NotificationService = {
  async getMyNotifications(): Promise<AppNotification[]> {
    const rows = await api.get<NotificationPageDto["items"]>("/notifications");
    const now = new Date();
    return rows.map((n) => toNotification(n, now));
  },
  async getUnreadCount(): Promise<number> {
    return (await api.get<{ count: number }>("/notifications/unread-count")).count;
  },
  async markRead(id: string): Promise<void> {
    await api.post(`/notifications/${id}/read`);
  },
  async markAllRead(): Promise<void> {
    await api.post("/notifications/read");
  },
};
