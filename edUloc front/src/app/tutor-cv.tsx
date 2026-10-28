import { AuthGate } from "@/components/auth-gate";
import { TutorCvScreen } from "@/screens/tutor-onboarding/tutor-cv-screen";

export default function TutorCv() {
  return (
    <AuthGate>
      <TutorCvScreen />
    </AuthGate>
  );
}
