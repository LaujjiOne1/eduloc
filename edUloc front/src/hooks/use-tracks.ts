import { useCallback, useState } from "react";

import { SearchService } from "@/services/search.service";
import type { AcademicTrack } from "@/types/track";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type TracksState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "success"; tracks: AcademicTrack[] };

/** Charge les séries (lycée, celles du niveau `levelName`) ou les mentions (université) de l'étape 2 de la recherche. */
export function useTracks(kind: "serie" | "mention" | null, levelName?: string) {
  const [state, setState] = useState<TracksState>({ status: "loading" });

  const load = useCallback(async () => {
    if (!kind) return;
    setState({ status: "loading" });
    try {
      const tracks = await SearchService.getTracks(kind, levelName);
      setState(tracks.length > 0 ? { status: "success", tracks } : { status: "empty" });
    } catch {
      setState({ status: "error", message: t("hooks.useTracks.unableToLoadTheTracks") });
    }
  }, [kind, levelName]);

  useLoadEffect(load);

  return { state, retry: load };
}
