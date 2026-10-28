import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { useRingtone } from "@/hooks/use-ringtone";
import { routeForNotification } from "@/lib/notification-routing";
import { showWebAlert } from "@/lib/web-alerts";
import { useRealtimeEvent } from "@/realtime/use-realtime-event";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "react-i18next";

type Incoming = {
  callId: string;
  bookingId: string | null;
  recipientRole: "TUTOR" | "REQUESTER";
  type: "AUDIO" | "VIDEO";
  callerName: string;
};

/** Le serveur sonne 45 s (ringingUntil) : au-delà, l'appel est manqué. */
const RING_MS = 45_000;

const callRoute = (call: Incoming) =>
  routeForNotification(
    { type: "call.incoming", bookingId: call.bookingId, callId: call.callId, recipientRole: call.recipientRole },
    useAuthStore.getState().activeMode,
  );

/**
 * Appel entrant (événement temps réel `call.incoming`) : la sonnerie joue en boucle avec vibration,
 * un bandeau « Répondre / Ignorer » s'affiche sur tous les écrans et, si l'onglet est masqué, le navigateur
 * émet une alerte système. (App fermée / en arrière-plan sur mobile : notification push du serveur.)
 */
export function IncomingCallBanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const closeWebAlert = useRef<() => void>(() => undefined);

  const dismiss = useCallback(() => {
    closeWebAlert.current();
    setIncoming(null);
  }, []);

  const answer = useCallback(
    (call: Incoming | null) => {
      const route = call ? callRoute(call) : null;
      dismiss();
      if (route) router.push(route);
    },
    [dismiss, router],
  );

  useRealtimeEvent(["call."], (event) => {
    if (event.type === "call.incoming") {
      const p = event.payload as Partial<Incoming>;
      if (!p.callId) return;
      const call: Incoming = {
        callId: p.callId,
        bookingId: p.bookingId ?? null,
        recipientRole: p.recipientRole === "TUTOR" ? "TUTOR" : "REQUESTER",
        type: p.type === "VIDEO" ? "VIDEO" : "AUDIO",
        callerName: p.callerName || t("call.incomingCallBanner.yourContact"),
      };
      setIncoming(call);
      closeWebAlert.current();
      closeWebAlert.current = showWebAlert({
        title: call.callerName,
        body: call.type === "VIDEO" ? t("call.incomingCallBanner.incomingVideoCall") : t("call.incomingCallBanner.incomingAudioCall"),
        tag: call.callId,
        persistent: true,
        onClick: () => answer(call),
      });
    } else if (event.type === "call.ended" || event.type === "call.missed") {
      dismiss();
    }
  });

  useEffect(() => {
    if (!incoming) return;
    const timer = setTimeout(dismiss, RING_MS);
    return () => clearTimeout(timer);
  }, [incoming, dismiss]);

  const visible = !!incoming && !!callRoute(incoming);
  useRingtone(visible, { vibrate: true });

  if (!incoming || !visible) return null;

  return (
    <View
      accessibilityRole="alert"
      className="absolute left-4 right-4 z-50 gap-3 rounded-xl bg-ink p-4"
      style={{ top: insets.top + 8 }}
    >
      <View>
        <Text className="text-[15px] font-bold text-white">{incoming.callerName}</Text>
        <Text className="text-[13px] text-white/70">
          {incoming.type === "VIDEO" ? t("call.incomingCallBanner.incomingVideoCall") : t("call.incomingCallBanner.incomingAudioCall")}
        </Text>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button label={t("call.incomingCallBanner.ignore")} variant="secondary" onPress={dismiss} />
        </View>
        <View className="flex-1">
          <Button label={t("call.incomingCallBanner.answer")} onPress={() => answer(incoming)} />
        </View>
      </View>
    </View>
  );
}
