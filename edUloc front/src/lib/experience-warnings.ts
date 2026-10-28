import { EXPERIENCE_TYPES } from "@/lib/experience-types";
import type { TutorExperienceEntry } from "@/store/tutor-application.store";
import { t as tr } from "@/i18n";

/**
 * Petits avertissements sur une expérience incomplète : l'information manque, mais rien ne bloque. Ceux de l'import de
 * CV (intitulé introuvable, date incertaine…) sont conservés tant que le tuteur n'a pas relu et enregistré l'entrée.
 */
export function experienceWarnings(entry: TutorExperienceEntry): string[] {
  const warnings: string[] = [];
  if (!entry.period.trim()) warnings.push(tr("lib.experienceWarnings.missingPeriodSayWhenOr"));
  // Un projet académique n'a pas toujours de structure : ce n'est pas une information manquante.
  if (!entry.organization.trim() && entry.type !== "academique") warnings.push(tr("lib.experienceWarnings.missingInstitutionCompanyOrOrganisation"));
  const isTeaching = EXPERIENCE_TYPES.find((t) => t.id === entry.type)?.teaching;
  if (isTeaching && entry.audience.length === 0) warnings.push(tr("lib.experienceWarnings.audienceNotSpecifiedPrimaryMiddle"));
  if (isTeaching && !entry.subjects?.trim()) warnings.push(tr("lib.experienceWarnings.subjectsTaughtNotSpecifiedThey"));
  // Les avertissements de l'import qui disent déjà la même chose ne sont pas répétés.
  const importOnly = (entry.warnings ?? []).filter((w) => !/manquant|non précis/i.test(w));
  return [...warnings, ...importOnly];
}
