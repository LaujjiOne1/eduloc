import { useCallback, useEffect, useState } from "react";

import { RoomService } from "@/services/room.service";
import type { TeachingModeId } from "@/types/booking";
import type { OfferSlot } from "@/types/offer";
import { t } from "@/i18n";

/**
 * Créneaux d'UNE date pour un mode / une salle / une durée, calculés par le backend (intersection tuteur ∩ salle,
 * préavis, marges). Rechargés à chaque changement de date, de salle ou de durée ; jamais mis en cache côté écran,
 * car une demande déjà confirmée par ailleurs doit disparaître de la liste.
 */
export function useRoomDaySlots(params: {
  offerId: string | null;
  date: string | null;
  mode: TeachingModeId | null;
  roomId: string | null;
  durationMinutes: number | null;
}) {
  const { offerId, date, mode, roomId, durationMinutes } = params;
  const enabled = !!offerId && !!date && mode === "partner_room" && !!roomId && !!durationMinutes;
  const [slots, setSlots] = useState<OfferSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Écritures d'état dans un rappel asynchrone (pas de rendu en cascade depuis le corps de l'effet).
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setSlots([]);
      setError(null);
      if (!enabled || !offerId || !date || !mode || !roomId || !durationMinutes) {
        setLoading(false);
        return;
      }
      setLoading(true);
      RoomService.getDaySlots(offerId, { date, mode, roomId, durationMinutes })
        .then((rows) => !cancelled && setSlots(rows))
        .catch((e: Error) => !cancelled && setError(e.message || t("common.unableToLoadTheSlots")))
        .finally(() => !cancelled && setLoading(false));
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, offerId, date, mode, roomId, durationMinutes, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { slots, loading, error, retry };
}
