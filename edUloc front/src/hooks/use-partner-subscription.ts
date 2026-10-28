import { useCallback, useState } from "react";

import { PartnerService } from "@/services/partner.service";
import type { PartnerPlan, PartnerSubscription } from "@/types/partner";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type PartnerSubscriptionState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; subscription: PartnerSubscription; plans: PartnerPlan[] };

/** Offre commerciale de la structure et catalogue des offres (prix et durées viennent du serveur). */
export function usePartnerSubscription() {
  const [state, setState] = useState<PartnerSubscriptionState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [subscription, plans] = await Promise.all([PartnerService.getSubscription(), PartnerService.listPlans()]);
      setState({ status: "ready", subscription, plans });
    } catch {
      setState({ status: "error", message: t("hooks.usePartnerSubscription.unableToLoadTheCommercial") });
    }
  }, []);

  useLoadEffect(load);

  const apply = useCallback((subscription: PartnerSubscription) => {
    setState((current) => (current.status === "ready" ? { ...current, subscription } : current));
  }, []);

  return { state, reload: load, apply };
}
