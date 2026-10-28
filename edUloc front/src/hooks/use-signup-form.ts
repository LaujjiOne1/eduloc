import { useCallback, useState } from "react";

import { AuthService, AuthServiceError } from "@/services/auth.service";
import type { AuthenticatedUser } from "@/types/auth";
import { t } from "@/i18n";

type Field = "firstName" | "lastName" | "email" | "phone" | "password";
type FieldErrors = Partial<Record<Field, string>>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+\d][\d\s-]{7,}$/;
const MIN_PASSWORD_LENGTH = 8;

export function useSignupForm(onSuccess: (user: AuthenticatedUser) => void) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = useCallback(() => {
    const errors: FieldErrors = {};
    if (!firstName.trim()) errors.firstName = t("common.firstNameIsRequired");
    if (!lastName.trim()) errors.lastName = t("hooks.useSignupForm.lastNameIsRequired");
    if (!email.trim()) errors.email = t("common.emailIsRequired");
    else if (!EMAIL_REGEX.test(email.trim())) errors.email = t("common.invalidEmailFormat");
    if (!phone.trim()) errors.phone = t("hooks.useSignupForm.phoneNumberIsRequired");
    else if (!PHONE_REGEX.test(phone.trim())) errors.phone = t("common.invalidPhoneNumberFormat");
    if (!password) errors.password = t("common.passwordIsRequired");
    else if (password.length < MIN_PASSWORD_LENGTH)
      errors.password = t("common.atLeastCharacters", { MIN_PASSWORD_LENGTH });
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [firstName, lastName, email, phone, password]);

  const submit = useCallback(async () => {
    if (isSubmitting) return;
    setFormError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const user = await AuthService.signup({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
      });
      onSuccess(user);
    } catch (error) {
      setFormError(
        error instanceof AuthServiceError ? error.message : t("common.anErrorOccurredPleaseTry"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [firstName, lastName, email, phone, password, isSubmitting, validate, onSuccess]);

  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().length > 0 &&
    phone.trim().length > 0 &&
    password.length > 0 &&
    !isSubmitting;

  return {
    firstName,
    setFirstName,
    lastName,
    setLastName,
    email,
    setEmail,
    phone,
    setPhone,
    password,
    setPassword,
    fieldErrors,
    formError,
    isSubmitting,
    submit,
    canSubmit,
  };
}
