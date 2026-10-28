import { useCallback, useState } from "react";

import { BookingService, BookingServiceError } from "@/services/booking.service";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type SessionCodeState = { status: "loading" } | { status: "error"; message: string } | { status: "success"; code: string };

/** Loads the beneficiary's session code — 24_BookingConfirmed's preview and 29_SessionOTP. */
export function useSessionCode(bookingId: string | undefined) {
  const [state, setState] = useState<SessionCodeState>({ status: "loading" });

  const load = useCallback(async () => {
    if (!bookingId) {
      setState({ status: "error", message: t("common.thisAppointmentCouldNotBe") });
      return;
    }
    setState({ status: "loading" });
    try {
      const code = await BookingService.getSessionCode(bookingId);
      setState({ status: "success", code });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof BookingServiceError ? error.message : t("hooks.useSessionCode.unableToLoadTheSession"),
      });
    }
  }, [bookingId]);

  useLoadEffect(load);

  return { state, retry: load };
}
