import { useCallback, useEffect, useRef, useState } from "react";

import { BookingService, BookingServiceError } from "@/services/booking.service";
import type { BookingQuote, BookingRequest } from "@/types/booking";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type BookingQuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; quote: BookingQuote };

/**
 * Devis de la réservation : prix détaillé et blocage du créneau (15 min côté serveur).
 *
 * Le devis est redemandé quand `request` change : l'appelant doit donc le mémoïser (useMemo) sur les seuls champs qui
 * comptent. Le compte à rebours n'est qu'un affichage : le serveur reste seul juge de l'expiration (HOLD_EXPIRED à la
 * création). `request` est null tant que la demande n'est pas complète (adresse manquante…) : aucun devis, donc aucun
 * blocage inutile.
 */
export function useBookingQuote(request: BookingRequest | null) {
  const [state, setState] = useState<BookingQuoteState>({ status: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const attempt = useRef(0);

  const refresh = useCallback(async () => {
    if (!request) {
      attempt.current += 1;
      setState({ status: "idle" });
      return;
    }
    attempt.current += 1;
    const mine = attempt.current;
    setState({ status: "loading" });
    try {
      const quote = await BookingService.quote(request);
      if (mine === attempt.current) setState({ status: "ready", quote });
    } catch (error) {
      if (mine !== attempt.current) return;
      setState({
        status: "error",
        message: error instanceof BookingServiceError ? error.message : t("hooks.useBookingQuote.unableToCalculateThePrice"),
      });
    }
  }, [request]);

  useLoadEffect(refresh);

  const expiresAtMs = state.status === "ready" ? Date.parse(state.quote.expiresAt) : null;
  useEffect(() => {
    if (expiresAtMs === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAtMs]);

  const secondsLeft = expiresAtMs === null ? null : Math.max(0, Math.ceil((expiresAtMs - now) / 1000));
  return { state, refresh, secondsLeft, expired: secondsLeft === 0 };
}

/** « 14:32 » */
export function countdownLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
