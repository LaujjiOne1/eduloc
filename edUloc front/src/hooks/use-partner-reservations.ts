import { useCallback, useState } from "react";

import { PartnerService } from "@/services/partner.service";
import type { PartnerReservation } from "@/types/partner";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type PartnerReservationsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ready"; reservations: PartnerReservation[] };

/** Séances confirmées dans les salles de la structure (toutes, ou une seule salle). */
export function usePartnerReservations(roomId?: string) {
  const [state, setState] = useState<PartnerReservationsState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const reservations = await PartnerService.listReservations(roomId);
      setState(reservations.length ? { status: "ready", reservations } : { status: "empty" });
    } catch {
      setState({ status: "error", message: t("hooks.usePartnerReservations.unableToLoadTheReservations") });
    }
  }, [roomId]);

  useLoadEffect(load);

  return { state, reload: load };
}
