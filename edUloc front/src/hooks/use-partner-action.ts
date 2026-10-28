import { useCallback, useRef, useState } from "react";

import { PartnerServiceError } from "@/services/partner.service";
import { t as translate } from "@/i18n";

/**
 * Exécute UNE action asynchrone à la fois (idle → busy → succès | erreur lisible). Un second appel pendant qu'une
 * action est en cours est ignoré : pas de double soumission. Renvoie le résultat, ou null en cas d'échec.
 */
export function usePartnerAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const run = useCallback(async <T,>(key: string, action: () => Promise<T>, fallbackMessage = translate("hooks.usePartnerAction.actionUnavailable")): Promise<T | null> => {
    if (running.current) return null;
    running.current = true;
    setBusy(key);
    setError(null);
    try {
      return await action();
    } catch (e) {
      setError(e instanceof PartnerServiceError ? e.message : fallbackMessage);
      return null;
    } finally {
      running.current = false;
      setBusy(null);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  return { busy, error, run, clearError };
}
