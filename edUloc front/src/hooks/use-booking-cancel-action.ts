import { useCallback, useState } from "react";

import { BookingService, BookingServiceError } from "@/services/booking.service";
import type { Booking } from "@/types/booking";
import { t } from "@/i18n";

export type BookingCancelActionState = { status: "idle" } | { status: "cancelling" } | { status: "error"; message: string };

/** Powers 23_BookingDetailPending's "Annuler la demande" and 24_BookingConfirmed's "Annuler" — PENDING|CONFIRMED → CANCELLED. */
export function useBookingCancelAction() {
  const [state, setState] = useState<BookingCancelActionState>({ status: "idle" });

  const cancel = useCallback(async (bookingId: string, reason?: string): Promise<Booking | null> => {
    setState({ status: "cancelling" });
    try {
      const booking = await BookingService.cancelBooking(bookingId, reason);
      setState({ status: "idle" });
      return booking;
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof BookingServiceError ? error.message : t("hooks.useBookingCancelAction.unableToCancelThisAppointment"),
      });
      return null;
    }
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, cancel, reset };
}
