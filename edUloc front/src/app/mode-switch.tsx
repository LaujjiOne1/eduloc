import { AuthGate } from "@/components/auth-gate";
import { ModeSwitchScreen } from "@/screens/mode-switch-screen";

export default function ModeSwitch() {
  return (
    <AuthGate>
      <ModeSwitchScreen />
    </AuthGate>
  );
}
