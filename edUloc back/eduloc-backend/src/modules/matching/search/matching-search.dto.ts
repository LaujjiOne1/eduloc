import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Corps de POST /matching/search (spec §2.2). Il n'existe pas de modèle « Demande » : la demande est cette requête.
 * Le niveau vient TOUJOURS du bénéficiaire (le Demandeur ne choisit pas un autre niveau) ; au moins un de
 * `subjectId` / `subjectText` est requis.
 */
export class MatchingSearchDto {
  /** Obligatoire : donne le niveau (educationLevelId). Doit appartenir au Demandeur connecté et ne pas être archivé. */
  @IsUUID() beneficiaryId!: string;
  /** Matière du catalogue, si choisie. */
  @IsOptional() @IsUUID() subjectId?: string;
  /** Matière saisie librement (ex. « Analyse 2 »). */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) subjectText?: string;
  /** Filière choisie à l'étape 2 (série du lycée ou mention universitaire), facultative. */
  @IsOptional() @IsUUID() trackId?: string;
  /** Précision du besoin, 10 à 1 000 caractères, OBLIGATOIRE. */
  @Transform(trim) @IsString() @MinLength(10) @MaxLength(1000) needDescription!: string;
  /** Défaut : Beneficiary.objective. */
  @IsOptional() @IsIn(['REMEDIAL', 'ONGOING', 'EXCELLENCE']) objective?: 'REMEDIAL' | 'ONGOING' | 'EXCELLENCE';
  /** Défaut : Beneficiary.preferredFormat. */
  @IsOptional() @IsIn(['ONLINE', 'IN_PERSON', 'BOTH']) format?: 'ONLINE' | 'IN_PERSON' | 'BOTH';
  /** Défaut 10, max 20. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) limit?: number;
}

export interface MatchingResult {
  tutorProfileId: string;
  displayName: string;
  profilePhoto: string | null;
  rating: number;
  reviewsCount: number;
  /** Libellés (jamais de contenu de document) ; « vérifié » seulement pour l'élément réellement contrôlé. */
  matchReasons: string[];
  offers: { id: string; title: string; price: string; currency: string; format: 'ONLINE' | 'IN_PERSON' | 'BOTH' }[];
  nextSlots: { startAt: string; endAt: string }[];
  /** false : aucun créneau libre dans les 14 jours, le tuteur reste contactable. */
  hasNearSlot: boolean;
}

export interface MatchingSearchResponse {
  searchId: string;
  results: MatchingResult[];
  reason?: 'NO_TUTOR_FOR_LEVEL' | 'NO_TUTOR_FOR_FORMAT' | 'NO_RELEVANT_TUTOR';
}
