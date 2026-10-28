import { useState } from "react";
import { Modal, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { XIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { Button } from "@/components/ui/button";
import { TimeRangeWheelPicker } from "@/components/ui/time-range-wheel-picker";
import type { LocationFormatId } from "@/types/common";
import { useTranslation } from "react-i18next";
import { t as tr } from "@/i18n";

export type SlotValue = { startTime: string; endTime: string; format: LocationFormatId };

/** « 09:30 » → « 10:30 » (borné à 23:45, la dernière position des roues). */
function addOneHour(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return hours >= 23 ? "23:45" : `${String(hours + 1).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const FORMAT_OPTIONS: { id: LocationFormatId; label: string }[] = [
  { id: "both", get label() { return tr("availability.slotModal.inPersonOnline"); } },
  { id: "in_person", get label() { return tr("availability.slotModal.inPersonOnly"); } },
  { id: "online", get label() { return tr("availability.slotModal.onlineOnly"); } },
];

type SlotModalProps = {
  /** « Jeudi, chaque semaine » / « Jeudi 15 oct. · une seule fois » */
  subtitle?: string;
  /** Onboarding : le tuteur choisit le format ; tableau de bord : le format découle du lieu (masqué). */
  showFormat?: boolean;
  onClose: () => void;
  onSave: (slot: SlotValue) => void;
};

/**
 * Fenêtre « Ajouter un créneau » : roues d'heures (début → fin) et, selon l'écran, le format d'enseignement.
 * Commune à l'onboarding du tuteur et à l'ajout de créneau du tableau de bord. À monter à l'ouverture
 * (le parent ne l'affiche que lorsqu'un créneau est en cours d'ajout) : l'état repart de zéro à chaque fois.
 */
export function SlotModal({ subtitle, showFormat = true, onClose, onSave }: SlotModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [startTime, setStartTime] = useState("14:00");
  const [endTime, setEndTime] = useState("17:00");
  const [format, setFormat] = useState<LocationFormatId>("both");
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (endTime <= startTime) {
      setError(t("common.theEndTimeMustBe"));
      return;
    }
    onSave({ startTime, endTime, format });
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="rounded-t-2xl bg-surface p-5" style={{ paddingBottom: Math.max(insets.bottom, 24) }}>
          <View className="mb-1 flex-row items-center justify-between">
            <Text className="flex-1 pr-3 text-[18px] font-bold text-ink">{t("availability.slotModal.addASlot")}</Text>
            <PressableScale onPress={onClose} accessibilityLabel={t("common.close")}>
              <View className="h-8 w-8 items-center justify-center rounded-full bg-paper">
                <XIcon size={16} color="#585B78" />
              </View>
            </PressableScale>
          </View>
          {subtitle ? <Text className="mb-4 text-[13px] text-ink-soft">{subtitle}</Text> : <View className="mb-3" />}

          {/* Heures : roues de sélection (début / fin), pas de saisie au clavier */}
          <View className="mb-4">
            <TimeRangeWheelPicker
              startTime={startTime}
              endTime={endTime}
              onChangeStart={(time) => {
                setStartTime(time);
                // La fin suit le début : toujours au moins une heure après (dans la limite de la journée).
                if (endTime <= time) setEndTime(addOneHour(time));
                setError(null);
              }}
              onChangeEnd={(time) => {
                setEndTime(time);
                setError(null);
              }}
            />
          </View>

          {showFormat ? (
            <>
              <Text className="mb-2 text-[12px] font-semibold text-ink-soft">{t("availability.slotModal.teachingFormat")}</Text>
              <View className="mb-3 flex-row gap-2">
                {FORMAT_OPTIONS.map((option) => (
                  <PressableScale key={option.id} onPress={() => setFormat(option.id)} accessibilityLabel={option.label} style={{ flex: 1 }}>
                    <View
                      className={[
                        "items-center justify-center rounded-lg border p-2",
                        format === option.id ? "border-primary bg-primary-tint/30" : "border-line bg-paper",
                      ].join(" ")}
                    >
                      <Text className={["text-center text-[11px] font-bold", format === option.id ? "text-primary" : "text-ink-soft"].join(" ")}>
                        {option.label}
                      </Text>
                    </View>
                  </PressableScale>
                ))}
              </View>
            </>
          ) : null}

          <Text className="mb-3 min-h-[18px] text-[12.5px] text-error">{error ?? ""}</Text>
          <Button label={t("availability.slotModal.confirmTimeRange")} onPress={save} />
        </View>
      </View>
    </Modal>
  );
}
