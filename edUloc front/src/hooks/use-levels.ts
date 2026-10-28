import { useCallback, useState } from "react";

import { SearchService } from "@/services/search.service";
import type { EducationLevel } from "@/types/search";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type LevelsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "success"; levels: EducationLevel[] };

/** Loads the education levels for the "Quel est le niveau concerné ?" step. */
export function useLevels() {
  const [state, setState] = useState<LevelsState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const levels = await SearchService.getLevels();
      setState(levels.length > 0 ? { status: "success", levels } : { status: "empty" });
    } catch {
      setState({ status: "error", message: t("hooks.useLevels.unableToLoadTheLevels") });
    }
  }, []);

  useLoadEffect(load);

  return { state, retry: load };
}
