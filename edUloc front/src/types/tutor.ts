import type { AvatarTone, FormatId, LevelRef, TutorGender } from "./common";

export interface TutorOfferSummary {
  id: string;
  title: string;
  durationLabel: string;
  formats: FormatId[];
  priceLabel: string; // [v1+]
}

export interface TutorLocation {
  label: string;
  distanceKm: number | null;
  latitude: number | null; // [v1~] nullable (lieu ONLINE)
  longitude: number | null;
}

/** Carte résultat de recherche + profil public (TutorProfile). */
export interface Tutor {
  id: string; // TutorProfile.id
  firstName: string;
  lastName: string;
  avatarTone: AvatarTone; // dérivé de l'id (UI uniquement, pas en base)
  photoUrl: string | null; // [v1+]
  gender: TutorGender | null; // silhouette par défaut sans photo
  rating: number;
  reviewCount: number;
  isVerified: boolean;
  subjects: string[];
  levels: string[];
  formats: FormatId[];
  location: TutorLocation;
  nextSlotLabel: string;
  bio: string;
  offers: TutorOfferSummary[];
  /** Recherche sémantique : pourquoi ce tuteur ressort (libellés « Matière : … », « Diplôme vérifié »…). */
  matchReasons?: string[];
  /** [v1+] Détail matière × niveau (profil public uniquement) */
  subjectLevels?: { subjectLabel: string; levels: LevelRef[] }[];
}
