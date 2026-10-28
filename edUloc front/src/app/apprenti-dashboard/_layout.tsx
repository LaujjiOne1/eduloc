import { Stack } from "expo-router";

import { AuthGate } from "@/components/auth-gate";

export default function ApprentiLayout() {
  return (
    <AuthGate>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthGate>
  );
}
