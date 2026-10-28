import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
// The birth-date field expands into a draggable wheel picker (vertical pan)
// right inside this scroll view — react-native-gesture-handler's ScrollView
// is needed here so its own vertical scroll gesture correctly yields to the
// wheel's GestureDetector instead of swallowing the drag (plain RN
// ScrollView doesn't participate in RNGH's gesture arbitration).
import { ScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FadeIn } from "@/components/motion/fade-in";
import { TutorAvatar } from "@/components/ui/tutor-avatar";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { BirthDateField } from "@/components/ui/birth-date-field";
import { Button } from "@/components/ui/button";
import { PhoneInputField } from "@/components/ui/phone-input-field";
import { StepProgress } from "@/components/ui/step-progress";
import { useAuthStore } from "@/store/auth.store";
import { useTutorApplicationStore } from "@/store/tutor-application.store";
import { useTranslation } from "react-i18next";

// L'import de CV est facultatif : il se propose juste avant le parcours, et se passe en un clic.
const TUTOR_CV_ROUTE = "/tutor-cv" as Href;
const TOTAL_STEPS = 9;

const PHONE_REGEX = /^[+\d][\d\s-]{7,}$/;
const BIRTH_DATE_REGEX = /^(\d{2})[/ ]+(\d{2})[/ ]+(\d{4})$/;

type Field = "gender" | "birthDate" | "phone";
type FieldErrors = Partial<Record<Field, string>>;

export function TutorIdentityScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const authUser = useAuthStore((s) => s.user);
  const identity = useTutorApplicationStore((s) => s.identity);
  const setIdentity = useTutorApplicationStore((s) => s.setIdentity);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Le candidat est déjà inscrit : nom, prénom, e-mail et téléphone viennent de son compte et ne sont plus saisis ici.
  // L'e-mail du dossier DOIT être celui du compte (le serveur refuse sinon : ACCOUNT_EMAIL_MISMATCH), y compris si
  // un autre compte a rempli ce formulaire avant : on réaligne donc toujours l'identité sur le compte connecté.
  useEffect(() => {
    if (!authUser) return;
    const patch: Partial<typeof identity> = {};
    if (identity.email !== authUser.email) patch.email = authUser.email;
    if (identity.firstName !== authUser.firstName) patch.firstName = authUser.firstName;
    if (identity.lastName !== authUser.lastName) patch.lastName = authUser.lastName;
    if (authUser.phone && identity.phone !== authUser.phone) patch.phone = authUser.phone;
    if (Object.keys(patch).length) setIdentity(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]);

  // Exception : un compte sans téléphone (le dossier tuteur en exige un) le saisit ici.
  const needsPhone = !authUser?.phone;

  const canContinue =
    !!identity.gender && identity.birthDate.trim().length > 0 && (!needsPhone || identity.phone.trim().length > 0);

  const continueToBackground = () => {
    const errors: FieldErrors = {};
    if (!identity.gender) errors.gender = t("tutorOnboarding.tutorIdentity.enterYourGenderItDetermines");

    const birthMatch = identity.birthDate.trim().match(BIRTH_DATE_REGEX);
    if (!birthMatch) {
      errors.birthDate = t("tutorOnboarding.tutorIdentity.expectedFormatDdMmYyyy");
    } else {
      const d = parseInt(birthMatch[1], 10);
      const m = parseInt(birthMatch[2], 10);
      const y = parseInt(birthMatch[3], 10);
      const currentYear = new Date().getFullYear();
      if (d < 1 || d > 31 || m < 1 || m > 12) {
        errors.birthDate = t("tutorOnboarding.tutorIdentity.invalidDateOfBirth");
      } else if (y < 1920 || y > currentYear - 15) {
        errors.birthDate = t("tutorOnboarding.tutorIdentity.theYearMustBeBetween", { value: currentYear - 15 });
      }
    }

    if (needsPhone && !PHONE_REGEX.test(identity.phone.trim())) errors.phone = t("common.invalidPhoneNumberFormat");
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    router.push(TUTOR_CV_ROUTE);
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-paper"
      style={{ paddingTop: insets.top }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AuthHeader onBack={() => router.back()} />
      <StepProgress step={1} total={TOTAL_STEPS} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={40}>
          <Text className="mb-1 text-[24px] font-bold text-ink">{t("tutorOnboarding.tutorIdentity.aFewMoreDetails")}</Text>
          <Text className="mb-5 text-[13.5px] text-ink-soft">
            {t("tutorOnboarding.tutorIdentity.yourNamePhoneNumberAnd")}</Text>
        </FadeIn>

        <FadeIn delay={90}>
          {/* Sexe : détermine l'avatar par défaut (silhouette) du tuteur */}
          <View className="mb-[14px]">
            <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{t("tutorOnboarding.tutorIdentity.gender")}</Text>
            <View className="flex-row gap-3">
              {([
                { id: "male", label: t("tutorOnboarding.tutorIdentity.male") },
                { id: "female", label: t("tutorOnboarding.tutorIdentity.female") },
              ] as const).map((option) => {
                const active = identity.gender === option.id;
                return (
                  <PressableScale
                    key={option.id}
                    onPress={() => setIdentity({ gender: option.id })}
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected: active }}
                    style={{ flex: 1 }}
                  >
                    <View className={["flex-row items-center gap-3 rounded-lg border px-3 py-2.5", active ? "border-primary bg-primary-tint/40" : fieldErrors.gender ? "border-error bg-surface" : "border-line bg-surface"].join(" ")}>
                      <TutorAvatar gender={option.id} size={40} />
                      <Text className={["text-[14.5px] font-bold", active ? "text-primary" : "text-ink-soft"].join(" ")}>{option.label}</Text>
                    </View>
                  </PressableScale>
                );
              })}
            </View>
            {fieldErrors.gender ? <Text className="mt-[6px] ml-0.5 text-[12.5px] text-error">{fieldErrors.gender}</Text> : null}
          </View>
          <BirthDateField
            label={t("common.dateOfBirth")}
            value={identity.birthDate}
            onChangeText={(birthDate) => setIdentity({ birthDate })}
            error={fieldErrors.birthDate}
          />
          {needsPhone ? (
            <PhoneInputField
              label={t("common.phone")}
              value={identity.phone}
              onChangeText={(phone) => setIdentity({ phone })}
              error={fieldErrors.phone}
            />
          ) : null}
        </FadeIn>
      </ScrollView>

      <View
        className="border-t border-line-soft bg-surface px-5 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 22) }}
      >
        <Button label={t("common.continue")} disabled={!canContinue} onPress={continueToBackground} />
      </View>
    </KeyboardAvoidingView>
  );
}
