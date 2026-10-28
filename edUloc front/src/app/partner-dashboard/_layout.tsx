import { Stack } from "expo-router";

import { AuthGate } from "@/components/auth-gate";

/** Espace Gestionnaire de lieu : tout compte connecté peut enregistrer une structure (aucun rôle global). */
export default function PartnerLayout() {
  return (
    <AuthGate>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthGate>
  );
}
