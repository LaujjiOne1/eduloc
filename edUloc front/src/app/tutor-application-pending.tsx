import { AuthGate } from "@/components/auth-gate";
import { TutorApplicationPendingScreen } from "@/screens/tutor-onboarding/tutor-application-pending-screen";

export default function TutorApplicationPending() {
  return (
    <AuthGate>
      <TutorApplicationPendingScreen />
    </AuthGate>
  );
}
