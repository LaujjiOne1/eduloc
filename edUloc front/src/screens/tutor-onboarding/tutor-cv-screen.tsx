import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CheckIcon, FileIcon, SparklesIcon, XIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { InlineWarning } from "@/components/ui/inline-warning";
import { StepProgress } from "@/components/ui/step-progress";
import { type CvImportState, useCvImport } from "@/hooks/use-cv-import";
import { DEGREE_LABELS, experienceFromCv, fullSelection } from "@/lib/cv-prefill";
import { experienceTypeLabel } from "@/lib/experience-types";
import { useTutorApplicationStore } from "@/store/tutor-application.store";
import type { CvPrefillDto } from "@/types/cv-import";
import { useTranslation } from "react-i18next";
import { t as tr } from "@/i18n";

const TUTOR_BACKGROUND_ROUTE = "/tutor-background" as Href;
const TOTAL_STEPS = 9;

/**
 * Étape facultative « Importer mon CV » : le CV (PDF, Word, photo ou scan) est lu côté serveur (OCR PaddleOCR si besoin),
 * structuré par un modèle, puis proposé comme pré-remplissage. Rien n'entre dans le dossier sans la confirmation du
 * tuteur, et un CV illisible ne bloque jamais : la saisie manuelle reste à un clic.
 */
export function TutorCvScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, pickAndImport, reset } = useCvImport();
  const applyCvPrefill = useTutorApplicationStore((s) => s.applyCvPrefill);

  const goManual = () => router.push(TUTOR_BACKGROUND_ROUTE);

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      <StepProgress step={1} total={TOTAL_STEPS} title={t("tutorOnboarding.tutorCv.cvImport")} />

      {state.status === "done" ? (
        <Review
          prefill={state.prefill}
          bottomInset={insets.bottom}
          onConfirm={(keep) => {
            applyCvPrefill(state.prefill, keep);
            router.push(TUTOR_BACKGROUND_ROUTE);
          }}
          onRetry={reset}
          onManual={goManual}
        />
      ) : (
        <>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            <FadeIn delay={40}>
              <Text className="mb-1 text-[24px] font-bold text-ink">{t("tutorOnboarding.tutorCv.importMyCv")}</Text>
              <Text className="mb-5 text-[13.5px] text-ink-soft">
                {t("tutorOnboarding.tutorCv.saveTimeWePreFill")}</Text>
            </FadeIn>

            {state.status === "failed" ? (
              <FadeIn delay={0}>
                <FormError message={t("tutorOnboarding.tutorCv.youCanTryAgainOr", { message: state.message })} />
              </FadeIn>
            ) : null}

            {state.status === "uploading" || state.status === "analyzing" ? (
              <FadeIn delay={60}>
                <CvProgress current={progressIndex(state)} />
                <Text className="mt-3 text-center text-[12.5px] text-ink-soft">
                  {t("tutorOnboarding.tutorCv.aFewDozenSecondsYou")}</Text>
              </FadeIn>
            ) : (
              <FadeIn delay={80}>
                <PressableScale onPress={pickAndImport} accessibilityLabel={t("tutorOnboarding.tutorCv.importACv")}>
                  <View className="items-center rounded-2xl border border-dashed border-primary bg-primary-tint/20 px-5 py-8">
                    <View className="mb-3 h-12 w-12 items-center justify-center rounded-full bg-primary-tint">
                      <FileIcon size={22} color="#332E86" />
                    </View>
                    <Text className="text-[15.5px] font-bold text-primary">{t("tutorOnboarding.tutorCv.importACv")}</Text>
                    <Text className="mt-1 text-center text-[12.5px] text-ink-soft">{t("tutorOnboarding.tutorCv.pdfWordPhotoOrScan")}</Text>
                  </View>
                </PressableScale>
              </FadeIn>
            )}

            <FadeIn delay={120}>
              <View className="mt-5 flex-row items-start gap-2 rounded-lg border border-line bg-surface p-3">
                <SparklesIcon size={14} color="#332E86" />
                <Text className="flex-1 text-[12.5px] text-ink-soft">
                  {t("tutorOnboarding.tutorCv.theAnalysisCanBeWrong")}</Text>
              </View>
            </FadeIn>
          </ScrollView>

          <View
            className="border-t border-line-soft bg-surface px-5 pt-4"
            style={{ paddingBottom: Math.max(insets.bottom, 22) }}
          >
            <Button
              label={t("tutorOnboarding.tutorCv.iEnterMyBackgroundBy")}
              variant="ghost"
              disabled={state.status === "uploading" || state.status === "analyzing"}
              onPress={goManual}
            />
          </View>
        </>
      )}
    </View>
  );
}

