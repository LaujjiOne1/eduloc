import { useState } from "react";
import { Text, View } from "react-native";

import { TrashIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { FormError } from "@/components/ui/form-error";
import { TextField } from "@/components/ui/text-field";
import { usePartnerAction } from "@/hooks/use-partner-action";
import { weekdayNames } from "@/i18n/dates";
import { PartnerService } from "@/services/partner.service";
import type { RoomOpening } from "@/types/partner";
import { useTranslation } from "react-i18next";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Lundi → dimanche, comme un calendrier français (les valeurs sont celles du serveur : 0 = dimanche). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

type Draft = { dayOfWeek: number; startTime: string; endTime: string };

type RoomOpeningsEditorProps = {
  roomId: string;
  initial: RoomOpening[];
  /** Fiche en rejet : plus de modification possible. */
  disabled?: boolean;
  onSaved: () => void;
};

/**
 * Horaires d'ouverture d'une salle (par jour de la semaine). Enregistrer REMPLACE toutes les plages. Une modification
 * n'annule jamais une séance confirmée : le serveur indique seulement combien sortent des nouvelles plages.
 */
export function RoomOpeningsEditor({ roomId, initial, disabled, onSaved }: RoomOpeningsEditorProps) {
  const { t } = useTranslation();
  const { busy, error, run, clearError } = usePartnerAction();
  const [drafts, setDrafts] = useState<Draft[]>(() => initial.map((o) => ({ dayOfWeek: o.dayOfWeek, startTime: o.startTime, endTime: o.endTime })));
  const [days, setDays] = useState<number[]>([]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [formError, setFormError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const toggleDay = (d: number) => setDays((c) => (c.includes(d) ? c.filter((x) => x !== d) : [...c, d]));

  const add = () => {
    setFormError(null);
    setNotice(null);
    if (days.length === 0) return setFormError(t("partner.roomOpeningsEditor.chooseAtLeastOneDay"));
    if (!HHMM.test(start) || !HHMM.test(end)) return setFormError(t("partner.roomOpeningsEditor.timesMustUseTheHh"));
    if (end <= start) return setFormError(t("partner.roomOpeningsEditor.theClosingTimeMustBe"));
    const next = [...drafts];
    for (const dayOfWeek of days) {
      const overlaps = next.some((d) => d.dayOfWeek === dayOfWeek && d.startTime < end && d.endTime > start);
      if (overlaps) return setFormError(t("partner.roomOpeningsEditor.thisRangeOverlapsAnExisting", { value: weekdayNames()[dayOfWeek] }));
      next.push({ dayOfWeek, startTime: start, endTime: end });
    }
    setDrafts(next);
    setDays([]);
    setDirty(true);
  };

  const remove = (index: number) => {
    setDrafts((c) => c.filter((_, i) => i !== index));
    setDirty(true);
    setNotice(null);
  };

  const save = async () => {
    clearError();
    const result = await run("openings", () => PartnerService.replaceOpenings(roomId, drafts), t("partner.roomOpeningsEditor.unableToSaveTheOpening"));
    if (!result) return;
    setDirty(false);
    setNotice(
      result.uncoveredConfirmedBookings > 0
        ? t("partner.roomOpeningsEditor.confirmedSessionSFallOutside", { uncoveredConfirmedBookings: result.uncoveredConfirmedBookings })
        : t("partner.roomOpeningsEditor.openingHoursSaved"),
    );
    onSaved();
  };

  const sorted = drafts
    .map((d, index) => ({ ...d, index }))
    .sort((a, b) => WEEK_ORDER.indexOf(a.dayOfWeek) - WEEK_ORDER.indexOf(b.dayOfWeek) || a.startTime.localeCompare(b.startTime));

  return (
    <View>
      {sorted.length === 0 ? (
        <Text className="mb-3 text-[13.5px] text-ink-soft">{t("partner.roomOpeningsEditor.noOpeningHoursTheRoom")}</Text>
      ) : (
        <View className="mb-3 rounded-lg border border-line bg-surface px-4">
          {sorted.map((d, i) => (
            <View key={`${d.dayOfWeek}-${d.startTime}-${d.index}`} className={["flex-row items-center py-3", i > 0 ? "border-t border-line-soft" : ""].join(" ")}>
              <Text className="flex-1 text-[14px] font-semibold text-ink">
                {weekdayNames()[d.dayOfWeek]} · {d.startTime} → {d.endTime}
              </Text>
              {disabled ? null : (
                <PressableScale onPress={() => remove(d.index)} accessibilityLabel={t("partner.roomOpeningsEditor.delete", { value: weekdayNames()[d.dayOfWeek], startTime: d.startTime })}>
                  <TrashIcon size={16} color="#AC4A40" />
                </PressableScale>
              )}
            </View>
          ))}
        </View>
      )}

      {disabled ? null : (
        <View className="rounded-lg border border-line bg-paper-alt p-4">
          <Text className="mb-2 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{t("partner.roomOpeningsEditor.addATimeRange")}</Text>
          <View className="mb-3 flex-row flex-wrap gap-2">
            {WEEK_ORDER.map((d) => (
              <Chip key={d} label={weekdayNames()[d].slice(0, 3)} active={days.includes(d)} onPress={() => toggleDay(d)} />
            ))}
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <TextField label={t("partner.roomOpeningsEditor.opening")} value={start} onChangeText={setStart} placeholder="09:00" keyboardType="numbers-and-punctuation" />
            </View>
            <View className="flex-1">
              <TextField label={t("partner.roomOpeningsEditor.closing")} value={end} onChangeText={setEnd} placeholder="17:00" keyboardType="numbers-and-punctuation" />
            </View>
          </View>
          {formError ? (
            <View className="mb-3">
              <FormError message={formError} />
            </View>
          ) : null}
          <Button label={t("common.add")} variant="secondary" size="sm" onPress={add} />
        </View>
      )}

      {error ? (
        <View className="mt-3">
          <FormError message={error} />
        </View>
      ) : null}
      {notice ? <Text className="mt-3 text-[13px] leading-[19px] text-ink-soft">{notice}</Text> : null}
      {disabled ? null : (
        <View className="mt-3">
          <Button label={t("partner.roomOpeningsEditor.saveOpeningHours")} loading={busy === "openings"} loadingLabel={t("common.saving")} disabled={!dirty || busy !== null} onPress={save} />
        </View>
      )}
    </View>
  );
}
