import { Stack } from "expo-router";

import { AuthGate } from "@/components/auth-gate";

export default function BeneficiariesLayout() {
  return (
    <AuthGate>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthGate>
  );
}
