import { useCallback, useState } from "react";

import { AuthService, AuthServiceError } from "@/services/auth.service";
import type { AuthenticatedUser, OAuthProvider } from "@/types/auth";
import { t } from "@/i18n";

type FieldErrors = Partial<Record<"email" | "password", string>>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param onNeedsVerification appelé quand le compte existe mais que l'e-mail n'est pas vérifié
 *        (403 EMAIL_NOT_VERIFIED) : l'écran envoie vers la saisie du code.
 */
export function useLoginForm(
  onSuccess: (user: AuthenticatedUser) => void,
  onNeedsVerification?: (email: string) => void,
) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [providerPending, setProviderPending] = useState<OAuthProvider | null>(null);

  const validate = useCallback(() => {
    const errors: FieldErrors = {};
    if (!email.trim()) errors.email = t("common.emailIsRequired");
    else if (!EMAIL_REGEX.test(email.trim())) errors.email = t("common.invalidEmailFormat");
    if (!password) errors.password = t("common.passwordIsRequired");
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [email, password]);

  const submit = useCallback(async () => {
    if (isSubmitting || providerPending) return;
    setFormError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const user = await AuthService.login({ email: email.trim(), password });
      onSuccess(user);
    } catch (error) {
      if (error instanceof AuthServiceError && error.code === "email_not_verified" && onNeedsVerification) {
        onNeedsVerification(email.trim());
        return;
      }
      setFormError(
        error instanceof AuthServiceError ? error.message : t("common.anErrorOccurredPleaseTry"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [email, password, isSubmitting, providerPending, validate, onSuccess, onNeedsVerification]);

  const continueWithProvider = useCallback(
    async (provider: OAuthProvider) => {
      if (isSubmitting || providerPending) return;
      setFormError(null);
      setProviderPending(provider);
      try {
        const user = await AuthService.loginWithProvider(provider);
        onSuccess(user);
      } catch (error) {
        setFormError(
          error instanceof AuthServiceError ? error.message : t("common.anErrorOccurredPleaseTry"),
        );
      } finally {
        setProviderPending(null);
      }
    },
    [isSubmitting, providerPending, onSuccess],
  );

  return {
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
    canSubmit: email.trim().length > 0 && password.length > 0 && !isSubmitting && !providerPending,
  };
}
