import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { VerifiedBadgeIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/ui/code-input";
import { FormError } from "@/components/ui/form-error";
import { useVerifyForm } from "@/hooks/use-verify-form";
import { routeAfterAuth } from "@/lib/auth-routing";
import { useAuthStore } from "@/store/auth.store";
import type { AuthenticatedUser } from "@/types/auth";
import { useTranslation } from "react-i18next";

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  return `${name.charAt(0)}${"•".repeat(Math.max(name.length - 1, 3))}@${domain}`;
}

export function VerifyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pendingUser = useAuthStore((s) => s.pendingUser);
  const setUser = useAuthStore((s) => s.setUser);
  const verified = useRef(false);

  const email = pendingUser?.email ?? "";

  // Le serveur ouvre la session à la validation du code : on enchaîne directement sur la suite du
  // workflow (réservation en cours → bénéficiaire, onboarding tuteur → identité, sinon l'espace demandeur).
  const handleVerified = useCallback(
    (user: AuthenticatedUser) => {
      verified.current = true;
      setUser(user);
      router.replace(routeAfterAuth(user));
    },
    [router, setUser],
  );

  const { code, setCode, formError, info, isSubmitting, isResending, cooldown, submit, resend, canSubmit, canResend } =
    useVerifyForm(email, handleVerified);

  // Garde : sans inscription en cours il n'y a aucun e-mail à confirmer — retour à l'inscription
  // plutôt qu'un « code envoyé à » sans destinataire.
  useEffect(() => {
    if (!pendingUser && !verified.current) router.replace(useAuthStore.getState().user ? "/home" : "/signup");
  }, [pendingUser, router]);

  if (!pendingUser) return null;

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />

      <View className="flex-1 items-center px-6 pt-6">
        <FadeIn delay={30}>
          <View className="mb-5 h-14 w-14 items-center justify-center rounded-full bg-primary-tint">
            <VerifiedBadgeIcon size={26} color="#332E86" />
          </View>
        </FadeIn>

        <FadeIn delay={70}>
          <Text className="mb-2 text-center text-[23px] font-bold text-ink">{t("booking.verify.verifyYourAccount")}</Text>
          <Text className="mb-[26px] text-center text-[14px] text-ink-soft">
            {t("booking.verify.codeSentTo")}{"\n"}
            <Text className="font-bold text-ink">{maskEmail(email)}</Text>
          </Text>
        </FadeIn>

        <FadeIn delay={110}>
          <View className="w-full">
            {formError ? <FormError message={formError} /> : null}
            <CodeInput value={code} onChange={setCode} disabled={isSubmitting} hasError={!!formError} />
            {info ? <Text className="mt-3 text-center text-[13px] text-accent">{info}</Text> : null}
          </View>
        </FadeIn>

        <FadeIn delay={150}>
          <View className="mt-6 items-center">
            <Text className="text-[13px] text-ink-soft">{t("booking.verify.didnTReceiveAnything")}</Text>
            <PressableScale
              onPress={resend}
              disabled={!canResend}
              accessibilityLabel={t("common.resendTheCode")}
            >
              <Text className={["mt-1 text-[14px] font-bold", canResend ? "text-primary" : "text-ink-faint"].join(" ")}>
                {isResending ? t("common.sending") : cooldown > 0 ? t("booking.verify.resendTheCodeS", { cooldown }) : t("common.resendTheCode")}
              </Text>
            </PressableScale>
          </View>
        </FadeIn>
      </View>

      <View
        className="border-t border-line-soft bg-surface px-5 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 22) }}
      >
        <Button
          label={t("booking.verify.confirm")}
          loading={isSubmitting}
          loadingLabel={t("booking.verify.verifying")}
          disabled={!canSubmit}
          onPress={submit}
        />
      </View>
    </View>
  );
}
