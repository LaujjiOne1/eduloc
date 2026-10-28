import { GuestGate } from "@/components/guest-gate";
import { LoginScreen } from "@/screens/login-screen";

export default function Login() {
  return (
    <GuestGate>
      <LoginScreen />
    </GuestGate>
  );
}
