import { useCallback, useEffect, useState } from "react";

import { RoomService } from "@/services/room.service";
import type { BookingOptions } from "@/types/room";
import { t } from "@/i18n";

export type BookingOptionsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; options: BookingOptions };

/**
 * Modes, durées et salles que le backend propose pour une offre. Les salles ne sont QUE celles que le tuteur accepte ;
 * le premier choix du demandeur (mode) en dépend, donc l'écran attend cette réponse avant de proposer « Salle partenaire ».
 */
export function useBookingOptions(offerId: string | null, near?: { latitude: number; longitude: number } | null) {
  const [state, setState] = useState<BookingOptionsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const lat = near?.latitude;
  const lng = near?.longitude;

  useEffect(() => {
    if (!offerId) return;
    let cancelled = false;
    // Écritures d'état dans un rappel asynchrone (pas de rendu en cascade depuis le corps de l'effet).
    void Promise.resolve().then(() => {
      if (cancelled) return;
      // Nouvelle position : on garde les options affichées le temps de recalculer les distances (pas de clignotement).
      setState((current) => (current.status === "ready" ? current : { status: "loading" }));
      RoomService.getBookingOptions(offerId, lat !== undefined && lng !== undefined ? { lat, lng } : undefined)
        .then((options) => !cancelled && setState({ status: "ready", options }))
        .catch((e: Error) => !cancelled && setState({ status: "error", message: e.message || t("hooks.useBookingOptions.unableToLoadTheBooking") }));
    });
    return () => {
      cancelled = true;
    };
  }, [offerId, lat, lng, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
