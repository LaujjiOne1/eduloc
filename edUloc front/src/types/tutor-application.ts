import type { LocalFile } from "./message";
import type { DegreeId, InPersonModeId, LevelRef, LocationFormatId, TutorGender } from "./common";

/** Compétence = Subject (catalogue). */
export interface TutorSkill {
  id: string; // UUID Subject
  label: string;
  category: string;
  description: string;
  /** Périmètre du cours, saisi par le tuteur (→ competenceDescription côté API). */
  scope: string | null;
  /** Catégories de niveaux où la compétence s'enseigne (vide = tous). */
  levelCategories: string[];
  /** false = ajoutée librement par le tuteur, en attente de validation avec son dossier. */
  isVerified: boolean;
}

export type TutorApplicationStatus = "draft" | "pending" | "approved" | "rejected";
export type TutorDocumentKind = "identity" | "diploma" | "certificate" | "professional_proof" | "other";

export interface TutorApplication {
  id: string;
  status: TutorApplicationStatus;
  submittedAt: string | null;
  rejectionReason: string | null; // [v1+]
  subjects: { skillId: string; skillLabel: string; level: LevelRef }[]; // [v1+]
  documents: { id: string; kind: TutorDocumentKind; fileName: string | null; status: "pending" | "approved" | "rejected" }[]; // [v1+]
}

/** [v1~] Aligné sur TutorApplicationInput + pièces justificatives */
export interface TutorApplicationSubmission {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  bio: string;
  experience?: string;
  educationBackground?: string;
  highestDegree?: DegreeId;
  gender?: TutorGender;
  birthDate?: string;
  experiences: {
    type: "TEACHING" | "SUPERVISION" | "PROFESSIONAL" | "ACADEMIC" | "VOLUNTEER";
    title: string;
    organization: string;
    period: string;
    /** Catégories de niveaux encadrés : « Primaire », « Collège », « Lycée », « Université ». */
    audience?: string[];
    subjectsTaught?: string;
    description?: string;
  }[];
  subjects: { skillId: string; levelIds: string[]; competenceDescription?: string }[];
  offers: {
    subjectId: string;
    educationLevelId: string;
    /** Série (Première/Terminale, obligatoire) ou mention (université). */
    trackId?: string;
    title: string;
    description: string;
    format: LocationFormatId;
    durationMinutes: number;
    price: number;
    currency: string;
  }[];
  locations: { label: string; kind: InPersonModeId; radiusKm: number; isPrimary: boolean; latitude: number; longitude: number }[];
  weeklyAvailability: {
    dayOfWeek: number;
    slots: { startTime: string; endTime: string; format: LocationFormatId; placeIndex?: number | null }[];
  }[];
  /** Disponibilités ponctuelles (un jour précis, une seule fois). */
  dateAvailability?: { date: string; startTime: string; endTime: string; format: LocationFormatId; placeIndex?: number | null }[];
  documents: { kind: TutorDocumentKind; file: LocalFile }[];
  introVideo?: {
    file: LocalFile;
    durationMs: number | null;
  };
}
