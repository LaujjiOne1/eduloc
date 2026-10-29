import { useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/motion/pressable-scale";
import { Chip } from "@/components/ui/chip";
import { RadioCard } from "@/components/ui/selectable-card";
import type { LevelsState } from "@/hooks/use-levels";
import { groupLevels } from "@/lib/search-funnel";
import type { EducationLevel } from "@/types/search";

type LevelStepProps = {
  state: LevelsState;
  selectedId: string | null;
  /** Cycle proposé d'emblée quand aucun niveau n'est choisi (arrivée depuis un parcours de l'accueil). */
  initialBlockId?: string | null;
  onRetry: () => void;
  onSelect: (level: EducationLevel) => void;
};

/**
 * Niveau en deux gestes : le cycle (Primaire, Collège, Lycée, Licence, Master, Doctorat) en pastilles, puis le niveau
 * précis. Les cycles scolaires et universitaires sont déjà séparés par le catalogue : pas de question « scolaire ou
 * universitaire » en plus.
 */
export function LevelStep({ state, selectedId, initialBlockId = null, onRetry, onSelect }: LevelStepProps) {
  const { t } = useTranslation();
  const blocks = state.status === "success" ? groupLevels(state.levels) : [];
  const selectedBlockId = blocks.find((b) => b.levels.some((l) => l.id === selectedId))?.id ?? null;
  const [pickedBlockId, setPickedBlockId] = useState<string | null>(null);
  const blockId = pickedBlockId ?? selectedBlockId ?? initialBlockId;
  const block = blocks.find((b) => b.id === blockId);

  if (state.status === "loading") {
    return (
      <View className="gap-[10px]">
        <View className="flex-row flex-wrap gap-2">
          {[76, 92, 64, 84, 72].map((width) => (
            <View key={width} className="h-[38px] rounded-full bg-line-soft" style={{ width }} />
          ))}
        </View>
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View className="flex-row items-center gap-3">
        <Text className="flex-1 text-[13.5px] text-error">{state.message}</Text>
        <PressableScale onPress={onRetry} accessibilityLabel={t("common.tryLoadingTheLevelsAgain")}>
          <Text className="text-[13.5px] font-semibold text-primary">{t("common.tryAgain")}</Text>
        </PressableScale>
      </View>
    );
  }

  if (blocks.length === 0) {
    return <Text className="text-[13.5px] text-ink-faint">{t("common.noLevelsAvailableAtThe")}</Text>;
  }

  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap gap-2">
        {blocks.map((b) => (
          <Chip key={b.id} label={b.label} active={b.id === blockId} onPress={() => setPickedBlockId(b.id)} />
        ))}
      </View>

      {block ? (
        <View className="gap-[8px]">
          {block.levels.map((level) => (
            <RadioCard key={level.id} label={level.label} selected={level.id === selectedId} onPress={() => onSelect(level)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
