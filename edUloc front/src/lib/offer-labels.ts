import type { TutorSkill } from "@/types/tutor-application";
import type { EducationLevel } from "@/types/search";
import type { AcademicTrack } from "@/types/track";
import { t } from "@/i18n";

/** « Série C » → « C » : la série se lit à côté du niveau (« Terminale C »). */
export const trackShortLabel = (track: AcademicTrack): string => track.label.replace(/^Série\s+/i, "");

/** « Terminale C », « Licence 1 ». */
export const offerLevelLabel = (level: EducationLevel, track: AcademicTrack | null): string =>
  track?.kind === "serie" ? `${level.label} ${trackShortLabel(track)}` : level.label;

/** Titre généré : le tuteur ne saisit plus que le prix, par niveau. */
export const offerTitle = (skill: TutorSkill, level: EducationLevel, track: AcademicTrack | null): string =>
  `${skill.label} — ${offerLevelLabel(level, track)}`;

/** Description générée : le périmètre du cours saisi pour la matière, à défaut une phrase neutre. */
export const offerDescription = (skill: TutorSkill, level: EducationLevel, track: AcademicTrack | null): string =>
  skill.scope?.trim() || t("lib.offerLabels.lessonsForTheLevel", { label: skill.label, offerLevelLabel: offerLevelLabel(level, track) });
