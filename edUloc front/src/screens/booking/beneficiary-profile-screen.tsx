import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MicIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { RadioCard } from "@/components/ui/selectable-card";
import { SelectField, type SelectOption } from "@/components/ui/select-field";
import { StepProgress } from "@/components/ui/step-progress";
import { type ObjectivesState, useObjectives } from "@/hooks/use-objectives";
import { BeneficiaryService, BeneficiaryServiceError } from "@/services/beneficiary.service";
import { useBookingWizardStore } from "@/store/booking-wizard.store";
import type { DifficultyId } from "@/types/beneficiary";
import type { LearningObjective } from "@/types/search";
import { useTranslation } from "react-i18next";
import { t as tr } from "@/i18n";

const BOOKING_SUMMARY_ROUTE = "/booking-summary" as Href;

// The spec doesn't define French labels for DifficultyId — a direct mapping
// of the real enum values, flagged rather than invented (AGENTS.md §11).
const DIFFICULTY_OPTIONS: (SelectOption & { id: DifficultyId })[] = [
  { id: "theoretical", get label() { return tr("common.theoreticalUnderstanding"); } },
  { id: "practical", get label() { return tr("booking.beneficiaryProfile.practicalApplicationExercises"); } },
  { id: "methodological", get label() { return tr("common.workMethod"); } },
  { id: "confidence", get label() { return tr("common.selfConfidence"); } },
  { id: "other", get label() { return tr("common.other"); } },
];

/**
 * Étape « Votre besoin » (2/3) : objectif, difficulté et précision du besoin. Ces questions ne sont plus posées dans
 * la recherche — elles ne servent qu'une fois le tuteur choisi, donc on les demande ici, à la réservation.
 */
