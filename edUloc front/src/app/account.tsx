import { AuthGate } from "@/components/auth-gate";
import { AccountScreen } from "@/screens/account-screen";

export default function Account() {
  return (
    <AuthGate>
      <AccountScreen />
    </AuthGate>
  );
}
