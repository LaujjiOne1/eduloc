import { type Href, usePathname, useRouter } from "expo-router";
import { type ReactNode, useEffect } from "react";

import { isApprovedTutor, tutorHomeRoute } from "@/lib/auth-routing";
import { isSigningOut } from "@/lib/sign-out";
import { useAuthStore } from "@/store/auth.store";

const LOGIN_ROUTE = "/login" as Href;
const TUTOR_INTRO_ROUTE = "/tutor-intro" as Href;

type AuthGateProps = {
  children: ReactNode;
  /** Réservé aux tuteurs approuvés (espace tuteur). */
  requireTutor?: boolean;
};

/**
 * Garde d'accès : un écran protégé n'est jamais rendu sans le droit correspondant.
 *  - non connecté → /login, et on retient la destination pour y revenir après connexion ;
 *  - espace tuteur sans dossier approuvé → présentation « Devenir tuteur » (jamais commencé) ou suivi du dossier.
 * Le serveur reste l'autorité (chaque route vérifie le jeton et le rôle) ; ceci évite l'écran vide / l'erreur 401.
 */
export function AuthGate({ children, requireTutor = false }: AuthGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const user = useAuthStore((s) => s.user);
  const setReturnTo = useAuthStore((s) => s.setReturnTo);

  const allowed = !!user && (!requireTutor || isApprovedTutor(user));

  useEffect(() => {
    if (!hasHydrated) return; // l'utilisateur persisté n'est pas encore relu
    if (!user) {
      // Déconnexion volontaire : la navigation vers l'accueil est déjà engagée, on ne la détourne pas.
      if (isSigningOut()) return;
      setReturnTo(pathname as Href);
      router.replace(LOGIN_ROUTE);
      return;
    }
    if (requireTutor && !isApprovedTutor(user)) {
      const status = user.tutor?.applicationStatus;
      router.replace(!user.tutor || status === "draft" ? TUTOR_INTRO_ROUTE : tutorHomeRoute(user));
    }
  }, [hasHydrated, user, requireTutor, pathname, router, setReturnTo]);

  // Pas de rendu (ni de redirection) tant que l'état n'est pas connu : rendu serveur de l'export web inclus.
  if (!hasHydrated || !allowed) return null;
  return <>{children}</>;
}
