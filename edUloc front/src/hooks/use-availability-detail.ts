import { useCallback, useState } from "react";

import { AvailabilityService, AvailabilityServiceError } from "@/services/availability.service";
import type { TutorAvailabilitySlot } from "@/types/availability";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type AvailabilityDetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; entry: TutorAvailabilitySlot };

/** Loads a single availability entry by id for 57_TutorAvailabilityEdit in edit mode. */
export function useAvailabilityDetail(id: string | undefined) {
  const [state, setState] = useState<AvailabilityDetailState>({ status: "loading" });

  const load = useCallback(async () => {
    if (!id) {
      setState({ status: "error", message: t("hooks.useAvailabilityDetail.thisAvailabilityCouldNotBe") });
      return;
    }
    setState({ status: "loading" });
    try {
      const entry = await AvailabilityService.getAvailabilityById(id);
      setState({ status: "success", entry });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof AvailabilityServiceError ? error.message : t("hooks.useAvailabilityDetail.unableToLoadThisAvailability"),
      });
    }
  }, [id]);

  useLoadEffect(load);

  return { state, retry: load };
}
