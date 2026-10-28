import { useCallback, useEffect, useState } from "react";

import { TutorApplicationService } from "@/services/tutor-application.service";
import type { DegreeId } from "@/types/common";
import type { TutorSkill } from "@/types/tutor-application";
import { t } from "@/i18n";

export type SkillSuggestionsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; skills: TutorSkill[] };

const DEBOUNCE_MS = 250;

type Settled = { key: string; skills: TutorSkill[]; error: string | null };

/**
 * Suggestions de compétences pour la saisie « Qu'enseignez-vous ? » : appel serveur différé (frappe),
 * filtré selon le diplôme du tuteur. Une réponse périmée (frappe plus récente) est ignorée.
 */
export function useSkillSuggestions(query: string, degree: DegreeId | null, enabled: boolean) {
  const text = query.trim();
  const key = `${degree ?? ""}|${text}`;
  const [settled, setSettled] = useState<Settled | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        try {
          const skills = await TutorApplicationService.suggestSkills(text, degree);
          if (!cancelled) setSettled({ key, skills, error: null });
        } catch {
          if (!cancelled) setSettled({ key, skills: [], error: t("hooks.useSkillSuggestions.unableToLoadTheSuggestions") });
        }
      },
      text ? DEBOUNCE_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, key, text, degree, attempt]);

  const retry = useCallback(() => {
    setSettled(null);
    setAttempt((n) => n + 1);
  }, []);

  const state: SkillSuggestionsState = !enabled
    ? { status: "idle" }
    : settled?.key !== key
      ? { status: "loading" }
      : settled.error
        ? { status: "error", message: settled.error }
        : { status: "success", skills: settled.skills };

  return { state, retry };
}
