import { type Href, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HouseIcon, VideoIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { CheckboxCard } from "@/components/ui/selectable-card";
import { StepProgress } from "@/components/ui/step-progress";
import { useTutorApplicationStore } from "@/store/tutor-application.store";
import type { InPersonModeId, LocationFormatId } from "@/types/common";
import { useTranslation } from "react-i18next";
import { t as tr } from "@/i18n";

const TUTOR_LOCATIONS_ROUTE = "/tutor-locations" as Href;
const TOTAL_STEPS = 9;

const FORMAT_OPTIONS: { id: LocationFormatId; label: string; icon: typeof HouseIcon }[] = [
  { id: "in_person", get label() { return tr("common.inPerson2"); }, icon: HouseIcon },
  { id: "online", get label() { return tr("common.online"); }, icon: VideoIcon },
];

const IN_PERSON_OPTIONS: { id: InPersonModeId; label: string; hint: string }[] = [
  { id: "beneficiary_home", get label() { return tr("tutorOnboarding.tutorFormat.iTravelToTheStudent"); }, get hint() { return tr("tutorOnboarding.tutorFormat.inTheAreaYouWill"); } },
  { id: "tutor_home", get label() { return tr("tutorOnboarding.tutorFormat.iWelcomeStudentsAtMy"); }, get hint() { return tr("tutorOnboarding.tutorFormat.atYourAddressItIs"); } },
  { id: "public_place", get label() { return tr("tutorOnboarding.tutorFormat.inAPublicPlace"); }, get hint() { return tr("tutorOnboarding.tutorFormat.libraryCampusCoWorkingSpace"); } },
];

export function TutorFormatScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const formats = useTutorApplicationStore((s) => s.formats);
  const toggleFormat = useTutorApplicationStore((s) => s.toggleFormat);
  const inPersonModes = useTutorApplicationStore((s) => s.inPersonModes);
  const toggleInPersonMode = useTutorApplicationStore((s) => s.toggleInPersonMode);

  const inPerson = formats.includes("in_person");
  // Le présentiel exige de préciser au moins une façon d'enseigner.
  const canContinue = formats.length > 0 && (!inPerson || inPersonModes.length > 0);

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      <StepProgress step={7} total={TOTAL_STEPS} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={40}>
          <Text className="mb-1 text-[24px] font-bold text-ink">
            {t("tutorOnboarding.tutorFormat.howWouldYouLikeTo")}</Text>
          <Text className="mb-5 text-[13.5px] text-ink-soft">{t("tutorOnboarding.tutorFormat.chooseOneOrMoreFormats")}</Text>
        </FadeIn>

        <FadeIn delay={90}>
          <View className="gap-[10px]">
            {FORMAT_OPTIONS.map(({ id, label, icon: Icon }) => (
              <View key={id}>
                <CheckboxCard
                  label={label}
                  selected={formats.includes(id)}
                  onPress={() => toggleFormat(id)}
                  icon={<Icon size={17} color="#332E86" />}
                />
                {id === "in_person" && inPerson ? (
                  <View className="ml-4 mt-[10px] gap-[10px] border-l-2 border-line pl-3">
                    <Text className="text-[12.5px] text-ink-soft">{t("tutorOnboarding.tutorFormat.whereDoYouGiveYour")}</Text>
                    {IN_PERSON_OPTIONS.map((option) => (
                      <View key={option.id}>
                        <CheckboxCard
                          label={option.label}
                          selected={inPersonModes.includes(option.id)}
                          onPress={() => toggleInPersonMode(option.id)}
                        />
                        <Text className="ml-1 mt-1 text-[12px] text-ink-faint">{option.hint}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </FadeIn>
      </ScrollView>

      <View
        className="border-t border-line-soft bg-surface px-5 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 22) }}
      >
        <Button
          label={t("common.continue")}
          disabled={!canContinue}
          onPress={() => router.push(TUTOR_LOCATIONS_ROUTE)}
        />
      </View>
    </View>
  );
}
