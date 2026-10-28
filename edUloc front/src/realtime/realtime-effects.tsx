import { useRouter } from "expo-router";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";

import { isPageHidden, requestWebAlertPermission, showWebAlert } from "@/lib/web-alerts";
import { routeForNotification } from "@/lib/notification-routing";
import { configureForegroundPresentation, onNotificationOpened, registerForPush, unregisterPush } from "@/lib/push";
import { onBeforeLogout } from "@/lib/session-hooks";
import { refreshUnreadCount, useNotificationBadgeStore } from "@/store/notification-badge.store";
import { useAuthStore } from "@/store/auth.store";
import { Realtime, type RealtimeEvent } from "./realtime-client";
import { useRealtimeEvent } from "./use-realtime-event";
import { t } from "@/i18n";

/** Le relais serveur crée la notification juste après l'événement : on laisse un instant avant de relire le compteur. */
const BADGE_REFRESH_DELAY_MS = 700;

/** Texte des alertes système (onglet masqué) ; les appels ont leur propre bandeau. */
const ALERT_TEXT: Record<string, { title: string; body: string }> = {
  "booking.requested": { get title() { return t("realtime.realtimeEffects.newRequest"); }, get body() { return t("realtime.realtimeEffects.aRequesterWantsToBook"); } },
  "booking.confirmed": { get title() { return t("tutorDashboard.requestAccepted.requestAccepted"); }, get body() { return t("realtime.realtimeEffects.yourAppointmentIsConfirmed"); } },
  "booking.refused": { get title() { return t("realtime.realtimeEffects.requestDeclined"); }, get body() { return t("realtime.realtimeEffects.theTutorCouldNotAccept"); } },
  "booking.cancelled": { get title() { return t("realtime.realtimeEffects.appointmentCancelled"); }, get body() { return t("realtime.realtimeEffects.anAppointmentHasBeenCancelled"); } },
  "booking.conflict": { get title() { return t("realtime.realtimeEffects.slotUnavailable"); }, get body() { return t("realtime.realtimeEffects.theRequestedSlotIsNo"); } },
  "booking.reminder": { get title() { return t("realtime.realtimeEffects.yourLessonIsComingUp"); }, get body() { return t("realtime.realtimeEffects.aLessonStartsSoon"); } },
  "session.started": { get title() { return t("realtime.realtimeEffects.sessionStarted"); }, get body() { return t("realtime.realtimeEffects.yourSessionHasJustStarted"); } },
  "session.completed": { get title() { return t("common.sessionCompleted2"); }, get body() { return t("realtime.realtimeEffects.giveYourFeedbackOnThe"); } },
  "message.voice.created": { get title() { return t("realtime.realtimeEffects.newVoiceMessage"); }, get body() { return t("realtime.realtimeEffects.youHaveReceivedAVoice"); } },
  "message.document.created": { get title() { return t("realtime.realtimeEffects.newDocument"); }, get body() { return t("realtime.realtimeEffects.aDocumentWasSharedIn"); } },
};

/**
 * Effets globaux d'une session connectée (montés une fois par RealtimeProvider) :
 *  - pastille de notifications non lues, tenue à jour en direct et au retour au premier plan ;
 *  - relecture des écrans ouverts au retour au premier plan (événements manqués) ;
 *  - alertes système du navigateur quand l'onglet est masqué ;
 *  - push natifs : enregistrement de l'appareil et ouverture de l'écran au toucher.
 */
export function RealtimeEffects() {
  const router = useRouter();

  // Pastille : valeur initiale, puis à chaque événement ; remise à zéro à la déconnexion.
  useEffect(() => {
    void refreshUnreadCount();
    return () => useNotificationBadgeStore.getState().setUnread(0);
  }, []);

  useRealtimeEvent(["booking.", "session.", "message.", "call.", "tutor.", "review.", "realtime.resync"], () => {
    setTimeout(() => void refreshUnreadCount(), BADGE_REFRESH_DELAY_MS);
  });

  // Retour au premier plan : événements peut-être manqués → compteur et écrans se relisent.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void refreshUnreadCount();
      Realtime.emitLocal("realtime.resync");
    });
    return () => subscription.remove();
  }, []);

  // Alertes système du navigateur (page masquée).
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const ask = () => requestWebAlertPermission();
    window.addEventListener("pointerdown", ask, { once: true });
    return () => window.removeEventListener("pointerdown", ask);
  }, []);

  useRealtimeEvent(Object.keys(ALERT_TEXT), (event: RealtimeEvent) => {
    const text = ALERT_TEXT[event.type];
    if (!text || !isPageHidden()) return;
    const mode = useAuthStore.getState().activeMode;
    showWebAlert({
      ...text,
      tag: event.eventId || event.type,
      onClick: () => {
        const bookingId = typeof event.payload.bookingId === "string" ? event.payload.bookingId : event.aggregateId;
        const route = routeForNotification({ type: event.type, bookingId }, mode);
        if (route) router.push(route);
      },
    });
  });

  // Push natifs.
  useEffect(() => {
    configureForegroundPresentation();
    void registerForPush();
    const stopLogoutHook = onBeforeLogout(unregisterPush);
    const stopOpened = onNotificationOpened((data) => {
      const route = routeForNotification(
        {
          type: String(data.type ?? ""),
          bookingId: typeof data.bookingId === "string" ? data.bookingId : null,
          callId: typeof data.callId === "string" ? data.callId : null,
          recipientRole: typeof data.recipientRole === "string" ? data.recipientRole : null,
        },
        useAuthStore.getState().activeMode,
      );
      if (route) router.push(route);
    });
    return () => {
      stopLogoutHook();
      stopOpened();
    };
  }, [router]);

  return null;
}
