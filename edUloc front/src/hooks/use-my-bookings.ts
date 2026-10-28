import { useCallback, useState } from "react";

import { isApiError } from "@/api/errors";
import { useRealtimeReload } from "@/realtime/use-realtime-event";
import { BookingService } from "@/services/booking.service";
import type { Booking } from "@/types/booking";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type MyBookingsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; bookings: Booking[] };

/**
 * Loads the signed-in beneficiary's own bookings — screens derive their own
 * pending/confirmed/history subsets so a single cancel/session action stays
 * consistent everywhere it's reflected (Dashboard preview, MyBookings tabs).
 * Reloads silently when the tutor accepts/refuses or the session starts/ends (realtime).
 */
export function useMyBookings() {
  const [state, setState] = useState<MyBookingsState>({ status: "loading" });

  const load = useCallback(async (silent = false) => {
    if (!silent) setState({ status: "loading" });
    try {
      const bookings = await BookingService.getMyBookings();
      setState({ status: "success", bookings });
    } catch (error) {
      // Rechargement silencieux raté : on garde les données déjà affichées.
      if (silent) return;
      setState({ status: "error", message: isApiError(error) ? error.message : t("hooks.useMyBookings.unableToLoadYourAppointments") });
    }
  }, []);

  useLoadEffect(load);

  useRealtimeReload(() => void load(true), ["booking.", "session."]);

  // Identité stable : certains écrans relisent au focus (useFocusEffect) sans boucler.
  const retry = useCallback(() => load(), [load]);

  return { state, retry };
}
