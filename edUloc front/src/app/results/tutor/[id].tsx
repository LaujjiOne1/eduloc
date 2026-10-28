import { AuthGate } from "@/components/auth-gate";
import { TutorProfileScreen } from "@/screens/results/tutor-profile-screen";

export default function TutorProfile() {
  return (
    <AuthGate>
      <TutorProfileScreen />
    </AuthGate>
  );
}
