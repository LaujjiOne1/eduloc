import { useCallback, useEffect, useRef, useState } from "react";

import { AuthService, AuthServiceError } from "@/services/auth.service";
import type { AuthenticatedUser } from "@/types/auth";
import { t } from "@/i18n";

const CODE_LENGTH = 6;
/** Délai avant de pouvoir redemander un code (le serveur limite à 3 envois / heure). */
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Confirmation de l'e-mail par le code à 6 chiffres reçu par mail. Le serveur ouvre la session
 * à la validation : pas de reconnexion, `onSuccess` reçoit l'utilisateur connecté.
 */
export function useVerifyForm(email: string, onSuccess: (user: AuthenticatedUser) => void) {
  const [code, setCodeState] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const submittingRef = useRef(false);

  // Compte à rebours du renvoi (1 s).
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const submitCode = useCallback(
    async (value: string) => {
      if (submittingRef.current) return;
      if (value.length !== CODE_LENGTH) {
        setFormError(t("common.enterThe6DigitsOf"));
        return;
      }
      submittingRef.current = true;
      setFormError(null);
      setInfo(null);
      setIsSubmitting(true);
      try {
        onSuccess(await AuthService.verifyEmail(email, value));
      } catch (error) {
        setFormError(
          error instanceof AuthServiceError ? error.message : t("common.anErrorOccurredPleaseTry"),
        );
        setCodeState("");
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [email, onSuccess],
  );

  const setCode = useCallback(
    (next: string) => {
      const digits = next.replace(/\D/g, "").slice(0, CODE_LENGTH);
      setCodeState(digits);
      setFormError(null);
      // Soumission automatique dès le dernier chiffre (saisi ou collé).
      if (digits.length === CODE_LENGTH) void submitCode(digits);
    },
    [submitCode],
  );

  const resend = useCallback(async () => {
    if (isResending || cooldown > 0 || !email) return;
    setFormError(null);
    setInfo(null);
    setIsResending(true);
    try {
      await AuthService.resendVerification(email);
      setInfo(t("hooks.useVerifyForm.aNewCodeHasJust"));
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setCodeState("");
    } catch (error) {
      setFormError(
        error instanceof AuthServiceError ? error.message : t("hooks.useVerifyForm.unableToResendTheCode"),
      );
    } finally {
      setIsResending(false);
    }
  }, [email, isResending, cooldown]);

  return {
    code,
    setCode,
    formError,
    info,
    isSubmitting,
    isResending,
    cooldown,
    submit: () => submitCode(code),
    resend,
    canSubmit: code.length === CODE_LENGTH && !isSubmitting,
    canResend: cooldown <= 0 && !isResending && !isSubmitting,
  };
}