const PROGRESS_STEPS = [
  { get label() { return tr("tutorOnboarding.tutorCv.sendingTheCv"); }, get detail() { return tr("tutorOnboarding.tutorCv.yourFileIsTransmittedSecurely"); } },
  { get label() { return tr("tutorOnboarding.tutorCv.readingTheDocument"); }, get detail() { return tr("tutorOnboarding.tutorCv.cvTextWithCharacterRecognition"); } },
  { get label() { return tr("tutorOnboarding.tutorCv.identifyingTheBackground"); }, get detail() { return tr("tutorOnboarding.tutorCv.educationExperienceProjectsAndTheir"); } },
  { get label() { return tr("tutorOnboarding.tutorCv.matchingWithTheSubjects"); }, get detail() { return tr("tutorOnboarding.tutorCv.yourSubjectsAndSkillsAre"); } },
] as const;

/** Étape en cours, d'après l'état de l'import : tant que le serveur n'a pas commencé, on est à la lecture. */
function progressIndex(state: CvImportState): number {
  if (state.status === "uploading") return 0;
  if (state.status !== "analyzing") return PROGRESS_STEPS.length;
  if (state.stage === "MATCHING") return 3;
  if (state.stage === "ANALYZING") return 2;
  return 1;
}

/** Les étapes de l'import : faites (coche), en cours (indicateur), à venir (point). */
function CvProgress({ current }: { current: number }) {
  return (
    <View className="rounded-2xl border border-line bg-surface p-5" accessibilityRole="progressbar" accessibilityLabel={PROGRESS_STEPS[current]?.label}>
      {PROGRESS_STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <View key={step.label} className={["flex-row items-start gap-3", index > 0 ? "mt-4" : ""].join(" ")}>
            <View className="mt-[1px] h-5 w-5 items-center justify-center">
              {done ? (
                <CheckIcon size={16} color="#0E9C82" />
              ) : active ? (
                <ActivityIndicator size="small" color="#332E86" />
              ) : (
                <View className="h-2 w-2 rounded-full bg-line" />
              )}
            </View>
            <View className="flex-1">
              <Text className={["text-[14.5px]", active ? "font-bold text-ink" : done ? "text-ink-soft" : "text-ink-faint"].join(" ")}>
                {step.label}
              </Text>
              {active ? <Text className="mt-0.5 text-[12.5px] text-ink-soft">{step.detail}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

type ReviewProps = {
  prefill: CvPrefillDto;
  bottomInset: number;
  onConfirm: (keep: { education: boolean; experiences: number[]; skills: number[] }) => void;
  onRetry: () => void;
  onManual: () => void;
};

/** Relecture : le tuteur décoche ce qui est faux ; le reste pré-remplit le formulaire, où il pourra encore tout modifier. */
function Review({ prefill, bottomInset, onConfirm, onRetry, onManual }: ReviewProps) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState(() => fullSelection(prefill));
  const education = prefill.education.find((e) => e.degreeId) ?? prefill.education[0];

  const toggle = (kind: "experiences" | "skills", index: number) =>
    setSelection((current) => {
      const next = new Set(current[kind]);
      if (!next.delete(index)) next.add(index);
      return { ...current, [kind]: next };
    });

  const nothing = !selection.education && selection.experiences.size === 0 && selection.skills.size === 0;

  return (
    <>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <FadeIn delay={40}>
          <Text className="mb-1 text-[24px] font-bold text-ink">{t("tutorOnboarding.tutorCv.checkYourCv")}</Text>
          <View className="mb-4 flex-row items-start gap-2 rounded-lg bg-accent-tint/40 px-3.5 py-2.5">
            <CheckIcon size={14} color="#0E9C82" />
            <Text className="flex-1 text-[12.5px] font-semibold text-accent">
              {t("tutorOnboarding.tutorCv.wePreFilledFromYour")}</Text>
          </View>
          {prefill.warnings.map((warning) => (
            <InlineWarning key={warning} message={warning} spaced />
          ))}
        </FadeIn>

        {education ? (
          <FadeIn delay={80}>
            <SectionTitle label={t("tutorOnboarding.tutorCv.education")} />
            <SelectableCard checked={selection.education} onToggle={() => setSelection((c) => ({ ...c, education: !c.education }))}>
              <Text className="text-[14.5px] font-bold text-ink">
                {education.degreeId ? DEGREE_LABELS[education.degreeId] : (education.degreeLabel ?? t("tutorOnboarding.tutorCv.education"))}
                {education.level ? ` · ${education.level}` : ""}
              </Text>
              <Text className="mt-0.5 text-[12.5px] text-ink-soft">
                {[education.field, education.institution, education.period].filter(Boolean).join(" • ") || "—"}
              </Text>
              {education.warnings.map((w) => (
                <InlineWarning key={w} message={w} />
              ))}
            </SelectableCard>
          </FadeIn>
        ) : null}

        <FadeIn delay={110}>
          <SectionTitle label={t("tutorOnboarding.tutorCv.experience", { length: prefill.experiences.length })} />
          {prefill.experiences.length === 0 ? <Text className="text-[13px] text-ink-faint">{t("tutorOnboarding.tutorCv.noExperienceDetected")}</Text> : null}
          <View className="gap-2.5">
            {prefill.experiences.map((x, index) => (
              <SelectableCard key={`${x.title}-${index}`} checked={selection.experiences.has(index)} onToggle={() => toggle("experiences", index)}>
                <View className="mb-1 self-start rounded-full bg-primary-tint px-2.5 py-0.5">
                  <Text className="text-[11px] font-bold text-primary">{experienceTypeLabel(experienceFromCv(x).type)}</Text>
                </View>
                <Text className="text-[14.5px] font-bold text-ink">{x.title}</Text>
                <Text className="mt-0.5 text-[12.5px] text-ink-soft">{[x.organization, x.period].filter(Boolean).join(" • ") || "—"}</Text>
                {x.audience.length > 0 ? <Text className="mt-0.5 text-[12px] text-ink-soft">{t("tutorOnboarding.tutorCv.audience", { join: x.audience.join(", ") })}</Text> : null}
                {x.subjectsTaught ? <Text className="text-[12px] text-ink-soft">{t("tutorOnboarding.tutorCv.subjects", { subjectsTaught: x.subjectsTaught })}</Text> : null}
                {x.warnings.map((w) => (
                  <InlineWarning key={w} message={w} />
                ))}
              </SelectableCard>
            ))}
          </View>
        </FadeIn>

        {prefill.skills.length > 0 ? (
          <FadeIn delay={140}>
            <SectionTitle label={t("tutorOnboarding.tutorCv.subjectsDetected")} />
            <View className="gap-2">
              {prefill.skills.map((skill, index) => {
                const matched = !!skill.subject;
                return (
                  <SelectableCard
                    key={`${skill.label}-${index}`}
                    checked={matched && selection.skills.has(index)}
                    disabled={!matched}
                    onToggle={() => toggle("skills", index)}
                  >
                    <Text className="text-[14px] font-semibold text-ink">{skill.subject?.name ?? skill.label}</Text>
                    {matched ? (
                      skill.subject && skill.subject.name !== skill.label ? (
                        <Text className="text-[12px] text-ink-soft">{t("tutorOnboarding.tutorCv.readInTheCv", { label: skill.label })}</Text>
                      ) : null
                    ) : (
                      <InlineWarning message={t("tutorOnboarding.tutorCv.notInTheCatalogueYou")} />
                    )}
                  </SelectableCard>
                );
              })}
            </View>
          </FadeIn>
        ) : null}
      </ScrollView>

      <View className="gap-2 border-t border-line-soft bg-surface px-5 pt-4" style={{ paddingBottom: Math.max(bottomInset, 22) }}>
        <Button
          label={nothing ? t("tutorOnboarding.tutorCv.continueWithoutImportingAnything") : t("tutorOnboarding.tutorCv.confirmAndContinue")}
          onPress={() =>
            nothing
              ? onManual()
              : onConfirm({
                  education: selection.education,
                  experiences: [...selection.experiences],
                  skills: [...selection.skills],
                })
          }
        />
        <PressableScale onPress={onRetry} accessibilityLabel={t("tutorOnboarding.tutorCv.importAnotherCv")}>
          <Text className="py-1 text-center text-[13px] font-semibold text-primary">{t("tutorOnboarding.tutorCv.importAnotherCv")}</Text>
        </PressableScale>
      </View>
    </>
  );
}

function SectionTitle({ label }: { label: string }) {
  return <Text className="mb-2 mt-4 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{label}</Text>;
}

function SelectableCard({
  checked,
  disabled,
  onToggle,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <PressableScale onPress={onToggle} disabled={disabled} accessibilityLabel={checked ? t("tutorOnboarding.tutorCv.removeFromTheImport") : t("tutorOnboarding.tutorCv.importThisItem")}>
      <View
        className={[
          "flex-row items-start gap-3 rounded-xl border p-3.5",
          checked ? "border-primary bg-primary-tint/20" : "border-line bg-surface",
          disabled ? "opacity-70" : "",
        ].join(" ")}
      >
        <View
          className={[
            "mt-0.5 h-5 w-5 items-center justify-center rounded-[6px] border-2",
            checked ? "border-primary bg-primary" : "border-line bg-surface",
          ].join(" ")}
        >
          {checked ? <CheckIcon size={11} color="#fff" /> : disabled ? <XIcon size={10} color="#9799AF" /> : null}
        </View>
        <View className="flex-1">{children}</View>
      </View>
    </PressableScale>
  );
}

