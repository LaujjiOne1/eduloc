import { AuthGate } from "@/components/auth-gate";
import { NotificationsScreen } from "@/screens/notifications-screen";

export default function Notifications() {
  return (
    <AuthGate>
      <NotificationsScreen />
    </AuthGate>
  );
}