export function BeneficiaryProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const offer = useBookingWizardStore((s) => s.offer);
  const beneficiary = useBookingWizardStore((s) => s.beneficiary);
  const difficulty = useBookingWizardStore((s) => s.difficulty);
  const setDifficulty = useBookingWizardStore((s) => s.setDifficulty);
  const objective = useBookingWizardStore((s) => s.objective);
  const setObjective = useBookingWizardStore((s) => s.setObjective);
  const note = useBookingWizardStore((s) => s.note);
  const setNote = useBookingWizardStore((s) => s.setNote);
  const { state: objectivesState, retry: retryObjectives } = useObjectives();
  const [isNavigating, setIsNavigating] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [voiceNoteNotice, setVoiceNoteNotice] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setIsNavigating(false);
    }, []),
  );

  // Guard: this step needs both an active booking and a chosen beneficiary,
  // i.e. Beneficiary (step 1/3) must have been completed first.
  const hasContext = !!offer && !!beneficiary;

  useEffect(() => {
    if (!hasContext) router.replace("/home");
  }, [hasContext, router]);

  // Default the fields to whatever is already saved on this beneficiary.
  useEffect(() => {
    if (!difficulty && beneficiary?.difficulty) setDifficulty(beneficiary.difficulty);
    if (!objective && beneficiary?.objective) setObjective(beneficiary.objective);
  }, [difficulty, objective, beneficiary, setDifficulty, setObjective]);

  if (!hasContext || !beneficiary) return null;

  const selectedDifficulty = DIFFICULTY_OPTIONS.find((d) => d.id === difficulty) ?? null;
  const canContinue = !!objective && !isNavigating;

  const addVoiceNote = () => {
    // Real voice-note capture needs a native recorder plus a media-upload endpoint — out of scope here.
    // Surfacing this honestly rather than faking a successful record.
    setVoiceNoteNotice(t("booking.beneficiaryProfile.voiceRecordingIsComingSoon"));
  };

  const continueToSummary = async () => {
    if (!canContinue) return;
    setIsNavigating(true);
    setSaveError(null);
    // L'objectif et la difficulté font partie du profil du bénéficiaire : ils sont enregistrés pour les prochaines demandes.
    const changes: { objective?: LearningObjective["id"]; difficulty?: DifficultyId } = {};
    if (objective !== beneficiary.objective) changes.objective = objective as LearningObjective["id"];
    if (difficulty && difficulty !== beneficiary.difficulty) changes.difficulty = difficulty as DifficultyId;
    if (Object.keys(changes).length > 0) {
      try {
        await BeneficiaryService.updateBeneficiary(beneficiary.id, changes);
      } catch (error) {
        setSaveError(
          error instanceof BeneficiaryServiceError ? error.message : t("booking.beneficiaryProfile.unableToSaveYourNeed"),
        );
        setIsNavigating(false);
        return;
      }
    }
    router.push(BOOKING_SUMMARY_ROUTE);
  };

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      <StepProgress step={2} total={3} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={40}>
          <Text className="mb-1 text-[24px] font-bold text-ink">{t("booking.beneficiaryProfile.yourNeed")}</Text>
          <Text className="mb-5 text-[13.5px] text-ink-soft">
            {[beneficiary.isSelf ? t("booking.beneficiaryProfile.forYou") : `Pour ${beneficiary.firstName}`, offer.subjectLabel, beneficiary.level?.label]
              .filter(Boolean)
              .join(" • ")}
          </Text>
        </FadeIn>

        <FadeIn delay={80}>
          <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
            {t("booking.beneficiaryProfile.whatIsYourGoal")}</Text>
          <ObjectiveList
            state={objectivesState}
            selectedId={objective || null}
            onRetry={retryObjectives}
            onSelect={(option) => setObjective(option.id)}
          />
        </FadeIn>

        <FadeIn delay={130}>
          <View className="mt-4">
            <SelectField
              label={t("booking.beneficiaryProfile.mainDifficultyOptional")}
              value={selectedDifficulty}
              options={DIFFICULTY_OPTIONS}
              onSelect={(option) => setDifficulty(option.id)}
            />
          </View>
        </FadeIn>

        <FadeIn delay={170}>
          <Text className="mb-[6px] ml-0.5 mt-1 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
            {t("booking.beneficiaryProfile.describeYourNeedOptional")}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t("booking.beneficiaryProfile.describeWhatYouNeed")}
            placeholderTextColor="#9799AF"
            multiline
            maxLength={1000}
            textAlignVertical="top"
            className="h-[110px] rounded-sm border border-line bg-surface px-[14px] py-[13px] text-[15px] text-ink"
            accessibilityLabel={t("booking.beneficiaryProfile.describeWhatYouNeed2")}
          />
          <PressableScale onPress={addVoiceNote} accessibilityLabel={t("booking.beneficiaryProfile.addAVoiceNote")}>
            <View className="mt-3 flex-row items-center gap-[14px] rounded-lg border border-dashed border-line bg-surface p-4">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-accent-tint">
                <MicIcon size={20} color="#0E9C82" />
              </View>
              <View className="flex-1">
                <Text className="text-[14.5px] font-bold text-ink">{t("booking.beneficiaryProfile.addAVoiceNote")}</Text>
                <Text className="text-[12.5px] text-ink-soft">{t("booking.beneficiaryProfile.explainYourNeedOutLoud")}</Text>
              </View>
            </View>
          </PressableScale>
          {voiceNoteNotice ? <Text className="mt-2 text-[12.5px] text-ink-faint">{voiceNoteNotice}</Text> : null}
        </FadeIn>

        {saveError ? (
          <View className="mt-4">
            <FormError message={saveError} />
          </View>
        ) : null}
      </ScrollView>

      <View
        className="border-t border-line-soft bg-surface px-5 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 22) }}
      >
        <Button label={t("common.continue")} loading={isNavigating} disabled={!canContinue} onPress={continueToSummary} />
      </View>
    </View>
  );
}

type ObjectiveListProps = {
  state: ObjectivesState;
  selectedId: string | null;
  onRetry: () => void;
  onSelect: (objective: LearningObjective) => void;
};

function ObjectiveList({ state, selectedId, onRetry, onSelect }: ObjectiveListProps) {
  const { t } = useTranslation();
  if (state.status === "loading") {
    return (
      <View className="gap-[10px]">
        {[0, 1, 2].map((i) => (
          <View key={i} className="h-[54px] rounded-lg bg-line-soft" />
        ))}
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View className="flex-row items-center gap-3">
        <Text className="flex-1 text-[13.5px] text-error">{state.message}</Text>
        <PressableScale onPress={onRetry} accessibilityLabel={t("booking.beneficiaryProfile.tryLoadingTheGoalsAgain")}>
          <Text className="text-[13.5px] font-semibold text-primary">{t("common.tryAgain")}</Text>
        </PressableScale>
      </View>
    );
  }

  if (state.status === "empty") {
    return <Text className="text-[13.5px] text-ink-faint">{t("booking.beneficiaryProfile.noGoalsAvailableAtThe")}</Text>;
  }

  return (
    <View className="gap-[10px]">
      {state.objectives.map((option) => (
        <RadioCard
          key={option.id}
          label={option.label}
          selected={option.id === selectedId}
          onPress={() => onSelect(option)}
        />
      ))}
    </View>
  );
}
