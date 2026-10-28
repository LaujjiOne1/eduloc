import { AuthGate } from "@/components/auth-gate";
import { BeneficiaryProfileScreen } from "@/screens/booking/beneficiary-profile-screen";

export default function BeneficiaryProfile() {
  return (
    <AuthGate>
      <BeneficiaryProfileScreen />
    </AuthGate>
  );
}
