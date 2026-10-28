import { useCallback, useState } from "react";

import { OfferService, OfferServiceError } from "@/services/offer.service";
import type { CreateOfferInput, Offer, UpdateOfferInput } from "@/types/offer";
import { t } from "@/i18n";

export type OfferActionState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "togglingStatus" }
  | { status: "error"; message: string };

export type OfferSaveInput =
  | { mode: "create"; data: CreateOfferInput }
  | { mode: "edit"; offerId: string; data: UpdateOfferInput };

/** Powers 59_TutorOfferDetail's "Enregistrer" (create or edit) and "Désactiver/Réactiver l'offre". */
export function useOfferActions() {
  const [state, setState] = useState<OfferActionState>({ status: "idle" });

  const save = useCallback(async (input: OfferSaveInput): Promise<Offer | null> => {
    setState({ status: "saving" });
    try {
      const offer =
        input.mode === "create"
          ? await OfferService.createOffer(input.data)
          : await OfferService.updateOffer(input.offerId, input.data);
      setState({ status: "idle" });
      return offer;
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof OfferServiceError ? error.message : t("hooks.useOfferActions.unableToSaveThisOffer"),
      });
      return null;
    }
  }, []);

  const toggleStatus = useCallback(async (offerId: string, isActive: boolean): Promise<Offer | null> => {
    setState({ status: "togglingStatus" });
    try {
      const offer = await OfferService.updateOfferStatus(offerId, isActive);
      setState({ status: "idle" });
      return offer;
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof OfferServiceError ? error.message : t("hooks.useOfferActions.unableToUpdateThisOffer"),
      });
      return null;
    }
  }, []);

  return { state, save, toggleStatus };
}
