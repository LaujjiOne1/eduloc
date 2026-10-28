import { useCallback, useState } from "react";

import { BeneficiaryService } from "@/services/beneficiary.service";
import type { SavedBeneficiary } from "@/types/beneficiary";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type MyBeneficiariesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; beneficiaries: SavedBeneficiary[] };

/**
 * Loads the signed-in beneficiary's saved address book for 34_Beneficiaries.
 * No "empty" state: the requester's own "(vous)" entry is always seeded, so
 * an empty list isn't a reachable case (unlike getMyBookings/getMyNotifications).
 */
export function useMyBeneficiaries() {
  const [state, setState] = useState<MyBeneficiariesState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const beneficiaries = await BeneficiaryService.getMyBeneficiaries();
      setState({ status: "success", beneficiaries });
    } catch {
      setState({ status: "error", message: t("hooks.useMyBeneficiaries.unableToLoadYourBeneficiaries") });
    }
  }, []);

  useLoadEffect(load);

  return { state, retry: load };
}
