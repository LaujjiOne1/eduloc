import type { LevelRef, LocationFormatId } from "./common";
import type { BeneficiaryType, LearningObjective } from "./search";

export type Relationship = BeneficiaryType["id"];
export type DifficultyId = "theoretical" | "practical" | "methodological" | "confidence" | "other";

export interface SavedBeneficiary {
  id: string;
  firstName: string;
  lastName: string;
  isSelf: boolean;
  relationship: Relationship; // [v1+] enum RelationshipType
  relationLabel: string | null; // dérivé : "Mon enfant", "Un proche"… (null pour SELF)
  level: LevelRef | null;
  objective: LearningObjective["id"] | null; // [v1+]
  difficulty: DifficultyId | null; // [v1+]
  preferredFormat: LocationFormatId | null; // [v1+]
  notes: string | null; // [v1+]
}

/** [v1~] relationLabel libre → relationship (enum) ; level objet → levelId */
export interface CreateBeneficiaryInput {
  firstName: string;
  lastName?: string;
  birthDate?: string | null;
  relationship: Exclude<Relationship, "self">;
  levelId: string | null;
  objective?: LearningObjective["id"];
  difficulty?: DifficultyId;
  preferredFormat?: LocationFormatId;
  preferredRhythm?: "one_time" | "occasional" | "regular" | "intensive";
  notes?: string;
}
