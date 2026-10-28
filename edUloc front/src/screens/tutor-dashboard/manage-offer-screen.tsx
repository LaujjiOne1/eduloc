import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { FormError } from "@/components/ui/form-error";
import { type SelectOption, SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import { useOffer } from "@/hooks/use-offer";
import { useTracks } from "@/hooks/use-tracks";
import { trackKindOf } from "@/lib/search-funnel";
import { type OfferSaveInput, useOfferActions, type OfferActionState } from "@/hooks/use-offer-actions";
import { useTutorProfile } from "@/hooks/use-tutor-profile";
import { OfferStatusBadge } from "@/screens/tutor-dashboard/offers-screen";
import type { Offer } from "@/types/offer";
import type { TutorProfileSummary } from "@/types/tutor-profile";
import { useTranslation } from "react-i18next";
import { t as tr } from "@/i18n";

type OfferDurationId = "1h" | "1h30" | "2h" | "3h";

const OFFERS_ROUTE = "/tutor-dashboard/offers" as Href;

// The spec doesn't define a duration catalog — same fixed set already used by
// the onboarding's TutorOfferScreen (44_TutorOffer), flagged rather than
// invented as a business rule (AGENTS.md §11). `minutes` is just the numeric
// equivalent of each label, required by CreateOfferInput.durationMinutes.
const DURATION_OPTIONS: { id: OfferDurationId; label: string; minutes: number }[] = [
  { id: "1h", get label() { return tr("common.n1Hour"); }, minutes: 60 },
  { id: "1h30", get label() { return tr("tutorDashboard.manageOffer.n1Hour30"); }, minutes: 90 },
  { id: "2h", get label() { return tr("tutorDashboard.manageOffer.n2Hours"); }, minutes: 120 },
  { id: "3h", get label() { return tr("tutorDashboard.manageOffer.n3Hours"); }, minutes: 180 },
];

export function ManageOfferScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditMode = !!id;

  const { state: offerState, retry: retryOffer } = useOffer(id);
  const { state: profileState } = useTutorProfile();
  const { state: actionState, save, toggleStatus } = useOfferActions();

  // Create mode needs the tutor's own subjects (Matière/Niveau options) —
  // wait for that load too, rather than briefly showing "no subjects".
  const isLoading = (isEditMode && offerState.status === "loading") || (!isEditMode && profileState.status === "loading");

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-paper" style={{ paddingTop: insets.top }}>
        <ActivityIndicator color="#332E86" />
      </View>
    );
  }
  if (isEditMode && offerState.status === "error") {
    return (
      <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
        <AuthHeader onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Text className="text-center text-[14px] text-error">{offerState.message}</Text>
          <PressableScale onPress={retryOffer} accessibilityLabel={t("common.tryAgain")}>
            <Text className="text-[14px] font-semibold text-primary">{t("common.tryAgain")}</Text>
          </PressableScale>
        </View>
      </View>
    );
  }

  const existingOffer = isEditMode && offerState.status === "success" ? offerState.offer : null;

  return (
    <ManageOfferForm
      insetsTop={insets.top}
      insetsBottom={insets.bottom}
      onBack={() => router.back()}
      existingOffer={existingOffer}
      profile={profileState.status === "success" ? profileState.profile : null}
      actionState={actionState}
      onSave={async (input) => {
        const offer = await save(input);
        if (offer) router.replace(OFFERS_ROUTE);
      }}
      onToggleStatus={async (offerId, nextActive) => {
        const offer = await toggleStatus(offerId, nextActive);
        if (offer) retryOffer();
      }}
    />
  );
}

type ManageOfferFormProps = {
  insetsTop: number;
  insetsBottom: number;
  onBack: () => void;
  existingOffer: Offer | null;
  profile: TutorProfileSummary | null;
  actionState: OfferActionState;
  onSave: (input: OfferSaveInput) => void;
  onToggleStatus: (offerId: string, nextActive: boolean) => void;
};

