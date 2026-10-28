import { useCallback, useState } from "react";

import { useRealtimeReload } from "@/realtime/use-realtime-event";
import { BookingService, BookingServiceError } from "@/services/booking.service";
import type { Booking } from "@/types/booking";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type TutorBookingState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; booking: Booking };

/** Loads a single booking request by id for RequestDetail/RequestAccepted. */
export function useTutorBooking(id: string | undefined) {
  const [state, setState] = useState<TutorBookingState>({ status: "loading" });

  const load = useCallback(async (silent = false) => {
    if (!id) {
      setState({ status: "error", message: t("hooks.useTutorBooking.thisRequestCouldNotBe") });
      return;
    }
    if (!silent) setState({ status: "loading" });
    try {
      const booking = await BookingService.getTutorBookingById(id);
      setState({ status: "success", booking });
    } catch (error) {
      if (silent) return;
      setState({
        status: "error",
        message: error instanceof BookingServiceError ? error.message : t("hooks.useTutorBooking.unableToLoadThisRequest"),
      });
    }
  }, [id]);

  useLoadEffect(load);

  // Annulation par le demandeur / auto-refus pendant que le tuteur consulte la demande.
  useRealtimeReload(() => void load(true), ["booking.", "session."]);

  // Identité stable : certains écrans relisent au focus (useFocusEffect) sans boucler.
  const retry = useCallback(() => load(), [load]);

  return { state, retry };
}
