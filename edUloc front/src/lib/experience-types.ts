import { t as tr } from "@/i18n";
/**
 * Un seul formulaire d'expérience, avec un type à cocher. Les expériences d'enseignement et d'encadrement comptent
 * davantage pour le rapprochement tuteur / demande qu'un poste sans lien avec l'enseignement.
 */
export type TutorExperienceType = "enseignement" | "encadrement" | "professionnelle" | "academique" | "benevolat";

export type ExperienceBackendType = "TEACHING" | "SUPERVISION" | "PROFESSIONAL" | "ACADEMIC" | "VOLUNTEER";

export const EXPERIENCE_TYPES: { id: TutorExperienceType; label: string; backend: ExperienceBackendType; teaching: boolean }[] = [
  { id: "enseignement", get label() { return tr("lib.experienceTypes.teachingTutoring"); }, backend: "TEACHING", teaching: true },
  { id: "encadrement", get label() { return tr("lib.experienceTypes.academicSupervision"); }, backend: "SUPERVISION", teaching: true },
  { id: "professionnelle", get label() { return tr("lib.experienceTypes.professional"); }, backend: "PROFESSIONAL", teaching: false },
  { id: "academique", get label() { return tr("lib.experienceTypes.academicProject"); }, backend: "ACADEMIC", teaching: false },
  { id: "benevolat", get label() { return tr("lib.experienceTypes.volunteering"); }, backend: "VOLUNTEER", teaching: false },
];

export const experienceTypeLabel = (id: TutorExperienceType): string =>
  EXPERIENCE_TYPES.find((t) => t.id === id)?.label ?? id;

export type ExperienceAudienceId = "primaire" | "college" | "lycee" | "universite";

/** `backend` = catégorie de niveau du catalogue (EducationLevel.category). */
export const EXPERIENCE_AUDIENCES: { id: ExperienceAudienceId; label: string; backend: "Primaire" | "Collège" | "Lycée" | "Université" }[] = [
  { id: "primaire", get label() { return tr("common.primarySchool"); }, backend: "Primaire" },
  { id: "college", get label() { return tr("common.middleSchool"); }, backend: "Collège" },
  { id: "lycee", get label() { return tr("common.highSchool"); }, backend: "Lycée" },
  { id: "universite", get label() { return tr("lib.experienceTypes.university"); }, backend: "Université" },
];
