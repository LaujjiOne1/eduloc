import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
import { AuthHeader } from "@/components/ui/auth-header";
import { MenuCard } from "@/components/ui/selectable-card";
import { StepProgress } from "@/components/ui/step-progress";
import { type SubjectsState, useSubjects } from "@/hooks/use-subjects";
import { allowsFreeTextSubject, funnelSteps, subjectsFor } from "@/lib/search-funnel";
import { useSearchWizardStore } from "@/store/search-wizard.store";
import type { Category } from "@/types/category";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";

/** Minuscules, sans accents ni ponctuation : « Algèbre-Linéaire » ≡ « algebre lineaire ». */
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const LEVEL_ROUTE = "/search" as Href;
const SUMMARY_ROUTE = "/search/summary" as Href;

// "programming" reuses SubjectIcon and "math" reuses LevelIcon — those
// generic icons already match the exact glyphs used for these two
// categories in the reference design.
const SUBJECT_ICONS: Record<string, ComponentType<IconProps>> = {
  programming: SubjectIcon,
  math: LevelIcon,
  languages: LanguagesIcon,
  finance: FinanceIcon,
  sciences: ScienceIcon,
  methodology: GraduationCapIcon,
};

export function NeedScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state: catalogState, retry } = useSubjects();
  const level = useSearchWizardStore((s) => s.criteria.level);
  const track = useSearchWizardStore((s) => s.criteria.track);
  const setSubject = useSearchWizardStore((s) => s.setSubject);
  const [query, setQuery] = useState("");
  const [isNavigating, setIsNavigating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIsNavigating(false);
    }, []),
  );

  // Guard : la matière vient en dernier — le niveau (et la filière qu'il demande) doivent être choisis avant.
  const hasContext = !!level && (!level.trackKind || !!track);
  useEffect(() => {
    if (!hasContext) router.replace(LEVEL_ROUTE);
  }, [hasContext, router]);

  // Seules les matières du bloc choisi (et de la série, au lycée) sont proposées.
  const state: SubjectsState =
    catalogState.status === "success"
      ? (() => {
          const categories = subjectsFor(catalogState.categories, level, track);
          return categories.length > 0 ? { status: "success", categories } : { status: "empty" };
        })()
      : catalogState;
  const freeText = allowsFreeTextSubject(level);
  const steps = funnelSteps(level);

  const selectSubject = (subject: Category) => {
    if (isNavigating) return;
    setIsNavigating(true);
    setSubject(subject);
    router.push(SUMMARY_ROUTE);
  };

  /**
   * Saisie libre : la matière tapée n'est pas forcément au catalogue (« Analyse 2 », « Transformées de Fourier »…).
   * Si elle correspond exactement à une matière connue, c'est celle-ci qui est choisie ; sinon elle est conservée
   * telle quelle et le serveur la rapproche des tuteurs (recherche « pour moi », connecté).
   */
  const typed = query.trim();
  const catalog = state.status === "success" ? state.categories : [];
  const exact = typed ? catalog.find((c) => normalize(c.label) === normalize(typed)) : undefined;
  const chooseTyped = () => {
    if (!freeText && !exact) return;
    if (exact) return selectSubject(exact);
    selectSubject({
      id: `free:${normalize(typed)}`,
      label: typed.charAt(0).toLocaleUpperCase("fr") + typed.slice(1),
      group: null,
      freeText: true,
    });
  };

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      <StepProgress step={steps.subject} total={steps.total} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 20) }}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={40}>
          <Text className="mb-1 text-[26px] font-bold text-ink">{t("common.whatAreYouLookingFor")}</Text>
          <Text className="mb-5 text-[14px] text-ink-soft">
            {[level?.label, track?.label].filter(Boolean).join(" • ")}
            {freeText ? t("search.need.chooseASubjectOrType") : ""}
          </Text>
        </FadeIn>

        <FadeIn delay={90}>
          <View className="mb-[18px] flex-row items-center gap-[10px] rounded-sm border border-line bg-surface px-[14px] py-[13px]">
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
        </FadeIn>

        <SubjectList
          state={state}
          query={query}
          onRetry={retry}
          onSelect={selectSubject}
          disabled={isNavigating}
        />

        {freeText && typed.length >= 2 && !exact ? (
          <FadeIn delay={60}>
            <View className="mt-[10px]">
              <MenuCard
                icon={<SearchIcon size={19} color="#332E86" />}
                title={t("search.need.searchFor", { typed })}
                description={t("search.need.mySubjectIsNotIn")}
                onPress={chooseTyped}
                disabled={isNavigating}
                accessibilityLabel={t("search.need.searchForTheTypedSubject", { typed })}
              />
            </View>
          </FadeIn>
        ) : null}
      </ScrollView>
    </View>
  );
}

type SubjectListProps = {
  state: SubjectsState;
  query: string;
  onRetry: () => void;
  onSelect: (subject: Category) => void;
  disabled: boolean;
};

function SubjectList({ state, query, onRetry, onSelect, disabled }: SubjectListProps) {
  const { t } = useTranslation();
  if (state.status === "loading") {
    return (
      <View className="gap-[10px]">
        {[0, 1, 2, 3, 4, 5].map((i) => (
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

  const q = query.trim().toLowerCase();
  const subjects = q ? state.categories.filter((c) => c.label.toLowerCase().includes(q)) : state.categories;

  if (subjects.length === 0) {
    return (
      <Text className="text-[13.5px] text-ink-faint">
        {t("search.need.noSubjectMatches", { trim: query.trim() })}</Text>
    );
  }

  return (
    <View className="gap-[10px]">
      {subjects.map((subject, index) => {
        const Icon = SUBJECT_ICONS[subject.id] ?? SubjectIcon;
        return (
          <FadeIn key={subject.id} delay={130 + index * 40}>
            <MenuCard
              icon={<Icon size={19} color="#332E86" />}
              title={subject.label}
              onPress={() => onSelect(subject)}
              disabled={disabled}
            />
          </FadeIn>
        );
      })}
    </View>
  );
}
