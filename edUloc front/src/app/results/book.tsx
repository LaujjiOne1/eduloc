import { AuthGate } from "@/components/auth-gate";
import { BookDateScreen } from "@/screens/booking/book-date-screen";

export default function Book() {
  return (
    <AuthGate>
      <BookDateScreen />
    </AuthGate>
  );
}
