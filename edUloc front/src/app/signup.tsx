import { GuestGate } from "@/components/guest-gate";
import { SignupScreen } from "@/screens/signup-screen";

export default function Signup() {
  return (
    <GuestGate>
      <SignupScreen />
    </GuestGate>
  );
}
