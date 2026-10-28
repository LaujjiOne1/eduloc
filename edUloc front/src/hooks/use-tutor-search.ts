import { useCallback, useState } from "react";

import { isApiError } from "@/api/errors";
import { LocationService } from "@/services/location.service";
import { TutorService, usesSemanticMatching } from "@/services/tutor.service";
import { useAuthStore } from "@/store/auth.store";
import { type SearchWizardCriteria, toSearchCriteria } from "@/store/search-wizard.store";
import type { Tutor } from "@/types/tutor";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type TutorsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "success"; tutors: Tutor[] };

/** Loads tutors matching the wizard's search criteria for the Results / ResultsMap steps. */
export function useTutorSearch(criteria: SearchWizardCriteria) {
  const [state, setState] = useState<TutorsState>({ status: "loading" });
  /** Position de l'appareil utilisée pour la recherche ; null quand elle est indisponible (recherche en ligne). */
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [originLabel, setOriginLabel] = useState<string | null>(null);
  /** Pourquoi les résultats se limitent aux cours en ligne (position refusée ou indisponible). */
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      // Le lieu n'est plus demandé dans la recherche : le présentiel s'appuie sur la position de l'appareil (D-12).
      // Sans elle, on cherche les cours en ligne plutôt que de bloquer l'utilisateur.
      let coordinates: { latitude: number; longitude: number } | null = null;
      try {
        const position = await LocationService.getCurrentPosition();
        coordinates = { latitude: position.latitude, longitude: position.longitude };
        setOriginLabel(position.label);
        setLocationNotice(null);
      } catch (error) {
        setOriginLabel(null);
        setLocationNotice(
          t("hooks.useTutorSearch.onlyOnlineLessonsShown", { reason: isApiError(error) ? error.message : t("hooks.useTutorSearch.positionUnavailable") }),
        );
      }
      setOrigin(coordinates);
      const searchCriteria = toSearchCriteria(criteria, coordinates);
      let tutors: Tutor[] | null = null;
      // Niveau universitaire + connecté : matching hiérarchique. En cas d'échec (Ollama arrêté…), recherche classique.
      if (usesSemanticMatching(searchCriteria) && useAuthStore.getState().user !== null) {
        try {
          tutors = await TutorService.searchTutorsSemantic(searchCriteria);
        } catch (error) {
          // Une matière saisie librement n'a pas de recherche classique de repli : l'erreur est affichée telle quelle.
          if (!searchCriteria.subjectId) throw error;
          console.warn("[matching] indisponible, recherche classique", error);
        }
      }
      tutors = tutors ?? (await TutorService.searchTutors(searchCriteria));
      setState(tutors.length > 0 ? { status: "success", tutors } : { status: "empty" });
    } catch (error) {
      // Le message de l'API (« Connexion impossible… ») est plus utile qu'un texte générique.
      setState({
        status: "error",
        message: isApiError(error) ? error.message : t("hooks.useTutorSearch.unableToLoadTheTutors"),
      });
    }
  }, [criteria]);

  useLoadEffect(load);

  return { state, retry: load, origin, originLabel, locationNotice };
}
