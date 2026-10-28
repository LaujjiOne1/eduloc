import { useCallback, useState } from "react";

import { BookingService, BookingServiceError } from "@/services/booking.service";
import type { Booking } from "@/types/booking";
import { t } from "@/i18n";

export type TutorSessionActionState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "completing" }
  | { status: "error"; message: string };

/**
 * Powers the tutor-side session transitions: 64_TutorStartSession's code
 * entry (CONFIRMED → IN_PROGRESS, code required for both online and
 * in-person sessions), and 65_TutorSessionInProgress /
 * 67_SessionInProgressPresential's "Terminer" (IN_PROGRESS → COMPLETED).
 */
export function useTutorSessionAction() {
  const [state, setState] = useState<TutorSessionActionState>({ status: "idle" });

  const start = useCallback(async (bookingId: string, code: string): Promise<Booking | null> => {
    setState({ status: "starting" });
    try {
      const booking = await BookingService.startTutorSession(bookingId, code);
      setState({ status: "idle" });
      return booking;
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof BookingServiceError ? error.message : t("hooks.useTutorSessionAction.unableToStartTheSession"),
      });
      return null;
    }
  }, []);

  const complete = useCallback(async (bookingId: string): Promise<Booking | null> => {
    setState({ status: "completing" });
    try {
      const booking = await BookingService.completeTutorSession(bookingId);
      setState({ status: "idle" });
      return booking;
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof BookingServiceError ? error.message : t("hooks.useTutorSessionAction.unableToEndTheSession"),
      });
      return null;
    }
  }, []);

  return { state, start, complete };
}
