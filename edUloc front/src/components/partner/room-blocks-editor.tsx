import { useState } from "react";
import { Text, View } from "react-native";

import { localToUtcIso } from "@/api/format/datetime";
import { TrashIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { TextField } from "@/components/ui/text-field";
import { usePartnerAction } from "@/hooks/use-partner-action";
import { PartnerService } from "@/services/partner.service";
import type { RoomBlock } from "@/types/partner";
import { useTranslation } from "react-i18next";
import { t as translate } from "@/i18n";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

type RoomBlocksEditorProps = {
  roomId: string;
  blocks: RoomBlock[];
  onChanged: () => void;
};

/**
 * Fermetures ponctuelles (travaux, événement…). Le serveur refuse une fermeture qui chevauche une séance déjà
 * confirmée : elle ne serait jamais annulée en silence.
 */
export function RoomBlocksEditor({ roomId, blocks, onChanged }: RoomBlocksEditorProps) {
  const { t } = useTranslation();
  const { busy, error, run, clearError } = usePartnerAction();
  const [date, setDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const add = async () => {
    setFormError(null);
    clearError();
    if (!DATE.test(date)) return setFormError(t("partner.roomBlocksEditor.theDateMustUseThe"));
    if (!HHMM.test(start) || !HHMM.test(end)) return setFormError(t("partner.roomBlocksEditor.timesMustUseTheHh"));
    if (end <= start) return setFormError(t("common.theEndTimeMustBe"));
    const created = await run(
      "add",
      () => PartnerService.addBlock(roomId, { startAt: localToUtcIso(date, start), endAt: localToUtcIso(date, end), reason: reason.trim() || undefined }),
      t("partner.roomBlocksEditor.unableToAddThisClosure"),
    );
    if (created) {
      setDate("");
      setReason("");
      onChanged();
    }
  };

  const remove = async (blockId: string) => {
    const ok = await run(`rm-${blockId}`, () => PartnerService.removeBlock(roomId, blockId).then(() => true), t("partner.roomBlocksEditor.unableToDeleteThisClosure"));
    if (ok) onChanged();
  };

  return (
    <View>
      {blocks.length === 0 ? (
        <Text className="mb-3 text-[13.5px] text-ink-soft">{t("partner.roomBlocksEditor.noUpcomingClosures")}</Text>
      ) : (
        <View className="mb-3 rounded-lg border border-line bg-surface px-4">
          {blocks.map((b, i) => (
            <View key={b.id} className={["flex-row items-center py-3", i > 0 ? "border-t border-line-soft" : ""].join(" ")}>
              <View className="flex-1">
                <Text className="text-[14px] font-semibold text-ink">{b.label}</Text>
                {b.reason ? <Text className="text-[12.5px] text-ink-soft">{b.reason}</Text> : null}
              </View>
              <PressableScale onPress={() => remove(b.id)} disabled={busy !== null} accessibilityLabel={t("partner.roomBlocksEditor.deleteThisClosure")}>
                <TrashIcon size={16} color="#AC4A40" />
              </PressableScale>
            </View>
          ))}
        </View>
      )}

      <View className="rounded-lg border border-line bg-paper-alt p-4">
        <Text className="mb-2 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{t("partner.roomBlocksEditor.closeTheRoom")}</Text>
        <TextField label={t("common.date")} value={date} onChangeText={setDate} placeholder="2026-11-03" keyboardType="numbers-and-punctuation" autoCapitalize="none" />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label={t("partner.roomBlocksEditor.from")} value={start} onChangeText={setStart} keyboardType="numbers-and-punctuation" />
          </View>
          <View className="flex-1">
            <TextField label={translate("partner.roomBlocksEditor.to")} value={end} onChangeText={setEnd} keyboardType="numbers-and-punctuation" />
          </View>
        </View>
        <TextField label={t("common.reasonOptional")} value={reason} onChangeText={setReason} />
        {formError || error ? (
          <View className="mb-3">
            <FormError message={(formError ?? error) as string} />
          </View>
        ) : null}
        <Button label={t("partner.roomBlocksEditor.addTheClosure")} variant="secondary" size="sm" loading={busy === "add"} loadingLabel={t("common.adding")} disabled={busy !== null} onPress={add} />
      </View>
    </View>
  );
}