function ManageOfferForm({
  insetsTop,
  insetsBottom,
  onBack,
  existingOffer,
  profile,
  actionState,
  onSave,
  onToggleStatus,
}: ManageOfferFormProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(existingOffer?.title ?? "");
  const [description, setDescription] = useState(existingOffer?.description ?? "");
  const [duration, setDuration] = useState<{ id: OfferDurationId; label: string; minutes: number } | null>(
    existingOffer ? (DURATION_OPTIONS.find((d) => d.label === existingOffer.durationLabel) ?? null) : null,
  );
  // Autres durées proposées au demandeur, en plus de la durée par défaut (le prix est proportionnel).
  const [extraDurations, setExtraDurations] = useState<number[]>(existingOffer?.durationOptions ?? []);
  const [price, setPrice] = useState(existingOffer ? String(existingOffer.price.amount) : "");
  const [skillOption, setSkillOption] = useState<SelectOption | null>(null);
  const [levelOption, setLevelOption] = useState<SelectOption | null>(null);
  const [trackOption, setTrackOption] = useState<SelectOption | null>(null);

  const skillOptions: SelectOption[] = profile ? profile.subjects.map((s) => ({ id: s.skill.id, label: s.skill.label })) : [];
  const levelOptions: SelectOption[] = profile ? (profile.subjects.find((s) => s.skill.id === skillOption?.id)?.levels ?? []) : [];

  // Série (Première/Terminale) ou mention : choisie à la création, selon le niveau retenu.
  const levelRef = profile?.subjects.find((s) => s.skill.id === skillOption?.id)?.levels.find((l) => l.id === levelOption?.id);
  const trackKind = trackKindOf(levelRef);
  const { state: tracksState } = useTracks(trackKind, levelRef?.label);
  const trackOptions: SelectOption[] = tracksState.status === "success" ? tracksState.tracks : [];

  const isEdit = !!existingOffer;
  const isSaving = actionState.status === "saving";
  const isToggling = actionState.status === "togglingStatus";
  const priceValue = Number(price.replace(",", "."));
  const hasValidPrice = price.trim().length > 0 && Number.isFinite(priceValue) && priceValue > 0;

  const canSubmit = isEdit
    ? title.trim().length > 0 && description.trim().length > 0 && !!duration && hasValidPrice
    : !!skillOption &&
      !!levelOption &&
      (trackKind !== "serie" || !!trackOption) &&
      title.trim().length > 0 &&
      description.trim().length > 0 &&
      !!duration &&
      hasValidPrice;

  const handleSubmit = () => {
    if (!canSubmit || !duration) return;
    if (isEdit && existingOffer) {
      onSave({
        mode: "edit",
        offerId: existingOffer.id,
        data: {
          title: title.trim(),
          description: description.trim(),
          durationMinutes: duration.minutes,
          durationOptions: extraDurations.filter((m) => m !== duration.minutes),
          price: priceValue,
        },
      });
    } else if (skillOption && levelOption) {
      onSave({
        mode: "create",
        data: {
          subjectId: skillOption.id,
          levelId: levelOption.id,
          trackId: trackOption?.id ?? null,
          title: title.trim(),
          description: description.trim(),
          durationMinutes: duration.minutes,
          durationOptions: extraDurations.filter((m) => m !== duration.minutes),
          price: priceValue,
          // No format selector in this form (no such field previously) —
          // default to présentiel, flagged rather than invented (AGENTS.md §11).
          format: "in_person",
        },
      });
    }
  };

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insetsTop }}>
      <AuthHeader onBack={onBack} />

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View className="mb-[18px] flex-row items-center justify-between gap-3">
          <Text className="flex-1 text-[22px] font-bold text-ink">{existingOffer ? existingOffer.title : t("common.newOffer")}</Text>
          {existingOffer ? <OfferStatusBadge isActive={existingOffer.isActive} /> : null}
        </View>

        {actionState.status === "error" ? <FormError message={actionState.message} /> : null}

        <TextField label={t("tutorDashboard.manageOffer.title")} value={title} onChangeText={setTitle} placeholder={t("tutorDashboard.manageOffer.pythonForBeginners")} />

        {existingOffer ? (
          <>
            <ReadOnlyField label={t("common.subject")} value={existingOffer.subjectLabel} />
            <ReadOnlyField label={t("common.level")} value={existingOffer.levelLabel} />
          </>
        ) : (
          <>
            <SelectField
              label={t("common.subject")}
              value={skillOption}
              options={skillOptions}
              placeholder={skillOptions.length ? t("common.select") : t("tutorDashboard.manageOffer.noSubjectRegistered")}
              disabled={skillOptions.length === 0}
              onSelect={(option) => {
                setSkillOption(option);
                setLevelOption(null);
                setTrackOption(null);
              }}
            />
            <SelectField
              label={t("common.level")}
              value={levelOption}
              options={levelOptions}
              placeholder={skillOption ? t("common.select") : t("tutorDashboard.manageOffer.chooseASubjectFirst")}
              disabled={!skillOption}
              onSelect={(option) => {
                setLevelOption(option);
                setTrackOption(null);
              }}
            />
            {trackKind ? (
              <SelectField
                label={trackKind === "serie" ? t("common.track") : t("tutorDashboard.manageOffer.degreeProgrammeOptional")}
                value={trackOption}
                options={trackOptions}
                placeholder={tracksState.status === "loading" ? t("common.loading2") : t("common.select")}
                disabled={tracksState.status !== "success"}
                onSelect={setTrackOption}
              />
            ) : null}
          </>
        )}

        <View className="mb-[14px]">
          <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{t("common.description")}</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t("tutorDashboard.manageOffer.aConcreteIntroductionToPython")}
            placeholderTextColor="#9799AF"
            multiline
            textAlignVertical="top"
            className="h-[90px] rounded-sm border border-line bg-surface px-[14px] py-[13px] text-[15px] text-ink"
            accessibilityLabel={t("tutorDashboard.manageOffer.offerDescription")}
          />
        </View>

        <SelectField label={t("common.duration3")} value={duration} options={DURATION_OPTIONS} onSelect={(option) => setDuration(option as typeof duration)} />

        {duration ? (
          <View className="mb-[14px]">
            <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
              {t("tutorDashboard.manageOffer.otherDurationsOffered")}</Text>
            <View className="flex-row flex-wrap gap-2">
              {DURATION_OPTIONS.filter((d) => d.minutes !== duration.minutes).map((d) => (
                <Chip
                  key={d.id}
                  label={d.label}
                  active={extraDurations.includes(d.minutes)}
                  onPress={() =>
                    setExtraDurations((current) =>
                      current.includes(d.minutes) ? current.filter((m) => m !== d.minutes) : [...current, d.minutes],
                    )
                  }
                />
              ))}
            </View>
            <Text className="mt-2 text-[12px] leading-[18px] text-ink-faint">
              {t("tutorDashboard.manageOffer.theRequesterWillChooseAmong")}</Text>
          </View>
        ) : null}

        <TextField
          label={t("tutorDashboard.manageOffer.priceAr")}
          value={price}
          onChangeText={setPrice}
          placeholder="25000"
          keyboardType="numeric"
        />
      </ScrollView>

      <View className="border-t border-line-soft bg-surface px-5 pt-4" style={{ paddingBottom: Math.max(insetsBottom, 22) }}>
        <View className="gap-[10px]">
          <Button
            label={t("common.save")}
            disabled={!canSubmit || isSaving || isToggling}
            loading={isSaving}
            loadingLabel={t("common.saving")}
            onPress={handleSubmit}
          />
          {existingOffer ? (
            <Button
              label={existingOffer.isActive ? t("tutorDashboard.manageOffer.deactivateTheOffer") : t("tutorDashboard.manageOffer.reactivateTheOffer")}
              variant="ghost"
              disabled={isSaving || isToggling}
              loading={isToggling}
              loadingLabel={t("tutorDashboard.manageOffer.updating")}
              onPress={() => onToggleStatus(existingOffer.id, !existingOffer.isActive)}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <View className="mb-[14px]">
      <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{label}</Text>
      <View className="rounded-sm border border-line bg-surface px-[14px] py-[13px]">
        <Text className="text-[15px] text-ink-faint">{value}</Text>
      </View>
    </View>
  );
}
