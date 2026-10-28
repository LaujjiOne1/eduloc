import { type Href, useRouter } from "expo-router";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { XIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { SkillCombobox } from "@/components/ui/skill-combobox";
import { StepProgress } from "@/components/ui/step-progress";
import { useTutorApplicationStore } from "@/store/tutor-application.store";
import { useTranslation } from "react-i18next";

const TUTOR_SUBJECTS_ROUTE = "/tutor-subjects" as Href;
const TOTAL_STEPS = 9;
const MAX_SCOPE_LENGTH = 500;

/**
 * « Qu'enseignez-vous ? » : le tuteur tape, l'app suggère les compétences existantes adaptées à son
 * diplôme, ou propose d'en créer une nouvelle. Pour chaque compétence, il précise le périmètre de son cours.
 */
export function TutorSkillsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const skills = useTutorApplicationStore((s) => s.skills);
  const degree = useTutorApplicationStore((s) => s.background.degree);
  const addSkill = useTutorApplicationStore((s) => s.addSkill);
  const toggleSkill = useTutorApplicationStore((s) => s.toggleSkill);
  const setSkillScope = useTutorApplicationStore((s) => s.setSkillScope);

  const canContinue = skills.length > 0;

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      <StepProgress step={3} total={TOTAL_STEPS} title={t("tutorOnboarding.tutorSkills.skills")} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={40}>
          <Text className="mb-1 text-[24px] font-bold text-ink">{t("tutorOnboarding.tutorSkills.whatDoYouTeach")}</Text>
          <Text className="mb-4 text-[13.5px] text-ink-soft">
            {t("tutorOnboarding.tutorSkills.searchForYourSubjectsAnd")}</Text>
        </FadeIn>

        <FadeIn delay={80}>
          <SkillCombobox degree={degree?.id ?? null} selected={skills} onSelect={addSkill} />
        </FadeIn>

        <View className="mt-5 gap-[10px]">
          {skills.length === 0 ? (
            <View className="items-center rounded-lg border border-dashed border-line px-4 py-6">
              <Text className="text-center text-[13.5px] text-ink-faint">
                {t("tutorOnboarding.tutorSkills.noSkillsAddedYetStart")}</Text>
            </View>
          ) : (
            <Text className="text-[12px] font-semibold uppercase text-ink-faint">
              {t("tutorOnboarding.tutorSkills.yourSkills", { length: skills.length })}</Text>
          )}

          {skills.map((skill) => (
            <FadeIn key={skill.id} delay={40}>
              <View className="rounded-lg border border-primary bg-primary-tint/20 p-3.5">
                <View className="flex-row items-start justify-between gap-2">
                  <View className="flex-1 flex-row flex-wrap items-center gap-2">
                    <Text className="text-[15px] font-bold text-ink">{skill.label}</Text>
                    {skill.category ? (
                      <View className="rounded bg-paper px-2 py-0.5">
                        <Text className="text-[11px] font-semibold text-ink-soft">{skill.category}</Text>
                      </View>
                    ) : null}
                    {skill.isVerified ? null : (
                      <View className="rounded bg-accent-tint px-2 py-0.5">
                        <Text className="text-[11px] font-semibold text-accent">{t("tutorOnboarding.tutorSkills.newValidatedWithYourFile")}</Text>
                      </View>
                    )}
                  </View>
                  <PressableScale onPress={() => toggleSkill(skill)} accessibilityLabel={t("common.remove", { label: skill.label })}>
                    <View className="h-7 w-7 items-center justify-center rounded-full bg-paper">
                      <XIcon size={14} color="#585B78" />
                    </View>
                  </PressableScale>
                </View>

                <Text className="mb-1 mt-3 text-[12.5px] font-semibold text-ink-soft">
                  {t("tutorOnboarding.tutorSkills.lessonScopeOptional")}</Text>
                <TextInput
                  value={skill.scope ?? ""}
                  onChangeText={(value) => setSkillScope(skill.id, value)}
                  placeholder={t("tutorOnboarding.tutorSkills.eGBaccalaureatePreparationCatch")}
                  placeholderTextColor="#9799AF"
                  multiline
                  maxLength={MAX_SCOPE_LENGTH}
                  className="min-h-[60px] rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[14px] text-ink"
                  accessibilityLabel={t("tutorOnboarding.tutorSkills.lessonScope", { label: skill.label })}
                />
              </View>
            </FadeIn>
          ))}
        </View>
      </ScrollView>

      <View
        className="border-t border-line-soft bg-surface px-5 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 22) }}
      >
        <Button
          label={t("tutorOnboarding.tutorSkills.continueWithSkills", { count: skills.length })}
          disabled={!canContinue}
          onPress={() => router.push(TUTOR_SUBJECTS_ROUTE)}
        />
      </View>
    </View>
  );
}
