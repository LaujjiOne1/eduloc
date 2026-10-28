import { Stack } from "expo-router";

import { AuthGate } from "@/components/auth-gate";

export default function TutorLayout() {
  return (
    <AuthGate requireTutor>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthGate>
  );
}
