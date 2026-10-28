import { AuthGate } from "@/components/auth-gate";
import { ConversationsListScreen } from "@/screens/apprenti-dashboard/conversations-list-screen";

export default function Conversations() {
  return (
    <AuthGate>
      <ConversationsListScreen />
    </AuthGate>
  );
}
