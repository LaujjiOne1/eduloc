import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";

import { SearchIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { RadioCard } from "@/components/ui/selectable-card";
import type { TracksState } from "@/hooks/use-tracks";
import type { AcademicTrack } from "@/types/track";

type TrackStepProps = {
  state: TracksState;
  /** Séries (lycée) : titres « Nouveau programme » / « Ancien programme » ; mentions (université) : champ de recherche. */
  kind: "serie" | "mention";
  selectedId: string | null;
  onRetry: () => void;
  onSelect: (track: AcademicTrack) => void;
};

/** Minuscules sans accents : « Maïeutique » se retrouve avec « maieutique ». */
const fold = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Filière du niveau choisi : série du lycée (Première, Terminale) ou mention universitaire. Le Domaine mère d'une
 * mention n'est pas affiché (le serveur le retrouve pour rapprocher la demande des tuteurs) mais la recherche le prend
 * en compte.
 */
export function TrackStep({ state, kind, selectedId, onRetry, onSelect }: TrackStepProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const grouped = kind === "serie";

  const search =
    grouped || state.status !== "success" ? null : (
      <View className="mb-4 flex-row items-center gap-[10px] rounded-sm border border-line bg-surface px-[14px] py-[13px]">
        <SearchIcon size={17} color="#9799AF" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("search.track.searchForADegreeProgramme")}
          placeholderTextColor="#9799AF"
          className="flex-1 text-[15px] text-ink"
          accessibilityLabel={t("search.track.searchForADegreeProgramme")}
        />
      </View>
    );

  if (state.status === "loading") {
    return (
      <View className="gap-[10px]">
        {[0, 1, 2, 3].map((i) => (
          <View key={i} className="h-[54px] rounded-lg bg-line-soft" />
        ))}
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View className="flex-row items-center gap-3">
        <Text className="flex-1 text-[13.5px] text-error">{state.message}</Text>
        <PressableScale onPress={onRetry} accessibilityLabel={t("search.track.tryLoadingTheTracksAgain")}>
          <Text className="text-[13.5px] font-semibold text-primary">{t("common.tryAgain")}</Text>
        </PressableScale>
      </View>
    );
  }

  if (state.status === "empty") {
    return <Text className="text-[13.5px] text-ink-faint">{t("search.track.noTracksAvailableAtThe")}</Text>;
  }

  // Chaque mot saisi doit se retrouver dans le nom de la mention ou dans son domaine (« science humaine » → les mentions
  // de Sciences Humaines et Sociales), sans que le domaine s'affiche.
  const words = fold(query.trim()).split(/\s+/).filter(Boolean);
  const tracks = words.length
    ? state.tracks.filter((track) => {
        const haystack = fold(`${track.label} ${track.domain ?? ""}`);
        return words.every((word) => haystack.includes(word));
      })
    : state.tracks;
  const programmeLabels = { nouveau: t("search.track.newProgramme"), ancien: t("search.track.oldProgramme") } as const;
  const groups = grouped
    ? (["nouveau", "ancien"] as const)
        .map((programme) => ({ title: programmeLabels[programme], items: tracks.filter((track) => track.programme === programme) }))
        .filter((g) => g.items.length > 0)
    : [{ title: null, items: tracks }];

  return (
    <View>
      {search}
      {tracks.length === 0 ? (
        <Text className="text-[13.5px] text-ink-faint">{t("search.track.noDegreeProgrammeMatches", { trim: query.trim() })}</Text>
      ) : (
        <View className="gap-[16px]">
          {groups.map((group) => (
            <View key={group.title ?? "all"}>
              {group.title ? (
                <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
                  {group.title}
                </Text>
              ) : null}
              <View className="gap-[8px]">
                {group.items.map((track, index) => (
                  <FadeIn key={track.id} delay={Math.min(index, 8) * 25}>
                    <RadioCard label={track.label} selected={track.id === selectedId} onPress={() => onSelect(track)} />
                  </FadeIn>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
