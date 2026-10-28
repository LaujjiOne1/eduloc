import { useCallback, useState } from "react";

import { TutorService, TutorServiceError } from "@/services/tutor.service";
import type { Tutor } from "@/types/tutor";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type TutorState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; tutor: Tutor };

/** Loads a single tutor by id for the TutorProfile screen. */
export function useTutor(id: string | undefined) {
  const [state, setState] = useState<TutorState>({ status: "loading" });

  const load = useCallback(async () => {
    if (!id) {
      setState({ status: "error", message: t("hooks.useTutor.thisTutorCouldNotBe") });
      return;
    }
    setState({ status: "loading" });
    try {
      const tutor = await TutorService.getTutorById(id);
      setState({ status: "success", tutor });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof TutorServiceError ? error.message : t("hooks.useTutor.unableToLoadThisTutor"),
      });
    }
  }, [id]);

  useLoadEffect(load);

  return { state, retry: load };
}
