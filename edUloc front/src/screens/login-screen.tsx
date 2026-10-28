import { type Href, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useState } from "react";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { TextField } from "@/components/ui/text-field";
import { useLoginForm } from "@/hooks/use-login-form";
import { routeAfterAuth } from "@/lib/auth-routing";
import { AuthService } from "@/services/auth.service";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/ui/language-selector";

const SIGNUP_ROUTE = "/signup" as Href;
const VERIFY_ROUTE = "/verify" as Href;
const FORGOT_PASSWORD_ROUTE = "/forgot-password" as Href;
const PARTNER_DASHBOARD_ROUTE = "/partner-dashboard" as Href;

/** Connexion Google / Apple : pas encore prise en charge par le serveur — masquée plutôt que cassée. */
const SOCIAL_LOGIN_ENABLED = false;

export function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setUser = useAuthStore((s) => s.setUser);
  const setPendingUser = useAuthStore((s) => s.setPendingUser);
  const setReturnTo = useAuthStore((s) => s.setReturnTo);
  // « Je gère un lieu d'étude » : après connexion (ou inscription + code), on arrive directement sur l'espace lieux partenaires.
  const [partnerIntent, setPartnerIntent] = useState(false);

  const {
    email,
    setEmail,
    password,
    setPassword,
    fieldErrors,
    formError,
    isSubmitting,
    providerPending,
    submit,
    continueWithProvider,
    canSubmit,
  } = useLoginForm(
    (user) => {
      setUser(user);
      // Réservation en cours → bénéficiaire ; onboarding tuteur → identité ; sinon l'espace de l'utilisateur.
      router.replace(routeAfterAuth(user));
    },
    (unverifiedEmail) => {
      // Compte créé mais jamais vérifié : on renvoie un code et on ouvre la saisie.
      setPendingUser({
        id: "",
        firstName: "",
        lastName: "",
        email: unverifiedEmail,
        emailVerified: false,
        status: "pending_verification",
        selfBeneficiaryId: null,
        tutor: null,
        isAdmin: false,
      });
      void AuthService.resendVerification(unverifiedEmail).catch(() => undefined);
      router.push(VERIFY_ROUTE);
    },
  );

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-paper"
      style={{ paddingTop: insets.top }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AuthHeader onBack={() => router.back()} right={<LanguageSelector />} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={40}>
          <Text className="mb-[6px] text-[25px] font-bold text-ink">{t("screens.login.signInToContinue")}</Text>
          <Text className="mb-[26px] text-[14px] text-ink-soft">
            {t("screens.login.yourSlotIsHeldFor")}</Text>
        </FadeIn>

        {SOCIAL_LOGIN_ENABLED ? (
        <FadeIn delay={100}>
          <View className="mb-5 gap-[10px]">
            <Button
              label={t("screens.login.continueWithGoogle")}
              variant="ghost"
              icon={<View className="h-[18px] w-[18px] rounded bg-ink" />}
              loading={providerPending === "google"}
              loadingLabel={t("screens.login.signingIn")}
              disabled={isSubmitting || (providerPending !== null && providerPending !== "google")}
              onPress={() => continueWithProvider("google")}
            />
            <Button
              label={t("screens.login.continueWithApple")}
              variant="ghost"
              icon={<View className="h-[18px] w-[18px] rounded bg-ink" />}
              loading={providerPending === "apple"}
              loadingLabel={t("screens.login.signingIn")}
              disabled={isSubmitting || (providerPending !== null && providerPending !== "apple")}
              onPress={() => continueWithProvider("apple")}
            />
          </View>
        </FadeIn>
        ) : null}

        {SOCIAL_LOGIN_ENABLED ? (
        <FadeIn delay={150}>
          <View className="my-5 flex-row items-center gap-3">
            <View className="h-px flex-1 bg-line-soft" />
            <Text className="text-[12.5px] font-semibold text-ink-faint">{t("screens.login.or")}</Text>
            <View className="h-px flex-1 bg-line-soft" />
          </View>
        </FadeIn>
        ) : null}

        <FadeIn delay={200}>
          {formError ? <FormError message={formError} /> : null}

          <TextField
            label={t("common.email")}
            value={email}
            onChangeText={setEmail}
            placeholder={t("common.youEmailCom")}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            error={fieldErrors.email}
            editable={!isSubmitting}
          />
          <TextField
            label={t("common.password")}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            error={fieldErrors.password}
            editable={!isSubmitting}
          />

          <PressableScale onPress={() => router.push(FORGOT_PASSWORD_ROUTE)} accessibilityLabel={t("common.forgotPassword")}>
            <Text className="mb-1 mt-1 text-right text-[13px] font-semibold text-primary">{t("screens.login.forgotYourPassword")}</Text>
          </PressableScale>

          <View className="mt-2">
            <Button
              label={t("common.signIn")}
              loading={isSubmitting}
              loadingLabel={t("screens.login.signingIn")}
              disabled={!canSubmit}
              onPress={submit}
              fullWidth
            />
          </View>

          <View className="mt-[22px] flex-row justify-center">
            <Text className="text-[14px] text-ink-soft">{t("screens.login.donTHaveAnAccount")}</Text>
            <PressableScale onPress={() => router.push(SIGNUP_ROUTE)} accessibilityLabel={t("common.createAnAccount")}>
              <Text className="text-[14px] font-bold text-primary">{t("common.createAnAccount")}</Text>
            </PressableScale>
          </View>

          <View className="mt-4 items-center">
            <PressableScale
              onPress={() => {
                setPartnerIntent(true);
                setReturnTo(PARTNER_DASHBOARD_ROUTE);
              }}
              accessibilityLabel={t("screens.login.iManageAStudyVenue")}
            >
              <Text className="text-[13.5px] font-bold text-primary">{t("screens.login.iManageAStudyVenue")}</Text>
            </PressableScale>
            {partnerIntent ? (
              <Text className="mt-2 text-center text-[12.5px] leading-[18px] text-ink-soft">
                {t("screens.login.signInOrCreateAn")}</Text>
            ) : null}
          </View>
        </FadeIn>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
