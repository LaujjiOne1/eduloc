import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { useRingtone } from "@/hooks/use-ringtone";
import { routeForNotification } from "@/lib/notification-routing";
import { useRealtimeEvent } from "@/realtime/use-realtime-event";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "react-i18next";

type Alarm = { bookingId: string; minutes: number };

/** L'alarme sonne quelques secondes puis se tait : elle ne doit pas gêner pendant la préparation du cours. */
const ALARM_MS = 12_000;

/**
 * Alarme de cours (événement temps réel `booking.reminder`, envoyé selon le paramètre du compte) : sonnerie courte
 * avec vibration et bandeau « Voir le cours » sur tous les écrans. App fermée ou en arrière-plan : push du serveur.
 */
export function LessonAlarmBanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [alarm, setAlarm] = useState<Alarm | null>(null);

  const dismiss = useCallback(() => setAlarm(null), []);

  useRealtimeEvent(["booking.reminder"], (event) => {
    const bookingId = typeof event.payload.bookingId === "string" ? event.payload.bookingId : event.aggregateId;
    const minutes = typeof event.payload.minutes === "number" ? event.payload.minutes : 0;
    if (bookingId) setAlarm({ bookingId, minutes });
  });

  useEffect(() => {
    if (!alarm) return;
    const timer = setTimeout(dismiss, ALARM_MS);
    return () => clearTimeout(timer);
  }, [alarm, dismiss]);

  useRingtone(!!alarm, { vibrate: true });

  if (!alarm) return null;

  const open = () => {
    const route = routeForNotification({ type: "booking.reminder", bookingId: alarm.bookingId }, useAuthStore.getState().activeMode);
    dismiss();
    if (route) router.push(route);
  };
  const when = alarm.minutes >= 60 ? "dans 1 h" : alarm.minutes <= 1 ? "maintenant" : t("call.lessonAlarmBanner.inMin", { minutes: alarm.minutes });

  return (
    <View accessibilityRole="alert" className="absolute left-4 right-4 z-50 gap-3 rounded-xl bg-ink p-4" style={{ top: insets.top + 8 }}>
      <View>
        <Text className="text-[15px] font-bold text-white">{t("call.lessonAlarmBanner.yourLessonStarts", { when })}</Text>
        <Text className="text-[13px] text-white/70">{t("call.lessonAlarmBanner.getReadyTheLessonAlarm")}</Text>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button label={t("call.lessonAlarmBanner.stop")} variant="secondary" onPress={dismiss} />
        </View>
        <View className="flex-1">
          <Button label={t("call.lessonAlarmBanner.viewTheLesson")} onPress={open} />
        </View>
      </View>
    </View>
  );
}
