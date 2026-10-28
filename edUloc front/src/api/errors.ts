import type { ErrorCode, ProblemDto } from "./contracts/dto";
import { t } from "@/i18n";
import { t as tr } from "@/i18n";

/**
 * Codes d'erreur exposés aux écrans (minuscules — compatibles avec les anciens
 * XServiceError.code : "not_found", "slot_unavailable", "validation_error", "invalid_state"…).
 */
export type AppErrorCode =
  | "validation_error"
  | "unauthorized"
  | "invalid_credentials"
  | "email_not_verified"
  | "email_already_used"
  | "invalid_code"
  | "code_expired"
  | "forbidden"
  | "not_found"
  | "slot_unavailable"
  | "invalid_state"
  | "otp_invalid"
  | "otp_locked"
  | "outside_start_window"
  | "already_reviewed"
  | "offer_inactive"
  | "offer_disabled_by_admin"
  | "tutor_not_approved"
  | "communication_not_allowed"
  | "pending_message_limit"
  | "upload_expired"
  | "application_not_editable"
  | "too_many_requests"
  | "provider_not_configured"
  | "account_disabled"
  | "geocoding_unavailable"
  | "permission_denied"
  | "position_unavailable"
  | "network_error"
  | "timeout"
  | "server_error";

/**
 * Problem.code (API) → code écran. Les codes absents de la table deviennent leur forme minuscule
 * (ex. TUTOR_NOT_APPROVED → "tutor_not_approved"). Source : common/errors/error-messages.ts du backend.
 */
const CODE_MAP: Record<string, AppErrorCode> = {
  // Validation / session
  VALIDATION_FAILED: "validation_error",
  VALUE_TOO_LONG: "validation_error",
  CHECK_VIOLATION: "validation_error",
  UNAUTHORIZED: "unauthorized",
  TOKEN_MISSING: "unauthorized",
  TOKEN_INVALID: "unauthorized",
  AUTH_REQUIRED: "unauthorized",
  REFRESH_INVALID: "unauthorized",
  REFRESH_EXPIRED: "unauthorized",
  REFRESH_REUSE_DETECTED: "unauthorized",
  FORBIDDEN: "forbidden",
  ADMIN_REQUIRED: "forbidden",
  // Compte
  EMAIL_TAKEN: "email_already_used",
  VERIFICATION_INVALID: "invalid_code",
  RESET_INVALID: "invalid_code",
  ACCOUNT_DISABLED: "account_disabled",
  RATE_LIMITED: "too_many_requests",
  REQUEST_IN_PROGRESS: "too_many_requests",
  // Ressources introuvables
  NOT_FOUND: "not_found",
  RESOURCE_NOT_FOUND: "not_found",
  USER_NOT_FOUND: "not_found",
  BENEFICIARY_NOT_FOUND: "not_found",
  TUTOR_NOT_FOUND: "not_found",
  TUTOR_PROFILE_NOT_FOUND: "not_found",
  OFFER_NOT_FOUND: "not_found",
  PLACE_NOT_FOUND: "not_found",
  AVAILABILITY_NOT_FOUND: "not_found",
  BOOKING_NOT_FOUND: "not_found",
  CONVERSATION_NOT_FOUND: "not_found",
  MESSAGE_NOT_FOUND: "not_found",
  ATTACHMENT_NOT_FOUND: "not_found",
  CALL_NOT_FOUND: "not_found",
  APPLICATION_NOT_FOUND: "not_found",
  TUTOR_APPLICATION_NOT_FOUND: "not_found",
  // Propriété / droits
  BENEFICIARY_NOT_OWNED: "forbidden",
  BOOKING_NOT_OWNED: "forbidden",
  TRANSITION_NOT_ALLOWED_FOR_ACTOR: "forbidden",
  CHANNEL_FORBIDDEN: "forbidden",
  // Réservation
  SLOT_UNAVAILABLE: "slot_unavailable",
  SLOT_NO_LONGER_AVAILABLE: "slot_unavailable",
  SLOT_OUTSIDE_AVAILABILITY: "slot_unavailable",
  SLOT_TOO_SOON: "slot_unavailable",
  SLOT_TOO_CLOSE: "slot_unavailable",
  // Salles partenaires : la salle ou le créneau n'est plus disponible (la demande reste en attente, non confirmée).
  ROOM_UNAVAILABLE: "slot_unavailable",
  ROOM_NO_LONGER_AVAILABLE: "slot_unavailable",
  ROOM_CLOSED: "slot_unavailable",
  ROOM_NOT_BOOKABLE: "offer_inactive",
  ROOM_NOT_FOUND: "not_found",
  VENUE_NOT_FOUND: "not_found",
  PLAN_NOT_FOUND: "not_found",
  SUBSCRIPTION_NOT_FOUND: "not_found",
  OFFER_NOT_BOOKABLE: "offer_inactive",
  INVALID_TRANSITION: "invalid_state",
  BOOKING_STATE_CHANGED: "invalid_state",
  TRANSACTION_CONFLICT: "invalid_state",
  CANCELLATION_TOO_LATE: "invalid_state",
  // Séance
  SESSION_TOO_EARLY: "outside_start_window",
  SESSION_TOO_LATE: "outside_start_window",
  // Communication
  CALL_NOT_ALLOWED: "communication_not_allowed",
  // Candidature
  LEVEL_NOT_QUALIFIED: "validation_error",
  SUBJECT_LEVEL_MISMATCH: "validation_error",
  DEGREE_REQUIRED: "validation_error",
  INVALID_SUBJECT_NAME: "validation_error",
  UNKNOWN_SUBJECT: "validation_error",
  TUTOR_ALREADY_APPROVED: "application_not_editable",
  APPLICATION_ALREADY_PENDING: "application_not_editable",
  // Technique
  GEOCODING_UNAVAILABLE: "geocoding_unavailable",
  NOT_IMPLEMENTED: "provider_not_configured",
  DATABASE_BUSY: "server_error",
  INTERNAL_ERROR: "server_error",
};

