/**
 * Import de CV — contrat de GET /cv-imports/:id. Le résultat est une PROPOSITION de pré-remplissage : chaque élément
 * porte ses avertissements et une confiance ; le tuteur relit et confirme avant qu'il n'entre dans le dossier.
 */
export type CvImportStatusDto = "PENDING" | "PROCESSING" | "DONE" | "FAILED";
export type CvImportErrorCode = "UNREADABLE" | "LLM_UNAVAILABLE" | "INVALID_OUTPUT";
/** Étape de l'analyse en cours côté serveur : lecture du CV (OCR si besoin), repérage du parcours, rapprochement du catalogue. */
export type CvImportStageDto = "READING" | "ANALYZING" | "MATCHING";

export interface CvSubjectRefDto {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  levelCategories: string[];
  isVerified: boolean;
}

export interface CvEducationDto {
  degreeId: "bac" | "licence" | "master" | "doctorat" | null;
  level: string | null;
  degreeLabel: string | null;
  field: string | null;
  institution: string | null;
  period: string;
  status: "EN_COURS" | "OBTENU" | null;
  confidence: number;
  warnings: string[];
}

export interface CvExperienceDto {
  type: "TEACHING" | "SUPERVISION" | "PROFESSIONAL" | "ACADEMIC" | "VOLUNTEER";
  title: string;
  organization: string;
  period: string;
  description: string | null;
  subjectsTaught: string | null;
  audience: ("Primaire" | "Collège" | "Lycée" | "Université")[];
  confidence: number;
  warnings: string[];
}

export interface CvSkillDto {
  label: string;
  category: string | null;
  subject: CvSubjectRefDto | null;
  matchedBy: "exact" | "alias" | "contains" | "embedding" | null;
  confidence: number;
}

export interface CvPrefillDto {
  profile: { fullName: string | null; phone: string | null; email: string | null; city: string | null };
  education: CvEducationDto[];
  experiences: CvExperienceDto[];
  skills: CvSkillDto[];
  languages: { language: string; level: string | null }[];
  warnings: string[];
}

export interface CvImportDto {
  id: string;
  status: CvImportStatusDto;
  /** Renseignée pendant PROCESSING uniquement. */
  stage: CvImportStageDto | null;
  fileName: string | null;
  errorCode: CvImportErrorCode | null;
  result: CvPrefillDto | null;
  createdAt: string;
}
