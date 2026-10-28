import { GuestGate } from "@/components/guest-gate";
import { VerifyScreen } from "@/screens/booking/verify-screen";

export default function Verify() {
  return (
    <GuestGate>
      <VerifyScreen />
    </GuestGate>
  );
}
