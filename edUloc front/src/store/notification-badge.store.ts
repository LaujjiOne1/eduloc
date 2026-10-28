import { create } from "zustand";

import { NotificationService } from "@/services/notification.service";

interface NotificationBadgeState {
  /** Nombre de notifications non lues (pastille de la cloche). */
  unread: number;
  setUnread: (unread: number) => void;
}

export const useNotificationBadgeStore = create<NotificationBadgeState>((set) => ({
  unread: 0,
  setUnread: (unread) => set({ unread }),
}));

/** Relit le compteur côté serveur (le serveur reste la référence). Un échec réseau garde l'ancienne valeur. */
export async function refreshUnreadCount(): Promise<void> {
  try {
    useNotificationBadgeStore.getState().setUnread(await NotificationService.getUnreadCount());
  } catch {
    // hors ligne : la pastille se corrigera à la prochaine relecture
  }
}
