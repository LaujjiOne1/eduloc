import { api } from "@/api/http";
import { runBeforeLogout } from "@/lib/session-hooks";
import { ApiError } from "@/api/errors";
import { Session } from "@/api/session";
import { toAuthenticatedUser } from "@/api/mappers";
import type { LoginResultDto, MeDto, RegisterResultDto } from "@/api/contracts/dto";
import type { AuthenticatedUser, LoginCredentials, OAuthProvider, SignupPayload } from "@/types/auth";
import { t } from "@/i18n";

/** Compat : les écrans testent `instanceof AuthServiceError` et `error.code`. */
export { ApiError as AuthServiceError };

/** Ouvre la session : jetons → profil complet (/users/me : rôle tuteur, bénéficiaire « moi »…). */
async function openSession(result: LoginResultDto): Promise<AuthenticatedUser> {
  await Session.setTokens({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    refreshExpiresAt: result.refreshExpiresAt,
  });
  const me = await api.get<MeDto>("/users/me");
  Session.setUser(me);
  return toAuthenticatedUser(me);
}

/**
 * Routes backend : POST /auth/register|verify-email|resend-verification|login|refresh|logout|
 * password/request|password/reset, GET /users/me.
 *
 * Parcours : register → (code à 6 chiffres reçu par e-mail) → verify-email, qui OUVRE la session
 * (pas de reconnexion) → l'écran suivant du workflow.
 */
export const AuthService = {
  /**
   * 403 EMAIL_NOT_VERIFIED (code "email_not_verified") : le compte existe mais n'est pas vérifié →
   * l'écran envoie l'utilisateur vers la saisie du code.
   */
  async login(credentials: LoginCredentials): Promise<AuthenticatedUser> {
    if (!credentials.password) throw ApiError.local("invalid_credentials", t("services.authservice.incorrectEmailOrPassword"));
    const result = await api.post<LoginResultDto>("/auth/login", credentials, { auth: false });
    return openSession(result);
  },

  /** Crée le compte (PENDING_VERIFICATION) et déclenche l'envoi du code. N'ouvre PAS de session. */
  async signup(payload: SignupPayload): Promise<AuthenticatedUser> {
    const registered = await api.post<RegisterResultDto>("/auth/register", payload, { auth: false });
    return {
      id: registered.id,
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      phone: payload.phone ?? null,
      emailVerified: false,
      status: "pending_verification",
      selfBeneficiaryId: null,
      tutor: null,
      isAdmin: false,
    };
  },

  /** Valide le code à 6 chiffres et ouvre la session. Erreurs : "invalid_code" (422), "too_many_requests" (429). */
  async verifyEmail(email: string, code: string): Promise<AuthenticatedUser> {
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) throw ApiError.local("invalid_code", t("common.enterThe6DigitsOf"));
    const result = await api.post<LoginResultDto>("/auth/verify-email", { email: email.trim(), code: digits }, { auth: false });
    return openSession(result);
  },

  /** Renvoie un nouveau code (3 / heure). La réponse ne révèle jamais si le compte existe. */
  async resendVerification(email: string): Promise<void> {
    await api.post("/auth/resend-verification", { email: email.trim() }, { auth: false });
  },

  async requestPasswordReset(email: string): Promise<void> {
    await api.post("/auth/password/request", { email: email.trim() }, { auth: false });
  },

  /** Le code reçu par e-mail + le nouveau mot de passe. Toutes les sessions existantes sont révoquées. */
  async resetPassword(input: { email: string; code: string; password: string }): Promise<void> {
    await api.post(
      "/auth/password/reset",
      { email: input.email.trim(), code: input.code.replace(/\D/g, ""), password: input.password },
      { auth: false },
    );
  },

  /** Pas de connexion sociale côté backend : on le dit franchement plutôt que d'appeler une route inexistante. */
  async loginWithProvider(_provider: OAuthProvider): Promise<AuthenticatedUser> {
    throw ApiError.local("provider_not_configured", t("services.authservice.thisSignInMethodIs"));
  },

  /** Au démarrage de l'app : relit les jetons persistés puis /users/me. */
  async restoreSession(): Promise<AuthenticatedUser | null> {
    if (!(await Session.restore())) return null;
    try {
      return await AuthService.getMe();
    } catch (error) {
      // Session refusée par le serveur : on la purge. Panne réseau : on garde les jetons (mode hors ligne).
      if (error instanceof ApiError && (error.status === 401 || error.code === "unauthorized")) {
        await Session.clear();
        return null;
      }
      throw error;
    }
  },

  /** Rafraîchit le profil (ex. après envoi de candidature ou approbation). */
  async getMe(): Promise<AuthenticatedUser> {
    const me = await api.get<MeDto>("/users/me");
    Session.setUser(me);
    return toAuthenticatedUser(me);
  },

  async logout(): Promise<void> {
    await runBeforeLogout();
    const refreshToken = Session.getTokens()?.refreshToken;
    if (refreshToken) await api.post("/auth/logout", { refreshToken }).catch(() => undefined);
    await Session.clear();
  },
};
