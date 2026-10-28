import { create } from "zustand";

import type { Category } from "@/types/category";
import type { EducationLevel, SearchCriteria } from "@/types/search";
import type { AcademicTrack } from "@/types/track";

/**
 * La recherche suit l'entonnoir Niveau → Filière (série / mention, selon le niveau) → Matière. Le reste (pour qui, où,
 * objectif, précision du besoin) n'a d'utilité qu'une fois le tuteur choisi : il est demandé à la réservation
 * (booking-wizard.store).
 */
export interface SearchWizardCriteria {
  level: EducationLevel | null;
  track: AcademicTrack | null;
  subject: Category | null;
}

const INITIAL_CRITERIA: SearchWizardCriteria = {
  level: null,
  track: null,
  subject: null,
};

interface SearchWizardStore {
  criteria: SearchWizardCriteria;
  /** Changer de niveau invalide la filière et la matière choisies (elles dépendent du niveau). */
  setLevel: (level: EducationLevel) => void;
  /** Changer de filière invalide la matière (la liste dépend de la série). */
  setTrack: (track: AcademicTrack) => void;
  setSubject: (subject: Category) => void;
  reset: () => void;
}

/**
 * Holds the selections made across the Level → Track → Need wizard so that navigating back and forth between those steps
 * never loses previously entered data. `reset()` is called from the Home screen's "goToSearch" so every fresh
 * search starts from a clean state.
 *
 * This keeps the rich display objects (Category, EducationLevel) the wizard screens already render — the flat
 * `SearchCriteria` the API expects (subjectId/levelId/coordinates...) is derived only at the point of calling
 * TutorService.searchTutors, via `toSearchCriteria` below.
 */
export const useSearchWizardStore = create<SearchWizardStore>((set) => ({
  criteria: INITIAL_CRITERIA,

  setLevel: (level) =>
    set((s) => (s.criteria.level?.id === level.id ? s : { criteria: { level, track: null, subject: null } })),

  setTrack: (track) =>
    set((s) => (s.criteria.track?.id === track.id ? s : { criteria: { ...s.criteria, track, subject: null } })),

  setSubject: (subject) => set((s) => ({ criteria: { ...s.criteria, subject } })),

  reset: () => set({ criteria: INITIAL_CRITERIA }),
}));

/**
 * Flattens the wizard's criteria into the shape TutorService.searchTutors expects. Sans position, la recherche ne
 * porte que sur les cours en ligne (l'API exige des coordonnées pour le présentiel).
 */
export function toSearchCriteria(
  criteria: SearchWizardCriteria,
  coordinates: { latitude: number; longitude: number } | null,
): SearchCriteria {
  return {
    subjectId: criteria.subject?.freeText ? "" : (criteria.subject?.id ?? ""),
    subjectText: criteria.subject?.freeText ? criteria.subject.label : undefined,
    levelId: criteria.level?.id,
    trackId: criteria.track?.id,
    coordinates,
    format: coordinates ? "both" : "online",
    levelCategory: criteria.level?.category,
    levelLabel: criteria.level?.label,
    subjectLabel: criteria.subject?.label,
  };
}
