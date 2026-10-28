import { useCallback, useState } from "react";

import { PartnerService } from "@/services/partner.service";
import type { PartnerVenue } from "@/types/partner";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type PartnerVenueState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; venue: PartnerVenue | null };

/** Structure du Gestionnaire connecté : `venue: null` tant qu'il n'a pas enregistré sa structure. */
export function usePartnerVenue() {
  const [state, setState] = useState<PartnerVenueState>({ status: "loading" });

  /** `silent` : relit sans repasser par l'état de chargement (les formulaires ouverts gardent leur saisie). */
  const load = useCallback(async (silent = false) => {
    if (!silent) setState({ status: "loading" });
    try {
      setState({ status: "ready", venue: await PartnerService.getVenue() });
    } catch {
      // Relecture silencieuse ratée : on garde l'affichage actuel plutôt que de perdre le formulaire ouvert.
      if (!silent) setState({ status: "error", message: t("hooks.usePartnerVenue.unableToLoadYourVenue") });
    }
  }, []);

  useLoadEffect(load);

  const reload = useCallback(() => load(false), [load]);
  const refresh = useCallback(() => load(true), [load]);
  return { state, reload, refresh };
}
