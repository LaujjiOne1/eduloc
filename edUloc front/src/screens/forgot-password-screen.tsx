import { type Href, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/ui/code-input";
import { FormError } from "@/components/ui/form-error";
import { TextField } from "@/components/ui/text-field";
import { useForgotPassword } from "@/hooks/use-forgot-password";
import { useTranslation } from "react-i18next";

const LOGIN_ROUTE = "/login" as Href;

export function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const form = useForgotPassword();

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-paper"
      style={{ paddingTop: insets.top }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AuthHeader onBack={() => router.back()} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {form.step === "email" ? (
          <>
            <FadeIn delay={40}>
              <Text className="mb-[6px] text-[25px] font-bold text-ink">{t("common.forgotPassword")}</Text>
              <Text className="mb-6 text-[14px] text-ink-soft">
                {t("screens.forgotPassword.enterYourAccountEmailWe")}</Text>
            </FadeIn>
            <FadeIn delay={100}>
              {form.formError ? <FormError message={form.formError} /> : null}
              <TextField
                label={t("common.email")}
                value={form.email}
                onChangeText={form.setEmail}
                placeholder={t("common.youEmailCom")}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                error={form.fieldErrors.email}
                editable={!form.isSubmitting}
              />
              <View className="mt-2">
                <Button
                  label={t("screens.forgotPassword.sendTheCode")}
                  loading={form.isSubmitting}
                  loadingLabel={t("common.sending")}
                  disabled={!form.email.trim() || form.isSubmitting}
                  onPress={form.requestCode}
                  fullWidth
                />
              </View>
            </FadeIn>
          </>
        ) : null}

        {form.step === "reset" ? (
          <>
            <FadeIn delay={40}>
              <Text className="mb-[6px] text-[25px] font-bold text-ink">{t("screens.forgotPassword.newPassword")}</Text>
              <Text className="mb-6 text-[14px] text-ink-soft">
                {t("screens.forgotPassword.ifAccountExistsFor")} <Text className="font-bold text-ink">{form.email.trim()}</Text>{t("screens.forgotPassword.codeJustSent")}
              </Text>
            </FadeIn>
            <FadeIn delay={100}>
              {form.formError ? <FormError message={form.formError} /> : null}
              <View className="mb-5">
                <CodeInput value={form.code} onChange={form.setCode} disabled={form.isSubmitting} hasError={!!form.formError} />
              </View>
              <TextField
                label={t("screens.forgotPassword.newPassword")}
                value={form.password}
                onChangeText={form.setPassword}
                placeholder={t("screens.forgotPassword.n8CharactersMinimum")}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                error={form.fieldErrors.password}
                editable={!form.isSubmitting}
              />
              <View className="mt-2">
                <Button
                  label={t("screens.forgotPassword.changeThePassword")}
                  loading={form.isSubmitting}
                  loadingLabel={t("common.saving")}
                  disabled={form.code.length !== 6 || !form.password || form.isSubmitting}
                  onPress={form.resetPassword}
                  fullWidth
                />
              </View>
              <PressableScale onPress={form.backToEmail} accessibilityLabel={t("screens.forgotPassword.useAnotherEmailAddress")}>
                <Text className="mt-5 text-center text-[13.5px] font-semibold text-primary">{t("screens.forgotPassword.useAnotherAddress")}</Text>
              </PressableScale>
            </FadeIn>
          </>
        ) : null}

        {form.step === "done" ? (
          <FadeIn delay={40}>
            <Text className="mb-[6px] text-[25px] font-bold text-ink">{t("screens.forgotPassword.passwordChanged")}</Text>
            <Text className="mb-6 text-[14px] text-ink-soft">
              {t("screens.forgotPassword.yourDevicesWereSignedOut")}</Text>
            <Button label={t("common.signIn")} onPress={() => router.replace(LOGIN_ROUTE)} fullWidth />
          </FadeIn>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
