import { AuthGate } from "@/components/auth-gate";
import { BeneficiaryScreen } from "@/screens/booking/beneficiary-screen";

export default function Beneficiary() {
  return (
    <AuthGate>
      <BeneficiaryScreen />
    </AuthGate>
  );
}
