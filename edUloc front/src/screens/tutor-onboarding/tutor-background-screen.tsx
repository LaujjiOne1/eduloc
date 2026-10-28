import { type Href, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BriefcaseIcon, CheckIcon, PencilIcon, PlusIcon, TrashIcon, XIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { InlineWarning } from "@/components/ui/inline-warning";
import { FieldCombobox } from "@/components/ui/field-combobox";
import { SelectField } from "@/components/ui/select-field";
import { StepProgress } from "@/components/ui/step-progress";
import { useTracks } from "@/hooks/use-tracks";
import { TextField } from "@/components/ui/text-field";
import { experienceWarnings } from "@/lib/experience-warnings";
import {
  EXPERIENCE_AUDIENCES,
  EXPERIENCE_TYPES,
  type ExperienceAudienceId,
  type TutorExperienceType,
  experienceTypeLabel,
} from "@/lib/experience-types";
import {
  type EducationDegree,
  type TutorExperienceEntry,
  useTutorApplicationStore,
} from "@/store/tutor-application.store";
import { useTranslation } from "react-i18next";
import { t as tr } from "@/i18n";

const TUTOR_SKILLS_ROUTE = "/tutor-skills" as Href;
const TOTAL_STEPS = 9;

const DEGREE_OPTIONS: EducationDegree[] = [
  { id: "bac", get label() { return tr("common.baccalaureate"); } },
  { id: "licence", get label() { return tr("common.bachelorSDegree"); } },
  { id: "master", get label() { return tr("common.masterSDegree"); } },
  { id: "doctorat", get label() { return tr("common.doctorate"); } },
  { id: "other", get label() { return tr("common.other"); } },
];

const DEFAULT_TYPE: TutorExperienceType = "enseignement";

export function TutorBackgroundScreen() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const background = useTutorApplicationStore((s) => s.background);
  const cvApplied = useTutorApplicationStore((s) => s.cvApplied);
  const setBackground = useTutorApplicationStore((s) => s.setBackground);
  const addExperience = useTutorApplicationStore((s) => s.addExperience);
  const updateExperience = useTutorApplicationStore((s) => s.updateExperience);
  const removeExperience = useTutorApplicationStore((s) => s.removeExperience);

  // Domaine : il dépend du niveau d'études. Un bachelier se voit proposer les séries du bac, un titulaire d'un diplôme
  // universitaire les mentions ; « Autre » : aucune suggestion. La saisie libre reste toujours possible.
  const degreeId = background.degree?.id ?? null;
  const fieldKind = degreeId === "bac" ? "serie" : degreeId && degreeId !== "other" ? "mention" : null;
  const { state: fieldOptionsState, retry: retryFieldOptions } = useTracks(fieldKind, fieldKind === "serie" ? "Terminale" : undefined);
  // Les séries de Première et de Terminale portent les mêmes noms : on ne propose que celles de la Terminale.
  const fieldSuggestions =
    fieldKind && fieldOptionsState.status === "success" ? fieldOptionsState.tracks.map((t) => t.label) : [];
  const fieldLoadError = fieldKind && fieldOptionsState.status === "error" ? fieldOptionsState.message : null;

  const experiences = useMemo(() => background.experiences ?? [], [background.experiences]);
  const teachingCount = experiences.filter((e) => EXPERIENCE_TYPES.find((t) => t.id === e.type)?.teaching).length;

  // Form State (Modal) — un seul formulaire, le type se coche en tête.
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formType, setFormType] = useState<TutorExperienceType>(DEFAULT_TYPE);
  const [formTitle, setFormTitle] = useState("");
  const [formOrganization, setFormOrganization] = useState("");
  const [formPeriod, setFormPeriod] = useState("");
  const [formAudience, setFormAudience] = useState<ExperienceAudienceId[]>([]);
  const [formSubjects, setFormSubjects] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formError, setFormError] = useState("");
  const [successToast, setSuccessToast] = useState("");

  const resetFields = () => {
    setFormTitle("");
    setFormOrganization("");
    setFormPeriod("");
    setFormAudience([]);
    setFormSubjects("");
    setFormDescription("");
    setFormError("");
  };

  const handleStartAdd = () => {
    setEditingId(null);
    setFormType(DEFAULT_TYPE);
    resetFields();
    setSuccessToast("");
    setIsFormOpen(true);
  };

  const handleStartEdit = (exp: TutorExperienceEntry) => {
    setEditingId(exp.id);
    setFormType(exp.type);
    setFormTitle(exp.title);
    setFormOrganization(exp.organization);
    setFormPeriod(exp.period);
    setFormAudience(exp.audience ?? []);
    setFormSubjects(exp.subjects ?? "");
    setFormDescription(exp.description ?? "");
    setFormError("");
    setSuccessToast("");
    setIsFormOpen(true);
  };

  const handleCancelForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormError("");
    setSuccessToast("");
  };

  const toggleAudience = (id: ExperienceAudienceId) =>
    setFormAudience((current) => (current.includes(id) ? current.filter((a) => a !== id) : [...current, id]));

  const handleSaveExperience = (addAnother = false) => {
    if (!formTitle.trim()) {
      setFormError(tr("tutorOnboarding.tutorBackground.pleaseEnterTheTitleOf"));
      return;
    }
    if (!formOrganization.trim()) {
      setFormError(tr("tutorOnboarding.tutorBackground.pleaseEnterTheInstitutionCompany"));
      return;
    }
    if (!formPeriod.trim()) {
      setFormError(tr("tutorOnboarding.tutorBackground.pleaseEnterThePeriodOr"));
      return;
    }

    const entry = {
      type: formType,
      title: formTitle.trim(),
      organization: formOrganization.trim(),
      period: formPeriod.trim(),
      audience: formAudience,
      subjects: formSubjects.trim() || undefined,
      description: formDescription.trim() || undefined,
      // Relue et enregistrée par le tuteur : les avertissements de l'import ne valent plus.
      fromCv: false,
      warnings: [] as string[],
    };

    if (editingId) {
      updateExperience(editingId, entry);
      setIsFormOpen(false);
      setEditingId(null);
      resetFields();
      return;
    }

    addExperience(entry);
    if (addAnother) {
      setSuccessToast(tr("tutorOnboarding.tutorBackground.experienceAdded", { title: entry.title }));
      resetFields();
      return;
    }
    setIsFormOpen(false);
    resetFields();
    setSuccessToast("");
  };

  const canContinue =
    !!background.degree &&
    background.field.trim().length > 0 &&
    background.institution.trim().length > 0;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-paper"
      style={{ paddingTop: insets.top }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AuthHeader onBack={() => router.back()} />
      <StepProgress step={2} total={TOTAL_STEPS} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={40}>
          <Text className="mb-1 text-[24px] font-bold text-ink">{tr("tutorOnboarding.tutorBackground.whatIsYourBackground")}</Text>
          <Text className="mb-6 text-[13.5px] text-ink-soft">
            {tr("tutorOnboarding.tutorBackground.enterYourEducationThenYour")}</Text>
        </FadeIn>

        {/* Section 1: Formation initiale */}
        <FadeIn delay={80}>
          <View className="mb-6 rounded-2xl border border-line bg-surface p-4 shadow-xs">
            <Text className="mb-3 text-[14px] font-bold uppercase tracking-wide text-primary">
              {tr("tutorOnboarding.tutorBackground.n1InitialEducation")}</Text>

            <SelectField
              label={tr("tutorOnboarding.tutorBackground.studyLevel")}
              value={background.degree}
              options={DEGREE_OPTIONS}
              onSelect={(option) => {
                const degree = DEGREE_OPTIONS.find((d) => d.id === option.id) ?? null;
                // Série et mention ne se remplacent pas : changer de niveau d'études efface le domaine choisi.
                setBackground({ degree, field: degree?.id === background.degree?.id ? background.field : "" });
              }}
            />
            {cvApplied && !background.degree ? (
              <InlineWarning message={tr("tutorOnboarding.tutorBackground.studyLevelNotFoundIn")} spaced />
            ) : null}
            <TextField
              label={tr("tutorOnboarding.tutorBackground.institution")}
              value={background.institution}
              onChangeText={(institution) => setBackground({ institution })}
              placeholder={tr("tutorOnboarding.tutorBackground.eGUniversityOfParis")}
            />
            {cvApplied && !background.institution.trim() ? (
              <InlineWarning message={tr("tutorOnboarding.tutorBackground.institutionNotFoundInYour")} spaced />
            ) : null}
            {fieldKind === "serie" ? (
              // Bachelier : il choisit sa série, sans saisie libre.
              <>
                <SelectField
                  label={tr("tutorOnboarding.tutorBackground.fieldBaccalaureateTrack")}
                  value={fieldSuggestions.includes(background.field) ? { id: background.field, label: background.field } : null}
                  options={fieldSuggestions.map((label) => ({ id: label, label }))}
                  placeholder={fieldOptionsState.status === "loading" ? tr("common.loading2") : tr("tutorOnboarding.tutorBackground.selectYourTrack")}
                  disabled={fieldSuggestions.length === 0}
                  onSelect={(option) => setBackground({ field: option.label })}
                />
                {fieldLoadError ? (
                  <View className="-mt-2 mb-[14px] flex-row items-center gap-3">
                    <Text className="flex-1 text-[12.5px] text-error">{fieldLoadError}</Text>
                    <PressableScale onPress={retryFieldOptions} accessibilityLabel={tr("tutorOnboarding.tutorBackground.tryLoadingTheTracksAgain")}>
                      <Text className="text-[12.5px] font-semibold text-primary">{tr("common.tryAgain")}</Text>
                    </PressableScale>
                  </View>
                ) : null}
              </>
            ) : (
              // Diplôme universitaire : mentions suggérées, saisie libre possible si aucune ne convient.
              <FieldCombobox
                label={tr("tutorOnboarding.tutorBackground.field")}
                value={background.field}
                onChange={(field) => setBackground({ field })}
                suggestions={fieldSuggestions}
                suggestionsTitle={tr("tutorOnboarding.tutorBackground.degreeProgrammes")}
                isLoading={!!fieldKind && fieldOptionsState.status === "loading"}
                loadError={fieldLoadError}
                onRetry={retryFieldOptions}
                disabled={!degreeId}
                placeholder={fieldKind === "mention" ? tr("tutorOnboarding.tutorBackground.typeYourDegreeProgrammeOr") : tr("tutorOnboarding.tutorBackground.typeYourField")}
              />
            )}
            {cvApplied && !!degreeId && !background.field.trim() ? (
              <InlineWarning message={tr("tutorOnboarding.tutorBackground.fieldNotFoundInYour")} />
            ) : null}
          </View>
        </FadeIn>

        {/* Section 2: Expériences (un seul formulaire, le type se coche) */}
        <FadeIn delay={120}>
          <View className="mb-6 rounded-2xl border border-line bg-surface p-4 shadow-xs">
            <View className="mb-3 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <View className="h-7 w-7 items-center justify-center rounded-full bg-primary-tint">
                  <BriefcaseIcon size={14} color="#332E86" />
                </View>
                <View>
                  <Text className="text-[15px] font-bold text-ink">{tr("tutorOnboarding.tutorBackground.n2Experience")}</Text>
                  <Text className="text-[12px] text-ink-soft">
                    {tr("tutorOnboarding.tutorBackground.tutoringSupervisionJobsProjectsVolunteer")}</Text>
                </View>
              </View>
              <View className="rounded-full border border-primary/20 bg-primary-tint px-2.5 py-0.5">
                <Text className="text-[11.5px] font-bold text-primary">{experiences.length}</Text>
              </View>
            </View>

            {experiences.length > 0 ? (
              <>
                {teachingCount > 0 ? (
                  <Text className="mb-2.5 text-[12px] font-semibold text-accent">
                    {tr("tutorOnboarding.tutorBackground.teachingRelated", { count: teachingCount })}
                  </Text>
                ) : null}
                <View className="mb-3 gap-2.5">
                  {experiences.map((exp) => (
                    <ExperienceCard
                      key={exp.id}
                      exp={exp}
                      onEdit={() => handleStartEdit(exp)}
                      onRemove={() => removeExperience(exp.id)}
                    />
                  ))}
                </View>
              </>
            ) : (
              <View className="mb-3 items-center justify-center rounded-xl border border-dashed border-line bg-paper/50 p-3.5">
                <Text className="text-center text-[12.5px] text-ink-soft">
                  {tr("tutorOnboarding.tutorBackground.noExperienceAddedYetTutoring")}</Text>
              </View>
            )}

            <PressableScale
              onPress={handleStartAdd}
              accessibilityLabel={tr("tutorOnboarding.tutorBackground.addAnExperience")}
              className="flex-row items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary-tint/30 px-3 py-3"
            >
              <PlusIcon size={15} color="#332E86" />
              <Text className="text-[13px] font-bold text-primary">{tr("tutorOnboarding.tutorBackground.addAnExperience")}</Text>
            </PressableScale>
          </View>
        </FadeIn>
      </ScrollView>

      {/* Footer Continue Button */}
      <View
        className="border-t border-line-soft bg-surface px-5 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 22) }}
      >
        <Button
          label={tr("common.continue")}
          disabled={!canContinue}
          onPress={() => router.push(TUTOR_SKILLS_ROUTE)}
        />
      </View>

      {/* MODALE D'AJOUT ET MODIFICATION D'EXPÉRIENCE */}
      <Modal visible={isFormOpen} transparent animationType="slide" onRequestClose={handleCancelForm}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1 justify-end bg-black/55"
        >
          <View
            className="max-h-[92%] rounded-t-[28px] border-t border-line bg-surface p-5 shadow-2xl"
            style={{ paddingBottom: Math.max(insets.bottom, 22) }}
          >
            <View className="mb-4 flex-row items-center justify-between border-b border-line-soft pb-3">
              <View>
                <Text className="text-[17px] font-bold text-ink">
                  {editingId ? tr("tutorOnboarding.tutorBackground.editTheExperience") : tr("tutorOnboarding.tutorBackground.addAnExperience")}
                </Text>
                <Text className="text-[12px] text-ink-soft">
                  {editingId
                    ? tr("tutorOnboarding.tutorBackground.updateTheSavedInformation")
                    : tr("tutorOnboarding.tutorBackground.chooseTheTypeThenComplete")}
                </Text>
              </View>
              <PressableScale
                onPress={handleCancelForm}
                accessibilityLabel={tr("tutorOnboarding.tutorBackground.closeTheDialog")}
                className="h-8 w-8 items-center justify-center rounded-full border border-line bg-paper"
              >
                <XIcon size={15} color="#585B78" />
              </PressableScale>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {successToast ? (
                <View className="mb-3.5 flex-row items-center gap-2 rounded-xl border border-accent/30 bg-accent-tint/60 p-2.5">
                  <CheckIcon size={14} color="#0E9C82" />
                  <Text className="text-[12.5px] font-bold text-accent">{successToast}</Text>
                </View>
              ) : null}

              <Text className="mb-2 text-[13px] font-semibold text-ink">
                {tr("tutorOnboarding.tutorBackground.experienceType")} <Text className="text-error">*</Text>
              </Text>
              <View className="mb-4 flex-row flex-wrap gap-2">
                {EXPERIENCE_TYPES.map((type) => (
                  <Chip
                    key={type.id}
                    label={type.label}
                    active={formType === type.id}
                    onPress={() => setFormType(type.id)}
                  />
                ))}
              </View>

              <TextField
                label={tr("tutorOnboarding.tutorBackground.jobTitleProjectOrAssignment")}
                value={formTitle}
                onChangeText={(val) => {
                  setFormTitle(val);
                  if (formError) setFormError("");
                }}
                placeholder={tr("tutorOnboarding.tutorBackground.eGMathsTutorTeaching")}
              />

              <TextField
                label={tr("tutorOnboarding.tutorBackground.institutionCompanyOrganisation")}
                value={formOrganization}
                onChangeText={(val) => {
                  setFormOrganization(val);
                  if (formError) setFormError("");
                }}
                placeholder={tr("tutorOnboarding.tutorBackground.eGAndohaloHighSchool")}
              />

              <TextField
                label={tr("tutorOnboarding.tutorBackground.periodOrDuration")}
                value={formPeriod}
                onChangeText={(val) => {
                  setFormPeriod(val);
                  if (formError) setFormError("");
                }}
                placeholder={tr("tutorOnboarding.tutorBackground.eG202220242")}
              />

              <Text className="mb-2 text-[13px] font-semibold text-ink">{tr("tutorOnboarding.tutorBackground.levelOrAudienceSupervised")}</Text>
              <View className="mb-4 flex-row flex-wrap gap-2">
                {EXPERIENCE_AUDIENCES.map((audience) => (
                  <Chip
                    key={audience.id}
                    label={audience.label}
                    active={formAudience.includes(audience.id)}
                    onPress={() => toggleAudience(audience.id)}
                  />
                ))}
              </View>

              <TextField
                label={tr("tutorOnboarding.tutorBackground.subjectsOrSkillsTaught")}
                value={formSubjects}
                onChangeText={setFormSubjects}
                placeholder={tr("tutorOnboarding.tutorBackground.eGMathematicsPhysicsMethodology")}
              />

              <View className="mb-4">
                <Text className="mb-1.5 ml-0.5 text-[13px] font-semibold text-ink">
                  {tr("tutorOnboarding.tutorBackground.responsibilitiesAndResultsOptional")}</Text>
                <View className="rounded-xl border border-line bg-paper p-3">
                  <TextInput
                    value={formDescription}
                    onChangeText={setFormDescription}
                    placeholder={tr("tutorOnboarding.tutorBackground.brieflyDescribeYourResponsibilitiesOr")}
                    placeholderTextColor="#9799AF"
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    className="min-h-[65px] text-[14px] text-ink outline-none"
                  />
                </View>
              </View>

              {formError ? (
                <View className="mb-4 rounded-xl border border-error/30 bg-error-tint/60 p-2.5">
                  <Text className="text-center text-[12.5px] font-semibold text-error">{formError}</Text>
                </View>
              ) : null}

              <View className="mb-2 gap-2.5 pt-2">
                <View className="flex-row items-center gap-2">
                  <PressableScale
                    onPress={handleCancelForm}
                    className="flex-1 items-center justify-center rounded-xl border border-line bg-paper py-3.5"
                  >
                    <Text className="text-[14px] font-bold text-ink-soft">{tr("common.cancel")}</Text>
                  </PressableScale>

                  <PressableScale
                    onPress={() => handleSaveExperience(false)}
                    className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-3.5 shadow-sm"
                  >
                    <CheckIcon size={14} color="#ffffff" />
                    <Text className="text-[14px] font-bold text-white">{editingId ? tr("common.save") : tr("common.confirm")}</Text>
                  </PressableScale>
                </View>

                {!editingId && (
                  <PressableScale
                    onPress={() => handleSaveExperience(true)}
                    className="flex-row items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary-tint/50 py-3"
                  >
                    <PlusIcon size={14} color="#332E86" />
                    <Text className="text-[13.5px] font-bold text-primary">{tr("tutorOnboarding.tutorBackground.confirmAndAddAnotherExperience")}</Text>
                  </PressableScale>
                )}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function ExperienceCard({
  exp,
  onEdit,
  onRemove,
}: {
  exp: TutorExperienceEntry;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { t: tr } = useTranslation();
  const audience = (exp.audience ?? [])
    .map((id) => EXPERIENCE_AUDIENCES.find((a) => a.id === id)?.label)
    .filter(Boolean)
    .join(", ");

  return (
    <View className="rounded-xl border border-line bg-paper p-3.5">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <View className="mb-1.5 self-start rounded-full bg-primary-tint px-2.5 py-0.5">
            <Text className="text-[11px] font-bold text-primary">{experienceTypeLabel(exp.type)}</Text>
          </View>
          <Text className="text-[14.5px] font-bold text-ink">{exp.title}</Text>
          <Text className="mt-0.5 text-[12.5px] font-medium text-ink-soft">
            {exp.organization} • <Text className="font-bold text-primary">{exp.period}</Text>
          </Text>
          {audience ? <Text className="mt-1 text-[12px] text-ink-soft">{tr("tutorOnboarding.tutorBackground.audience", { audience })}</Text> : null}
          {exp.subjects ? <Text className="text-[12px] text-ink-soft">{tr("tutorOnboarding.tutorBackground.subjects", { subjects: exp.subjects })}</Text> : null}
          {exp.description ? (
            <Text className="mt-1.5 text-[12px] leading-[17px] text-ink-soft">{exp.description}</Text>
          ) : null}
          {experienceWarnings(exp).map((warning) => (
            <InlineWarning key={warning} message={warning} />
          ))}
          {exp.fromCv ? <Text className="mt-1.5 text-[11px] font-semibold text-ink-faint">{tr("tutorOnboarding.tutorBackground.preFilledFromYourCv")}</Text> : null}
        </View>

        <View className="flex-row items-center gap-1.5">
          <PressableScale
            onPress={onEdit}
            accessibilityLabel={tr("common.edit2", { title: exp.title })}
            className="h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface"
          >
            <PencilIcon size={13} color="#332E86" />
          </PressableScale>
          <PressableScale
            onPress={onRemove}
            accessibilityLabel={tr("tutorOnboarding.tutorBackground.delete", { title: exp.title })}
            className="h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface"
          >
            <TrashIcon size={13} color="#AC4A40" />
          </PressableScale>
        </View>
      </View>
    </View>
  );
}
