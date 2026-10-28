import type { AvatarTone, LevelRef, TutorGender } from "./common";

export interface SkillRef {
  id: string; // UUID Subject
  label: string;
}

export interface TutorProfileSummary {
  id: string; // TutorProfile.id
  firstName: string;
  lastName: string;
  avatarInitials: string;
  avatarTone: AvatarTone;
  gender: TutorGender | null;
  photoUrl: string | null;
  rating: number;
  reviewCount: number;
  bio: string;
  skills: SkillRef[];
  subjects: { skill: SkillRef; levels: LevelRef[] }[];
  locations: { id: string; label: string; radiusKm: number | null }[];
  applicationStatus: "draft" | "pending" | "approved" | "rejected"; // [v1+]
  isVisible: boolean; // [v1+]
  isSuspended: boolean; // [v1+]
}
