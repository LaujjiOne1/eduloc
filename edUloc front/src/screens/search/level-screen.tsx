import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChevronRightIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { RadioCard } from "@/components/ui/selectable-card";
import { StepProgress } from "@/components/ui/step-progress";
import { type LevelsState, useLevels } from "@/hooks/use-levels";
import { type LevelBlock, funnelSteps, groupLevels } from "@/lib/search-funnel";
import { useSearchWizardStore } from "@/store/search-wizard.store";
import type { EducationLevel } from "@/types/search";
import { useTranslation } from "react-i18next";

const TRACK_ROUTE = "/search/track" as Href;
const SUBJECT_ROUTE = "/search/subject" as Href;
const SUMMARY_ROUTE = "/search/summary" as Href;

/** Étape 1 de l'entonnoir : un bloc parent se déplie pour choisir le niveau précis (choix unique). */
export function LevelScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { state, retry } = useLevels();
  const selectedLevel = useSearchWizardStore((s) => s.criteria.level);
  const setLevel = useSearchWizardStore((s) => s.setLevel);
  const [openBlockId, setOpenBlockId] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIsNavigating(false);
    }, []),
  );

  const steps = funnelSteps(selectedLevel);
  const blocks = state.status === "success" ? groupLevels(state.levels) : [];
  // Au retour sur l'écran, le bloc du niveau déjà choisi reste ouvert.
  const openId = openBlockId ?? blocks.find((b) => b.levels.some((l) => l.id === selectedLevel?.id))?.id ?? null;

  /** Filière si le niveau en demande une, sinon matière ; depuis le récapitulatif, on y revient dès que tout est renseigné. */
  const continueFunnel = () => {
    if (isNavigating || !selectedLevel) return;
    setIsNavigating(true);
    const { track, subject } = useSearchWizardStore.getState().criteria;
    if (from === "summary" && subject && (!selectedLevel.trackKind || track)) {
      router.push(SUMMARY_ROUTE);
    } else if (selectedLevel.trackKind) {
      router.push(TRACK_ROUTE);
    } else {
      router.push(SUBJECT_ROUTE);
    }
  };

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      <StepProgress step={steps.level} total={steps.total} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={40}>
          <Text className="mb-1 text-[26px] font-bold text-ink">{t("search.level.whatIsTheStudyLevel")}</Text>
          <Text className="mb-5 text-[14px] text-ink-soft">{t("search.level.chooseALevelThenSpecify")}</Text>
        </FadeIn>

        <LevelBlocks
          state={state}
          blocks={blocks}
          openId={openId}
          selectedId={selectedLevel?.id ?? null}
          onToggle={(id) => setOpenBlockId(openId === id ? "" : id)}
          onRetry={retry}
          onSelect={setLevel}
        />
      </ScrollView>

      <View
        className="border-t border-line-soft bg-surface px-5 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 22) }}
      >
        <Button label={t("common.continue")} disabled={!selectedLevel || isNavigating} onPress={continueFunnel} />
      </View>
    </View>
  );
}

type LevelBlocksProps = {
  state: LevelsState;
  blocks: LevelBlock[];
  openId: string | null;
  selectedId: string | null;
  onToggle: (blockId: string) => void;
  onRetry: () => void;
  onSelect: (level: EducationLevel) => void;
};

function LevelBlocks({ state, blocks, openId, selectedId, onToggle, onRetry, onSelect }: LevelBlocksProps) {
  const { t } = useTranslation();
  if (state.status === "loading") {
    return (
      <View className="gap-[10px]">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} className="h-[58px] rounded-lg bg-line-soft" />
        ))}
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

  if (state.status === "empty" || blocks.length === 0) {
    return <Text className="text-[13.5px] text-ink-faint">{t("common.noLevelsAvailableAtThe")}</Text>;
  }

  return (
    <View className="gap-[10px]">
      {blocks.map((block, index) => {
        const isOpen = block.id === openId;
        const chosen = block.levels.find((l) => l.id === selectedId);
        return (
          <FadeIn key={block.id} delay={90 + index * 40}>
            <View className={["overflow-hidden rounded-lg border bg-surface", chosen ? "border-primary" : "border-line"].join(" ")}>
              <PressableScale
                onPress={() => onToggle(block.id)}
                accessibilityLabel={t(isOpen ? "search.level.collapseBlock" : "search.level.expandBlock", { label: block.label })}
              >
                <View className="flex-row items-center gap-3 p-4">
                  <Text className="flex-1 text-[15.5px] font-bold text-ink">{block.label}</Text>
                  {chosen ? (
                    <View className="rounded-full bg-primary-tint px-2.5 py-0.5">
                      <Text className="text-[12px] font-bold text-primary">{chosen.label}</Text>
                    </View>
                  ) : null}
                  <View style={{ transform: [{ rotate: isOpen ? "90deg" : "0deg" }] }}>
                    <ChevronRightIcon size={17} color="#9799AF" />
                  </View>
                </View>
              </PressableScale>

              {isOpen ? (
                <FadeIn delay={0}>
                  <View className="gap-[8px] border-t border-line-soft bg-paper p-3">
                    {block.levels.map((level) => (
                      <RadioCard
                        key={level.id}
                        label={level.label}
                        selected={level.id === selectedId}
                        onPress={() => onSelect(level)}
                      />
                    ))}
                  </View>
                </FadeIn>
              ) : null}
            </View>
          </FadeIn>
        );
      })}
    </View>
  );
}
