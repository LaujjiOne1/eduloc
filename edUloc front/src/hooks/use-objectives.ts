import { useCallback, useState } from "react";

import { SearchService } from "@/services/search.service";
import type { LearningObjective } from "@/types/search";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type ObjectivesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "success"; objectives: LearningObjective[] };

/** Loads the learning objectives for the "Quel est votre objectif ?" step. */
export function useObjectives() {
  const [state, setState] = useState<ObjectivesState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const objectives = await SearchService.getObjectives();
      setState(objectives.length > 0 ? { status: "success", objectives } : { status: "empty" });
    } catch {
      setState({ status: "error", message: t("hooks.useObjectives.unableToLoadTheObjectives") });
    }
  }, []);

  useLoadEffect(load);

  return { state, retry: load };
}
