import type { Href, useRouter } from "expo-router";

import { useAuthStore } from "@/store/auth.store";

const HOME_ROUTE = "/home" as Href;

let signingOut = false;

/** Vrai pendant une déconnexion volontaire : les gardes d'accès ne doivent pas rediriger vers « connexion ». */
export const isSigningOut = (): boolean => signingOut;

/**
 * Déconnexion volontaire : on vide TOUTE la pile de navigation puis on arrive sur l'accueil public.
 * Sans cela, la garde de l'écran quitté voit « plus d'utilisateur » et le renvoie vers la connexion, en
 * laissant derrière lui tout l'historique de l'espace connecté (il fallait alors reculer plusieurs fois).
 */
export function signOut(router: ReturnType<typeof useRouter>): void {
  signingOut = true;
  try {
    if (router.canDismiss()) router.dismissAll();
  } catch {
    // pile déjà à la racine
  }
  router.replace(HOME_ROUTE);
  useAuthStore.getState().logout();
  setTimeout(() => {
    signingOut = false;
  }, 1000);
}
