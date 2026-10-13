import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID,
  Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

import { DEGREES } from '../catalog/domain/degree-policy';

const FORMATS =['ONLINE', 'IN_PERSON', 'BOTH'] as const;
const PLACE_TYPES = ['TUTOR_HOME', 'BENEFICIARY_HOME', 'PUBLIC_PLACE', 'ONLINE'] as const;
const DOCUMENT_TYPES = ['IDENTITY', 'DIPLOMA', 'CERTIFICATE', 'PROFESSIONAL_PROOF', 'OTHER'] as const;

export class TutorExperienceInputDto {
  @IsIn(['PROFESSIONAL', 'ACADEMIC']) type!: 'PROFESSIONAL' | 'ACADEMIC';
  @IsString() @MaxLength(200) title!: string;
  @IsString() @MaxLength(200) organization!: string;
  @IsString() @MaxLength(100) period!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
}

class TutorSubjectInputDto {
  @IsUUID() subjectId!: string;
  @IsUUID() educationLevelId!: string;
  @IsOptional() @IsString() @MaxLength(1000) competenceDescription?: string;
}

class TutorOfferInputDto {
  @IsUUID() subjectId!: string;
  @IsOptional() @IsUUID() educationLevelId?: string;
  @IsString() @MaxLength(200) title!: string;
  @IsString() @MaxLength(5000) description!: string;
  @IsIn(FORMATS) format!: (typeof FORMATS)[number];
  @Type(() => Number) @IsInt() @Min(15) @Max(480) durationMinutes!: number;
  @Type(() => Number) @IsNumber() @Min(0) price!: number;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
}

class TutorPlaceInputDto {
  @IsString() @MaxLength(200) label!: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) radiusMeters?: number;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsIn(PLACE_TYPES) type!: (typeof PLACE_TYPES)[number];
}

class TutorAvailabilityInputDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(6) dayOfWeek!: number;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
  @IsIn(FORMATS) format!: (typeof FORMATS)[number];
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) placeIndex?: number | null;
  /** Disponibilité ponctuelle : le jour précis (AAAA-MM-JJ). Absent = chaque semaine. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
}

export class TutorApplicationInputDto {
  @IsString() @MaxLength(100) firstName!: string;
  @IsString() @MaxLength(100) lastName!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MaxLength(32) phone!: string;
  @IsOptional() @IsString() @MaxLength(120) displayName?: string;
  @IsOptional() @IsString() @MaxLength(2000) bio?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) birthDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) experience?: string;
  @IsOptional() @IsString() @MaxLength(2000) educationBackground?: string;
  /** Plus haut diplôme : fixe les niveaux que le tuteur peut déclarer (voir degree-policy). */
  @IsOptional() @IsIn(DEGREES) highestDegree?: (typeof DEGREES)[number];
  /** Sexe : avatar par défaut (silhouette) tant que le tuteur n'a pas de photo. */
  @IsOptional() @IsIn(['MALE', 'FEMALE']) gender?: 'MALE' | 'FEMALE';

  @IsArray() @ValidateNested({ each: true }) @Type(() => TutorExperienceInputDto)
  experiences!: TutorExperienceInputDto[];

  @IsArray() @ValidateNested({ each: true }) @Type(() => TutorSubjectInputDto)
  subjects!: TutorSubjectInputDto[];

  @IsArray() @ValidateNested({ each: true }) @Type(() => TutorOfferInputDto)
  offers!: TutorOfferInputDto[];

  @IsArray() @ValidateNested({ each: true }) @Type(() => TutorPlaceInputDto)
  places!: TutorPlaceInputDto[];

  @IsArray() @ValidateNested({ each: true }) @Type(() => TutorAvailabilityInputDto)
  availabilities!: TutorAvailabilityInputDto[];
}

export class TutorUploadRequestDto {
  @IsString() @MaxLength(100) mimeType!: string;
  @Type(() => Number) @IsInt() @Min(1) sizeBytes!: number;
  @IsOptional() @IsString() @MaxLength(255) fileName?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) durationMs?: number;
}

export class TutorDocumentRegistrationDto {
  @IsUUID() uploadId!: string;
  @IsIn(DOCUMENT_TYPES) type!: (typeof DOCUMENT_TYPES)[number];
}

export class TutorVideoRegistrationDto {
  @IsUUID() uploadId!: string;
}
