import { AuthGate } from "@/components/auth-gate";
import { TutorIdentityScreen } from "@/screens/tutor-onboarding/tutor-identity-screen";

export default function TutorIdentity() {
  return (
    <AuthGate>
      <TutorIdentityScreen />
    </AuthGate>
  );
}
