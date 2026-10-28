import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SearchIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { RadioCard } from "@/components/ui/selectable-card";
import { StepProgress } from "@/components/ui/step-progress";
import { type TracksState, useTracks } from "@/hooks/use-tracks";
import { funnelSteps } from "@/lib/search-funnel";
import { useSearchWizardStore } from "@/store/search-wizard.store";
import type { AcademicTrack } from "@/types/track";
import { useTranslation } from "react-i18next";
import { t as tr } from "@/i18n";

const LEVEL_ROUTE = "/search" as Href;
const SUBJECT_ROUTE = "/search/subject" as Href;
const SUMMARY_ROUTE = "/search/summary" as Href;

const PROGRAMME_LABELS = { get nouveau() { return tr("search.track.newProgramme"); }, get ancien() { return tr("search.track.oldProgramme"); } } as const;

/**
 * Étape 2 de l'entonnoir, adaptative : série du lycée (Première, Terminale) ou mention universitaire. Le Domaine mère
 * d'une mention reste invisible : le serveur le retrouve pour rapprocher la demande des tuteurs.
 */
export function TrackScreen() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const level = useSearchWizardStore((s) => s.criteria.level);
  const selectedTrack = useSearchWizardStore((s) => s.criteria.track);
  const setTrack = useSearchWizardStore((s) => s.setTrack);
  const { state, retry } = useTracks(level?.trackKind ?? null, level?.label);
  const [query, setQuery] = useState("");
  const [isNavigating, setIsNavigating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIsNavigating(false);
    }, []),
  );

  // Guard : cette étape n'existe que pour un niveau qui demande une filière (sinon retour au choix du niveau).
  const hasContext = !!level?.trackKind;
  useEffect(() => {
    if (!hasContext) router.replace(LEVEL_ROUTE);
  }, [hasContext, router]);

  if (!level || !level.trackKind) return null;

  const isSerie = level.trackKind === "serie";
  const steps = funnelSteps(level);

  const continueFunnel = () => {
    if (isNavigating || !selectedTrack) return;
    setIsNavigating(true);
    const { subject } = useSearchWizardStore.getState().criteria;
    router.push(from === "summary" && subject ? SUMMARY_ROUTE : SUBJECT_ROUTE);
  };

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      <StepProgress step={steps.track} total={steps.total} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={40}>
          <Text className="mb-1 text-[26px] font-bold text-ink">
            {isSerie ? tr("search.track.whatIsYourTrack") : tr("search.track.whatIsYourDegreeProgramme")}
          </Text>
          <Text className="mb-5 text-[14px] text-ink-soft">{level.label}</Text>
        </FadeIn>

        {isSerie ? null : (
          <FadeIn delay={80}>
            <View className="mb-[18px] flex-row items-center gap-[10px] rounded-sm border border-line bg-surface px-[14px] py-[13px]">
              <SearchIcon size={17} color="#9799AF" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={tr("search.track.searchForADegreeProgramme")}
                placeholderTextColor="#9799AF"
                className="flex-1 text-[15px] text-ink"
                accessibilityLabel={tr("search.track.searchForADegreeProgramme")}
              />
            </View>
          </FadeIn>
        )}

        <TrackList
          state={state}
          query={query}
          selectedId={selectedTrack?.id ?? null}
          grouped={isSerie}
          onRetry={retry}
          onSelect={setTrack}
        />
      </ScrollView>

      <View
        className="border-t border-line-soft bg-surface px-5 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 22) }}
      >
        <Button label={tr("common.continue")} disabled={!selectedTrack || isNavigating} onPress={continueFunnel} />
      </View>
    </View>
  );
}

type TrackListProps = {
  state: TracksState;
  query: string;
  selectedId: string | null;
  /** Séries : titres « Nouveau programme » / « Ancien programme ». */
  grouped: boolean;
  onRetry: () => void;
  onSelect: (track: AcademicTrack) => void;
};

/** Minuscules sans accents : « Maïeutique » se retrouve avec « maieutique ». */
const fold = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function TrackList({ state, query, selectedId, grouped, onRetry, onSelect }: TrackListProps) {
  const { t: tr } = useTranslation();
  if (state.status === "loading") {
    return (
      <View className="gap-[10px]">
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} className="h-[54px] rounded-lg bg-line-soft" />
        ))}
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View className="flex-row items-center gap-3">
        <Text className="flex-1 text-[13.5px] text-error">{state.message}</Text>
        <PressableScale onPress={onRetry} accessibilityLabel={tr("search.track.tryLoadingTheTracksAgain")}>
          <Text className="text-[13.5px] font-semibold text-primary">{tr("common.tryAgain")}</Text>
        </PressableScale>
      </View>
    );
  }

  if (state.status === "empty") {
    return <Text className="text-[13.5px] text-ink-faint">{tr("search.track.noTracksAvailableAtThe")}</Text>;
  }

  const q = fold(query.trim());
  const tracks = q ? state.tracks.filter((t) => fold(t.label).includes(q)) : state.tracks;
  if (tracks.length === 0) {
    return <Text className="text-[13.5px] text-ink-faint">{tr("search.track.noDegreeProgrammeMatches", { trim: query.trim() })}</Text>;
  }

  const groups = grouped
    ? (["nouveau", "ancien"] as const)
        .map((programme) => ({ title: PROGRAMME_LABELS[programme], items: tracks.filter((t) => t.programme === programme) }))
        .filter((g) => g.items.length > 0)
    : [{ title: null, items: tracks }];

  return (
    <View className="gap-[16px]">
      {groups.map((group) => (
        <View key={group.title ?? "all"}>
          {group.title ? (
            <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
              {group.title}
            </Text>
          ) : null}
          <View className="gap-[10px]">
            {group.items.map((track, index) => (
              <FadeIn key={track.id} delay={90 + Math.min(index, 8) * 30}>
                <RadioCard label={track.label} selected={track.id === selectedId} onPress={() => onSelect(track)} />
              </FadeIn>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
