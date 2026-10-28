import { api } from "@/api/http";
import { toBeneficiaryType, toEducationLevel, toLocationFormat, toObjective, toTrack } from "@/api/mappers";
import type { AcademicTrackDto, EducationLevelDto, ReferenceOptionsDto, TrackKindDto } from "@/api/contracts/dto";
import type { BeneficiaryType, EducationLevel, LearningObjective, LocationFormatOption } from "@/types/search";
import type { AcademicTrack } from "@/types/track";
import { t } from "@/i18n";

/** Options enums : le backend ne fournit que les catalogues des matières et des niveaux. */
const referenceOptions: ReferenceOptionsDto = {
  relationships: [
    { value: "SELF", get label() { return t("services.searchservice.forMe"); } },
    { value: "CHILD", get label() { return t("common.myChild"); } },
    { value: "RELATIVE", get label() { return t("common.aRelative"); } },
    { value: "OTHER", get label() { return t("common.anotherPerson"); } },
    { value: "SPOUSE", get label() { return t("common.mySpouse"); } },
    { value: "SIBLING", get label() { return t("common.myBrotherSister"); } },
    { value: "PARENT", get label() { return t("common.myParent"); } },
  ],
  objectives: [
    { value: "REMEDIAL", get label() { return t("common.catchUp"); } },
    { value: "ONGOING", get label() { return t("common.regularSupport"); } },
    { value: "EXCELLENCE", get label() { return t("common.goDeeper"); } },
  ],
  difficulties: [
    { value: "THEORETICAL", get label() { return t("common.theoreticalUnderstanding"); } },
    { value: "PRACTICAL", get label() { return t("common.practicalApplication"); } },
    { value: "METHODOLOGICAL", get label() { return t("common.workMethod"); } },
    { value: "CONFIDENCE", get label() { return t("common.selfConfidence"); } },
    { value: "OTHER", get label() { return t("common.other"); } },
  ],
  formats: [
    { value: "IN_PERSON", get label() { return t("common.inPerson2"); } },
    { value: "ONLINE", get label() { return t("common.online"); } },
    { value: "BOTH", get label() { return t("common.both"); } },
  ],
  rhythms: [
    { value: "ONE_TIME", get label() { return t("services.searchservice.oneOff"); } },
    { value: "OCCASIONAL", get label() { return t("services.searchservice.occasional"); } },
    { value: "REGULAR", get label() { return t("services.searchservice.regular"); } },
    { value: "INTENSIVE", get label() { return t("services.searchservice.intensive"); } },
  ],
  teachingModes: [
    { value: "ONLINE", get label() { return t("common.online"); } },
    { value: "AT_HOME_BENEFICIARY", get label() { return t("services.searchservice.atTheBeneficiarySHome"); } },
    { value: "AT_HOME_TUTOR", get label() { return t("common.atTheTutorSPlace"); } },
    { value: "PUBLIC_PLACE", get label() { return t("common.publicPlace"); } },
  ],
};

/** Les 4 choix affichés par l'étape « Pour qui ? » du wizard. */
const WIZARD_RELATIONSHIPS = ["SELF", "CHILD", "RELATIVE", "OTHER"];

export const SearchService = {
  async getLevels(): Promise<EducationLevel[]> {
    return (await api.get<EducationLevelDto[]>("/catalog/education-levels", undefined, { auth: false })).map(toEducationLevel);
  },
  /** Étape 2 de la recherche — GET /catalog/tracks?kind=SERIE|MENTION (public) : séries du lycée ou mentions universitaires. */
  async getTracks(kind: "serie" | "mention", levelName?: string): Promise<AcademicTrack[]> {
    const rows = await api.get<AcademicTrackDto[]>(
      "/catalog/tracks",
      { kind: kind.toUpperCase() as TrackKindDto, levelName: kind === "serie" ? levelName : undefined },
      { auth: false },
    );
    return rows.map(toTrack);
  },
  async getBeneficiaryTypes(): Promise<BeneficiaryType[]> {
    return referenceOptions.relationships.filter((r) => WIZARD_RELATIONSHIPS.includes(r.value)).map(toBeneficiaryType);
  },
  async getLocationFormats(): Promise<LocationFormatOption[]> {
    return referenceOptions.formats.map(toLocationFormat);
  },
  async getObjectives(): Promise<LearningObjective[]> {
    return referenceOptions.objectives.map(toObjective);
  },
  /** [v1+] Toutes les options (difficultés, rythmes, modes d'enseignement…). */
  async getReferenceOptions(): Promise<ReferenceOptionsDto> {
    return referenceOptions;
  },
};
