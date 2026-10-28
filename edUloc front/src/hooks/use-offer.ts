import { useCallback, useState } from "react";

import { OfferService, OfferServiceError } from "@/services/offer.service";
import type { Offer } from "@/types/offer";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type OfferState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; offer: Offer };

/** Loads a single offer by id for the OfferDetail screen. */
export function useOffer(id: string | undefined) {
  const [state, setState] = useState<OfferState>({ status: "loading" });

  const load = useCallback(async () => {
    if (!id) {
      setState({ status: "error", message: t("hooks.useOffer.thisOfferCouldNotBe") });
      return;
    }
    setState({ status: "loading" });
    try {
      const offer = await OfferService.getOfferById(id);
      setState({ status: "success", offer });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof OfferServiceError ? error.message : t("hooks.useOffer.unableToLoadThisOffer"),
      });
    }
  }, [id]);

  useLoadEffect(load);

  return { state, retry: load };
}
