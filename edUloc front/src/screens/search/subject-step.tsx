import type { ComponentType } from "react";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";

import {
  FinanceIcon,
  GraduationCapIcon,
  type IconProps,
  LanguagesIcon,
  LevelIcon,
  ScienceIcon,
  SearchIcon,
  SubjectIcon,
} from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { MenuCard } from "@/components/ui/selectable-card";
import type { SubjectsState } from "@/hooks/use-subjects";
import type { Category } from "@/types/category";

/** Minuscules, sans accents ni ponctuation : « Algèbre-Linéaire » ≡ « algebre lineaire ». */
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// "programming" reuses SubjectIcon and "math" reuses LevelIcon — those generic icons already match the exact glyphs
// used for these two categories in the reference design.
const SUBJECT_ICONS: Record<string, ComponentType<IconProps>> = {
  programming: SubjectIcon,
  math: LevelIcon,
  languages: LanguagesIcon,
  finance: FinanceIcon,
  sciences: ScienceIcon,
  methodology: GraduationCapIcon,
};

type SubjectStepProps = {
  state: SubjectsState;
  /** Université : la matière peut être saisie librement (« Analyse 2 », « Transformées de Fourier »…). */
  freeText: boolean;
  onRetry: () => void;
  onSelect: (subject: Category) => void;
};

export function SubjectStep({ state, freeText, onRetry, onSelect }: SubjectStepProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const typed = query.trim();
  const catalog = state.status === "success" ? state.categories : [];
  // Une saisie qui correspond exactement à une matière connue choisit celle-ci ; sinon elle est conservée telle quelle
  // et le serveur la rapproche des tuteurs (recherche « pour moi », connecté).
  const exact = typed ? catalog.find((c) => normalize(c.label) === normalize(typed)) : undefined;
  const chooseTyped = () => {
    if (exact) return onSelect(exact);
    onSelect({
      id: `free:${normalize(typed)}`,
      label: typed.charAt(0).toLocaleUpperCase("fr") + typed.slice(1),
      group: null,
      freeText: true,
    });
  };

  if (state.status === "loading") {
    return (
      <View className="gap-[10px]">
        {[0, 1, 2, 3].map((i) => (
          <View key={i} className="h-[70px] rounded-lg bg-line-soft" />
        ))}
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View className="flex-row items-center gap-3">
        <Text className="flex-1 text-[13.5px] text-error">{state.message}</Text>
        <PressableScale onPress={onRetry} accessibilityLabel={t("search.need.tryLoadingTheSubjectsAgain")}>
          <Text className="text-[13.5px] font-semibold text-primary">{t("common.tryAgain")}</Text>
        </PressableScale>
      </View>
    );
  }

  if (state.status === "empty") {
    return <Text className="text-[13.5px] text-ink-faint">{t("search.need.noSubjectsAvailableForThis")}</Text>;
  }

  const q = typed.toLowerCase();
  const subjects = q ? state.categories.filter((c) => c.label.toLowerCase().includes(q)) : state.categories;

  return (
    <View>
      <View className="mb-4 flex-row items-center gap-[10px] rounded-sm border border-line bg-surface px-[14px] py-[13px]">
        <SearchIcon size={17} color="#9799AF" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={freeText ? t("search.need.searchOrTypeACourse") : t("search.need.searchForASubject")}
          placeholderTextColor="#9799AF"
          className="flex-1 text-[15px] text-ink"
          accessibilityLabel={t("search.need.searchForASubject")}
        />
      </View>

      {subjects.length === 0 && !(freeText && typed.length >= 2) ? (
        <Text className="text-[13.5px] text-ink-faint">{t("search.need.noSubjectMatches", { trim: typed })}</Text>
      ) : (
        <View className="gap-[8px]">
          {subjects.map((subject, index) => {
            const Icon = SUBJECT_ICONS[subject.id] ?? SubjectIcon;
            return (
              <FadeIn key={subject.id} delay={Math.min(index, 8) * 25}>
                <MenuCard icon={<Icon size={19} color="#332E86" />} title={subject.label} onPress={() => onSelect(subject)} />
              </FadeIn>
            );
          })}

          {freeText && typed.length >= 2 && !exact ? (
            <FadeIn>
              <MenuCard
                icon={<SearchIcon size={19} color="#332E86" />}
                title={t("search.need.searchFor", { typed })}
                description={t("search.need.mySubjectIsNotIn")}
                onPress={chooseTyped}
                accessibilityLabel={t("search.need.searchForTheTypedSubject", { typed })}
              />
            </FadeIn>
          ) : null}
        </View>
      )}
    </View>
  );
}
