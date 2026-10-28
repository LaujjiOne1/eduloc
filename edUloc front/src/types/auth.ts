export interface AuthenticatedUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  emailVerified: boolean; // [v1+]
  status: "active" | "suspended" | "pending_verification"; // [v1+]
  /** [v1+] Bénéficiaire SELF — remplace CURRENT_BENEFICIARY_ID */
  selfBeneficiaryId: string | null;
  /** [v1+] Rôle tuteur — remplace CURRENT_TUTOR_ID */
  tutor: {
    tutorProfileId: string;
    applicationStatus: "draft" | "pending" | "approved" | "rejected";
    isVisible: boolean;
    isSuspended: boolean;
  } | null;
  isAdmin: boolean; // [v1+]
  /** Alarme de cours (paramètre du compte) : rappel avant chaque séance confirmée. */
  lessonAlarm?: LessonAlarm;
}

export const LESSON_ALARM_LEADS = [10, 15, 30, 60] as const;

export interface LessonAlarm {
  enabled: boolean;
  leadMinutes: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}

export type OAuthProvider = "google" | "apple";

export type AuthErrorCode =
  | "invalid_credentials"
  | "email_already_used"
  | "validation_error"
  | "provider_not_configured"
  | "invalid_code"
  | "code_expired"
  | "too_many_requests"
  | "network_error"
  | "server_error";
