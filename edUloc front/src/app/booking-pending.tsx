import { AuthGate } from "@/components/auth-gate";
import { BookingPendingScreen } from "@/screens/booking/booking-pending-screen";

export default function BookingPending() {
  return (
    <AuthGate>
      <BookingPendingScreen />
    </AuthGate>
  );
}
