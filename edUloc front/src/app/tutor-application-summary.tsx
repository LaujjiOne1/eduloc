import { AuthGate } from "@/components/auth-gate";
import { TutorApplicationSummaryScreen } from "@/screens/tutor-onboarding/tutor-application-summary-screen";

export default function TutorApplicationSummary() {
  return (
    <AuthGate>
      <TutorApplicationSummaryScreen />
    </AuthGate>
  );
}
