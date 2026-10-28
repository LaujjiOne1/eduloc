import { useCallback, useState } from "react";

import { AvailabilityService, AvailabilityServiceError } from "@/services/availability.service";
import type { TutorAvailabilityDraft, TutorAvailabilitySlot } from "@/types/availability";
import { t } from "@/i18n";

export type AvailabilityActionState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "deleting" }
  | { status: "error"; message: string };

/** Powers 57_TutorAvailabilityEdit's "Enregistrer" (create or edit) and "Supprimer". */
export function useAvailabilityActions() {
  const [state, setState] = useState<AvailabilityActionState>({ status: "idle" });

  const save = useCallback(async (id: string | null, data: TutorAvailabilityDraft): Promise<TutorAvailabilitySlot | null> => {
    setState({ status: "saving" });
    try {
      const entry = id
        ? await AvailabilityService.updateAvailability(id, data)
        : await AvailabilityService.createAvailability(data);
      setState({ status: "idle" });
      return entry;
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof AvailabilityServiceError ? error.message : t("hooks.useAvailabilityActions.unableToSaveThisAvailability"),
      });
      return null;
    }
  }, []);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    setState({ status: "deleting" });
    try {
      await AvailabilityService.deleteAvailability(id);
      setState({ status: "idle" });
      return true;
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof AvailabilityServiceError ? error.message : t("hooks.useAvailabilityActions.unableToDeleteThisAvailability"),
      });
      return false;
    }
  }, []);

  const saveAll = useCallback(async (drafts: TutorAvailabilityDraft[]): Promise<boolean> => {
    if (drafts.length === 0) return false;
    setState({ status: "saving" });
    try {
      await Promise.all(drafts.map((d) => AvailabilityService.createAvailability(d)));
      setState({ status: "idle" });
      return true;
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof AvailabilityServiceError ? error.message : t("hooks.useAvailabilityActions.unableToSaveTheseAvailabilities"),
      });
      return false;
    }
  }, []);

  return { state, save, saveAll, remove };
}
