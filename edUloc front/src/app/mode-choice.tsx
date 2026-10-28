import { AuthGate } from "@/components/auth-gate";
import { ModeChoiceScreen } from "@/screens/mode-choice-screen";

export default function ModeChoice() {
  return (
    <AuthGate>
      <ModeChoiceScreen />
    </AuthGate>
  );
}
