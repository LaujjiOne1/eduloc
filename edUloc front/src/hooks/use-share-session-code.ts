import { useCallback, useState } from "react";

import { BookingService, BookingServiceError } from "@/services/booking.service";
import { t } from "@/i18n";

export type ShareSessionCodeState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent" }
  | { status: "error"; message: string };

/**
 * « Envoyer le code au tuteur » (cours en ligne seulement) : le serveur dépose le code dans la conversation sous forme
 * de message système. Un second envoi reste possible (renvoi), le serveur le limite.
 */
export function useShareSessionCode(bookingId: string | undefined) {
  const [state, setState] = useState<ShareSessionCodeState>({ status: "idle" });

  const share = useCallback(async () => {
    if (!bookingId || state.status === "sending") return;
    setState({ status: "sending" });
    try {
      await BookingService.shareSessionCode(bookingId);
      setState({ status: "sent" });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof BookingServiceError ? error.message : t("hooks.useShareSessionCode.unableToSendTheCode"),
      });
    }
  }, [bookingId, state.status]);

  return { state, share };
}
