import { useCallback, useState } from "react";

import { OfferService } from "@/services/offer.service";
import type { Offer } from "@/types/offer";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type TutorOffersState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "success"; offers: Offer[] };

/** Loads the signed-in tutor's own offers for 58_TutorOffers. */
export function useTutorOffers() {
  const [state, setState] = useState<TutorOffersState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const offers = await OfferService.getTutorOffers();
      setState(offers.length > 0 ? { status: "success", offers } : { status: "empty" });
    } catch {
      setState({ status: "error", message: t("hooks.useTutorOffers.unableToLoadYourOffers") });
    }
  }, []);

  useLoadEffect(load);

  return { state, retry: load };
}
