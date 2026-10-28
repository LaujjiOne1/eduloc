import { AuthGate } from "@/components/auth-gate";
import { OfferDetailScreen } from "@/screens/results/offer-detail-screen";

export default function OfferDetail() {
  return (
    <AuthGate>
      <OfferDetailScreen />
    </AuthGate>
  );
}
