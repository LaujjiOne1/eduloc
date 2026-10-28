import { AuthGate } from "@/components/auth-gate";
import { BookingSummaryScreen } from "@/screens/booking/booking-summary-screen";

export default function BookingSummary() {
  return (
    <AuthGate>
      <BookingSummaryScreen />
    </AuthGate>
  );
}
