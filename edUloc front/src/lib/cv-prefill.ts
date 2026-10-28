import type { CvEducationDto, CvExperienceDto, CvPrefillDto, CvSkillDto } from "@/types/cv-import";
import type { TutorSkill } from "@/types/tutor-application";
import {
  EXPERIENCE_AUDIENCES,
  EXPERIENCE_TYPES,
  type ExperienceAudienceId,
  type TutorExperienceType,
} from "@/lib/experience-types";
import type { EducationDegree, TutorExperienceEntry } from "@/store/tutor-application.store";
import { t as tr } from "@/i18n";

/** Mêmes libellés que le choix « Niveau d'études » de l'étape Parcours. */
export const DEGREE_LABELS: Record<NonNullable<CvEducationDto["degreeId"]>, string> = {
  get bac() { return tr("common.baccalaureate"); },
  get licence() { return tr("common.bachelorSDegree"); },
  get master() { return tr("common.masterSDegree"); },
  get doctorat() { return tr("common.doctorate"); },
};

/** Ce que le CV apporte à « Formation initiale » : le diplôme le plus élevé reconnu (le serveur trie déjà). */
export function backgroundFromCv(education: CvEducationDto[]): { degree: EducationDegree | null; field: string; institution: string } | null {
  const top = education.find((e) => e.degreeId) ?? education[0];
  if (!top) return null;
  return {
    degree: top.degreeId ? { id: top.degreeId, label: DEGREE_LABELS[top.degreeId] } : null,
    field: top.field ?? "",
    institution: top.institution ?? "",
  };
}

const typeIdOf = (backend: CvExperienceDto["type"]): TutorExperienceType =>
  EXPERIENCE_TYPES.find((t) => t.backend === backend)?.id ?? "professionnelle";

const audienceIdOf = (label: CvExperienceDto["audience"][number]): ExperienceAudienceId | null =>
  EXPERIENCE_AUDIENCES.find((a) => a.backend === label)?.id ?? null;

/** Une expérience proposée devient une entrée du formulaire, marquée « issue du CV » avec ses avertissements. */
export function experienceFromCv(x: CvExperienceDto): Omit<TutorExperienceEntry, "id"> {
  return {
    type: typeIdOf(x.type),
    title: x.title,
    organization: x.organization,
    period: x.period,
    audience: x.audience.map(audienceIdOf).filter((a): a is ExperienceAudienceId => a !== null),
    subjects: x.subjectsTaught ?? undefined,
    description: x.description ?? undefined,
    fromCv: true,
    warnings: x.warnings,
  };
}

/** Compétence du catalogue reconnue dans le CV, au format de l'étape « Qu'enseignez-vous ? ». */
export function skillFromCv(skill: CvSkillDto): TutorSkill | null {
  if (!skill.subject) return null;
  return {
    id: skill.subject.id,
    label: skill.subject.name,
    category: skill.subject.category ?? "",
    description: skill.subject.description ?? "",
    scope: null,
    levelCategories: skill.subject.levelCategories,
    isVerified: skill.subject.isVerified,
  };
}

/** Sélection du tuteur sur l'écran de relecture : ce qui n'est pas décoché n'entre pas dans le dossier. */
export interface CvSelection {
  education: boolean;
  experiences: Set<number>;
  skills: Set<number>;
}

export const fullSelection = (prefill: CvPrefillDto): CvSelection => ({
  education: prefill.education.length > 0,
  experiences: new Set(prefill.experiences.map((_, i) => i)),
  skills: new Set(prefill.skills.map((_, i) => i)),
});
