import { api } from "@/api/http";
import { ApiError } from "@/api/errors";
import { toSavedBeneficiary, upper } from "@/api/mappers";
import type {
  BackendCreateBeneficiaryRequestDto,
  BackendObjectiveType,
  BackendBeneficiaryDto,
  BeneficiaryDto,
  DifficultyType,
  EducationLevelDto,
} from "@/api/contracts/dto";
import type { CreateBeneficiaryInput, SavedBeneficiary } from "@/types/beneficiary";
import { t } from "@/i18n";

export { ApiError as BeneficiaryServiceError };

async function normalizeBeneficiary(row: BackendBeneficiaryDto): Promise<SavedBeneficiary> {
  const levels = await api.get<EducationLevelDto[]>("/catalog/education-levels", undefined, { auth: false });
  const educationLevel = row.educationLevelId
    ? levels.find((level) => level.id === row.educationLevelId) ?? null
    : null;
  if (row.educationLevelId && !educationLevel) {
    throw ApiError.local("server_error", t("services.beneficiaryservice.theBeneficiarySStudyLevel"));
  }
  return toSavedBeneficiary({
    ...row,
    isSelf: row.relationship === "SELF",
    educationLevel,
  } as BeneficiaryDto);
}

function objectiveToBackend(value: NonNullable<CreateBeneficiaryInput["objective"]>): BackendObjectiveType {
  switch (value) {
    case "remedial":
      return "REMEDIAL";
    case "ongoing":
      return "ONGOING";
    case "excellence":
      return "EXCELLENCE";
    default:
      throw ApiError.local("validation_error", t("services.beneficiaryservice.theChosenGoalIsNot"));
  }
}

function toDto(i: Partial<CreateBeneficiaryInput>): Partial<BackendCreateBeneficiaryRequestDto> {
  const out: Partial<BackendCreateBeneficiaryRequestDto> = {};
  if (i.firstName !== undefined) out.firstName = i.firstName.trim();
  if (i.lastName !== undefined) out.lastName = i.lastName || null;
  if (i.birthDate !== undefined) out.birthDate = i.birthDate || null;
  if (i.relationship !== undefined) out.relationship = upper(i.relationship) as BackendCreateBeneficiaryRequestDto["relationship"];
  if (i.levelId !== undefined) out.educationLevelId = i.levelId;
  if (i.objective !== undefined) out.objective = objectiveToBackend(i.objective);
  if (i.difficulty !== undefined) out.difficultyType = upper(i.difficulty) as DifficultyType;
  if (i.preferredFormat !== undefined) out.preferredFormat = upper(i.preferredFormat) as BackendCreateBeneficiaryRequestDto["preferredFormat"];
  if (i.preferredRhythm !== undefined) out.preferredRhythm = upper(i.preferredRhythm) as BackendCreateBeneficiaryRequestDto["preferredRhythm"];
  if (i.notes !== undefined) out.notes = i.notes || null;
  return out;
}

/**
 * Routes backend : GET|POST /beneficiaries, POST /beneficiaries/self, PATCH|DELETE /beneficiaries/:id
 * [v1~] plus de paramètre `beneficiaryId` (CURRENT_BENEFICIARY_ID supprimé) : carnet du compte connecté.
 */
export const BeneficiaryService = {
  async getMyBeneficiaries(): Promise<SavedBeneficiary[]> {
    const [rows, levels] = await Promise.all([
      api.get<BackendBeneficiaryDto[]>("/beneficiaries"),
      api.get<EducationLevelDto[]>("/catalog/education-levels", undefined, { auth: false }),
    ]);
    return rows.map((row) => {
      const educationLevel = row.educationLevelId
        ? levels.find((level) => level.id === row.educationLevelId) ?? null
        : null;
      if (row.educationLevelId && !educationLevel) {
        throw ApiError.local("server_error", t("services.beneficiaryservice.theBeneficiarySStudyLevel"));
      }
      return toSavedBeneficiary({
        ...row,
        isSelf: row.relationship === "SELF",
        educationLevel,
      } as BeneficiaryDto);
    });
  },
  async createBeneficiary(input: CreateBeneficiaryInput): Promise<SavedBeneficiary> {
    if (!input.firstName.trim()) throw ApiError.local("validation_error", t("common.firstNameIsRequired"));
    return normalizeBeneficiary(await api.post<BackendBeneficiaryDto>("/beneficiaries", toDto(input)));
  },
  /**
   * « Pour moi » : POST /beneficiaries/self — le bénéficiaire « moi-même » est créé depuis le compte (aucune saisie)
   * ou retrouvé ; le niveau indiqué pour ce cours y est reporté. Idempotent.
   */
  async ensureSelfBeneficiary(levelId?: string | null): Promise<SavedBeneficiary> {
    return normalizeBeneficiary(
      await api.post<BackendBeneficiaryDto>("/beneficiaries/self", levelId ? { educationLevelId: levelId } : {}),
    );
  },
  async updateBeneficiary(id: string, input: Partial<CreateBeneficiaryInput>): Promise<SavedBeneficiary> {
    return normalizeBeneficiary(await api.patch<BackendBeneficiaryDto>(`/beneficiaries/${id}`, toDto(input)));
  },
  async archiveBeneficiary(id: string): Promise<void> {
    await api.delete(`/beneficiaries/${id}`);
  },
};
