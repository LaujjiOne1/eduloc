import { useEffect } from "react";

import { startRingtone } from "@/lib/ringtone";

/** Fait sonner tant que `active` est vrai (appel entrant : volume plein + vibration ; tonalité d'attente : plus discrète). */
export function useRingtone(active: boolean, options: { volume?: number; vibrate?: boolean } = {}): void {
  const { volume, vibrate } = options;
  useEffect(() => {
    if (!active) return;
    return startRingtone({ volume, vibrate });
  }, [active, volume, vibrate]);
}
