import { useCallback, useState } from "react";

import { BeneficiaryService, BeneficiaryServiceError } from "@/services/beneficiary.service";
import type { SavedBeneficiary } from "@/types/beneficiary";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type SelfBeneficiaryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; beneficiary: SavedBeneficiary };

/**
 * « Pour moi » : le demandeur EST le bénéficiaire, on ne lui redemande rien. Le serveur crée (ou retrouve)
 * son bénéficiaire « moi-même » à partir du compte ; le niveau déjà indiqué dans la recherche y est reporté.
 * `enabled` = false : aucun appel (cours pour quelqu'un d'autre).
 */
export function useSelfBeneficiary(enabled: boolean, levelId: string | null) {
  const [state, setState] = useState<SelfBeneficiaryState>({ status: "loading" });

  const resolve = useCallback(async () => {
    try {
      const beneficiary = await BeneficiaryService.ensureSelfBeneficiary(levelId);
      setState({ status: "ready", beneficiary });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof BeneficiaryServiceError ? error.message : t("hooks.useSelfBeneficiary.unableToPrepareYourRequest"),
      });
    }
  }, [levelId]);

  const start = useCallback(() => {
    if (enabled) void resolve();
  }, [enabled, resolve]);
  useLoadEffect(start);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    void resolve();
  }, [resolve]);

  return { state, retry };
}