const DEFAULT_MESSAGES: Partial<Record<AppErrorCode, string>> = {
  get validation_error() { return tr("api.errors.someInformationIsInvalid"); },
  get unauthorized() { return tr("api.errors.yourSessionHasExpiredPlease"); },
  get invalid_credentials() { return tr("services.authservice.incorrectEmailOrPassword"); },
  get email_already_used() { return tr("api.errors.thisEmailAddressIsAlready"); },
  get invalid_code() { return tr("api.errors.invalidCode"); },
  get code_expired() { return tr("api.errors.thisCodeHasExpiredRequest"); },
  get forbidden() { return tr("api.errors.youDoNotHaveAccess"); },
  get not_found() { return tr("api.errors.itemNotFound"); },
  get slot_unavailable() { return tr("tutorDashboard.requestConflict.thisSlotIsNoLonger"); },
  get invalid_state() { return tr("api.errors.thisActionIsNoLonger"); },
  get otp_invalid() { return tr("api.errors.incorrectCodeCheckTheCode"); },
  get otp_locked() { return tr("api.errors.tooManyAttemptsStartingWith"); },
  get outside_start_window() { return tr("api.errors.theSessionCannotStartYet"); },
  get already_reviewed() { return tr("api.errors.youHaveAlreadyReviewedThis"); },
  get communication_not_allowed() { return tr("chat.documentExchangeView.thisConversationIsReadOnly"); },
  get pending_message_limit() { return tr("api.errors.waitForTheTutorS"); },
  get too_many_requests() { return tr("api.errors.tooManyAttemptsPleaseTry"); },
  get account_disabled() { return tr("api.errors.thisAccountIsDisabled"); },
  get email_not_verified() { return tr("api.errors.verifyYourEmailAddressBefore"); },
  get geocoding_unavailable() { return tr("api.errors.theLocationServiceIsTemporarily"); },
  get network_error() { return tr("api.errors.unableToConnectCheckYour"); },
  get timeout() { return tr("api.errors.theServerIsTakingToo"); },
  get server_error() { return tr("api.errors.anErrorOccurredPleaseTry"); },
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: AppErrorCode;
  readonly problemCode: ErrorCode | null;
  readonly fieldErrors: Record<string, string>;
  readonly traceId?: string;

  constructor(params: {
    status: number;
    code: AppErrorCode;
    message?: string;
    problemCode?: ErrorCode | null;
    fieldErrors?: Record<string, string>;
    traceId?: string;
  }) {
    super(params.message ?? DEFAULT_MESSAGES[params.code] ?? t("api.errors.unexpectedError"));
    this.name = "ApiError";
    this.status = params.status;
    this.code = params.code;
    this.problemCode = params.problemCode ?? null;
    this.fieldErrors = params.fieldErrors ?? {};
    this.traceId = params.traceId;
  }

  static fromProblem(problem: Partial<ProblemDto>, status: number): ApiError {
    const pc = (problem.code ?? null) as ErrorCode | null;
    const code: AppErrorCode = pc
      ? CODE_MAP[pc] ?? (pc.toLowerCase() as AppErrorCode)
      : status === 401
        ? "unauthorized"
        : status === 404
          ? "not_found"
          : status >= 500
            ? "server_error"
            : "validation_error";
    const fieldErrors: Record<string, string> = {};
    for (const e of problem.errors ?? []) fieldErrors[e.field] = e.message;
    // Une validation refusée par le serveur : on précise le premier champ fautif (« … (durationMs : must be an integer) »).
    const firstField = problem.errors?.[0];
    const base = problem.detail ?? DEFAULT_MESSAGES[code];
    const message = code === "validation_error" && firstField?.field ? `${base} (${firstField.field} : ${firstField.message})` : base;
    return new ApiError({
      status,
      code,
      problemCode: pc,
      message,
      fieldErrors,
      traceId: problem.traceId,
    });
  }

  /** Erreur purement client (validation locale, capacité appareil). */
  static local(code: AppErrorCode, message?: string): ApiError {
    return new ApiError({ status: 0, code, message });
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
