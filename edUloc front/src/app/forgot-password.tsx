import { GuestGate } from "@/components/guest-gate";
import { ForgotPasswordScreen } from "@/screens/forgot-password-screen";

export default function ForgotPassword() {
  return (
    <GuestGate>
      <ForgotPasswordScreen />
    </GuestGate>
  );
}
