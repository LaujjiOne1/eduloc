import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { signedInHomeRoute } from "@/lib/auth-routing";
import { useAuthStore } from "@/store/auth.store";

/**
 * Écrans réservés aux visiteurs (connexion, inscription, mot de passe oublié, vérification) : un utilisateur
 * DÉJÀ connecté à l'ouverture de l'écran (retour arrière, lien direct) est envoyé sur son espace, jamais ici.
 *
 * Seul l'état à l'ouverture compte : l'utilisateur qui se connecte PENDANT qu'il est sur l'écran est
 * redirigé par l'écran lui-même (reprise de la réservation, retour demandé, onboarding tuteur…).
 */
export function GuestGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const user = useAuthStore((s) => s.user);
  const checked = useRef(false);

  // Déjà connecté dès l'ouverture (retour arrière : le store est déjà chargé) : l'écran ne s'affiche même pas.
  const [openedSignedIn] = useState(() => {
    const { hasHydrated: ready, user: current } = useAuthStore.getState();
    return ready && !!current;
  });

  useEffect(() => {
    // Ouverture à froid (lien direct) : on attend la lecture du stockage, une seule fois.
    if (!hasHydrated || checked.current) return;
    checked.current = true;
    if (user || openedSignedIn) router.replace(signedInHomeRoute());
  }, [hasHydrated, user, openedSignedIn, router]);

  if (!hasHydrated || openedSignedIn) return null;
  return <>{children}</>;
}
