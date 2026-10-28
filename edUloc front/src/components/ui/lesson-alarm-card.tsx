import { useState } from "react";
import { Switch, Text, View } from "react-native";

import { isApiError } from "@/api/errors";
import { AlarmIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { UserService } from "@/services/user.service";
import { useAuthStore } from "@/store/auth.store";
import { LESSON_ALARM_LEADS, type LessonAlarm } from "@/types/auth";
import { useTranslation } from "react-i18next";

const DEFAULT_ALARM: LessonAlarm = { enabled: true, leadMinutes: 30 };

const leadLabel = (minutes: number) => (minutes === 60 ? "1 h" : `${minutes} min`);

/**
 * Paramètre « Alarme de cours » : activée ou non, et combien de temps avant la séance. Propre à chaque compte
 * (demandeur comme tuteur) ; le serveur envoie le rappel (alarme dans l'app, notification, push) pour chaque
 * séance confirmée. Mise à jour immédiate à l'écran, annulée si le serveur refuse.
 */
export function LessonAlarmCard() {
  const { t } = useTranslation();
  const alarm = useAuthStore((s) => s.user?.lessonAlarm) ?? DEFAULT_ALARM;
  const setUser = useAuthStore((s) => s.setUser);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = async (patch: Partial<LessonAlarm>) => {
    const user = useAuthStore.getState().user;
    if (!user || saving) return;
    const previous = user;
    setError(null);
    setSaving(true);
    setUser({ ...user, lessonAlarm: { ...alarm, ...patch } });
    try {
      setUser(await UserService.updateLessonAlarm(patch));
    } catch (e) {
      setUser(previous);
      setError(isApiError(e) ? e.message : t("ui.lessonAlarmCard.unableToSaveThisSetting"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="rounded-lg border border-line bg-surface p-4">
      <View className="flex-row items-center gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-warning-tint">
          <AlarmIcon size={18} color="#BD7E28" />
        </View>
        <View className="flex-1">
          <Text className="text-[14.5px] font-bold text-ink">{t("ui.lessonAlarmCard.lessonAlarm")}</Text>
          <Text className="mt-0.5 text-[12.5px] leading-[18px] text-ink-soft">
            {t("ui.lessonAlarmCard.aReminderRingsBeforeEach")}</Text>
        </View>
        <Switch
          value={alarm.enabled}
          disabled={saving}
          onValueChange={(enabled) => void update({ enabled })}
          trackColor={{ false: "#D9D7CF", true: "#332E86" }}
          thumbColor="#FFFFFF"
          accessibilityLabel={t("ui.lessonAlarmCard.turnOnTheLessonAlarm")}
        />
      </View>

      {alarm.enabled ? (
        <View className="mt-4 border-t border-line-soft pt-3.5">
          <Text className="mb-2 text-[12.5px] font-semibold text-ink-soft">{t("ui.lessonAlarmCard.remindMe")}</Text>
          <View className="flex-row flex-wrap gap-2">
            {LESSON_ALARM_LEADS.map((minutes) => {
              const active = alarm.leadMinutes === minutes;
              return (
                <PressableScale
                  key={minutes}
                  onPress={() => void update({ leadMinutes: minutes })}
                  disabled={saving}
                  accessibilityLabel={t("ui.lessonAlarmCard.remindMeBeforeTheLesson", { leadLabel: leadLabel(minutes) })}
                  accessibilityState={{ selected: active }}
                >
                  <View className={["rounded-full border px-4 py-2", active ? "border-primary bg-primary" : "border-line bg-surface"].join(" ")}>
                    <Text className={["text-[13px] font-semibold", active ? "text-white" : "text-ink-soft"].join(" ")}>
                      {t("ui.lessonAlarmCard.before", { leadLabel: leadLabel(minutes) })}</Text>
                  </View>
                </PressableScale>
              );
            })}
          </View>
        </View>
      ) : null}

      {error ? <Text className="mt-3 text-[12.5px] text-error">{error}</Text> : null}
    </View>
  );
}
