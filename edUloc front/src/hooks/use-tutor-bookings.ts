import { useCallback, useState } from "react";

import { isApiError } from "@/api/errors";
import { useRealtimeReload } from "@/realtime/use-realtime-event";
import { BookingService } from "@/services/booking.service";
import type { Booking } from "@/types/booking";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type TutorBookingsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; bookings: Booking[] };

/**
 * Loads all of the signed-in tutor's bookings (any status) — screens derive
 * their own pending/confirmed subsets so a single accept/refuse action stays
 * consistent everywhere it's reflected (Dashboard stats, Requests tabs, Calendar).
 * A new request (booking.requested) appears without leaving the screen (realtime).
 */
export function useTutorBookings() {
  const [state, setState] = useState<TutorBookingsState>({ status: "loading" });

  const load = useCallback(async (silent = false) => {
    if (!silent) setState({ status: "loading" });
    try {
      const bookings = await BookingService.getTutorBookings();
      setState({ status: "success", bookings });
    } catch (error) {
      if (silent) return;
      setState({ status: "error", message: isApiError(error) ? error.message : t("hooks.useTutorBookings.unableToLoadYourRequests") });
    }
  }, []);

  useLoadEffect(load);

  useRealtimeReload(() => void load(true), ["booking.", "session."]);

  // Identité stable : certains écrans relisent au focus (useFocusEffect) sans boucler.
  const retry = useCallback(() => load(), [load]);

  return { state, retry };
}
