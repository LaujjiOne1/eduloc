import type { Href } from "expo-router";

import { useAuthStore } from "@/store/auth.store";
import { useBookingWizardStore } from "@/store/booking-wizard.store";
import type { AuthenticatedUser } from "@/types/auth";

const BENEFICIARY_ROUTE = "/beneficiary" as Href;
const MODE_CHOICE_ROUTE = "/mode-choice" as Href;
const APPRENTI_DASHBOARD_ROUTE = "/apprenti-dashboard" as Href;
const TUTOR_DASHBOARD_ROUTE = "/tutor-dashboard" as Href;
const TUTOR_PENDING_ROUTE = "/tutor-application-pending" as Href;

/** Vrai quand le compte peut utiliser l'espace tuteur (dossier approuvé, profil non suspendu). */
export const isApprovedTutor = (user: AuthenticatedUser | null): boolean =>
  user?.tutor?.applicationStatus === "approved" && !user.tutor.isSuspended;

/**
 * Où aller juste après une connexion ou une vérification d'e-mail réussie. Ordre :
 *  1. une destination demandée par l'écran d'origine (returnTo : onboarding tuteur, résumé…) ;
 *  2. une réservation en cours (le créneau a été choisi AVANT la connexion) → bénéficiaire ;
 *  3. un tuteur approuvé → choix de l'espace ; sinon l'espace demandeur.
 * Le « returnTo » est consommé (une seule fois).
 */
export function routeAfterAuth(user: AuthenticatedUser): Href {
  const auth = useAuthStore.getState();
  if (auth.returnTo) {
    const target = auth.returnTo;
    auth.setReturnTo(null);
    return target;
  }
  const booking = useBookingWizardStore.getState();
  if (booking.offer && booking.slot) return BENEFICIARY_ROUTE;
  return isApprovedTutor(user) ? MODE_CHOICE_ROUTE : APPRENTI_DASHBOARD_ROUTE;
}

/** « Accueil » d'un utilisateur connecté : le tableau de bord du mode actif (apprenti ou tuteur). */
export function signedInHomeRoute(): Href {
  const { user, activeMode } = useAuthStore.getState();
  return activeMode === "tutor" && isApprovedTutor(user) ? TUTOR_DASHBOARD_ROUTE : APPRENTI_DASHBOARD_ROUTE;
}

/** Espace tuteur : dashboard si approuvé, sinon l'écran d'attente du dossier. */
export function tutorHomeRoute(user: AuthenticatedUser | null): Href {
  return isApprovedTutor(user) ? TUTOR_DASHBOARD_ROUTE : TUTOR_PENDING_ROUTE;
}
