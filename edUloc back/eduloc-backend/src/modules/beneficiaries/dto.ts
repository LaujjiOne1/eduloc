import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min,
  ValidateNested,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Créneau de disponibilité souhaité par le Demandeur (jour de semaine, heures locales). */
export class AvailabilityWindowDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(6) dayOfWeek!: number;
  @Matches(HHMM, { message: 'startTime doit être au format HH:mm' }) startTime!: string;
  @Matches(HHMM, { message: 'endTime doit être au format HH:mm' }) endTime!: string;
}

const PLACES = ['ONLINE', 'AT_HOME_BENEFICIARY', 'AT_HOME_TUTOR', 'PUBLIC_PLACE', 'PARTNER_ROOM'] as const;

/**
 * Préférences de recherche. Jamais d'adresse exacte à l'inscription : seulement une zone (quartier) ; l'adresse précise
 * n'est demandée qu'au cours à domicile, une fois le Tuteur choisi.
 */
export class SearchPreferencesDto {
  /** Quartier ou adresse approximative de référence. */
  @IsOptional() @IsString() @MaxLength(120) areaLabel?: string;
  /** Rayon de recherche souhaité (mètres). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(500) @Max(50_000) searchRadiusM?: number;
  /** Lieu préféré pour les séances. */
  @IsOptional() @IsEnum(PLACES) preferredPlace?: (typeof PLACES)[number];
  /** Budget maximum par séance (Ar). */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxBudget?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(28) @ValidateNested({ each: true }) @Type(() => AvailabilityWindowDto)
  availabilityWindows?: AvailabilityWindowDto[];
}

export class CreateBeneficiaryDto extends SearchPreferencesDto {
  @IsString() @MaxLength(100) firstName!: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @IsOptional() @IsDateString() birthDate?: string;
  @IsEnum(['SELF', 'CHILD', 'SPOUSE', 'SIBLING', 'PARENT', 'RELATIVE', 'OTHER']) relationship!: string;
  @IsOptional() @IsUUID() educationLevelId?: string;
  @IsOptional() @IsEnum(['REMEDIAL', 'ONGOING', 'EXCELLENCE']) objective?: string;
  @IsOptional() @IsEnum(['THEORETICAL', 'PRACTICAL', 'METHODOLOGICAL', 'CONFIDENCE', 'OTHER']) difficultyType?: string;
  @IsOptional() @IsEnum(['ONLINE', 'IN_PERSON', 'BOTH']) preferredFormat?: string;
  @IsOptional() @IsEnum(['ONE_TIME', 'OCCASIONAL', 'REGULAR', 'INTENSIVE']) preferredRhythm?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateBeneficiaryDto extends SearchPreferencesDto {
  @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @IsOptional() @IsDateString() birthDate?: string;
  @IsOptional() @IsUUID() educationLevelId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsEnum(['REMEDIAL', 'ONGOING', 'EXCELLENCE']) objective?: string;
  @IsOptional() @IsEnum(['THEORETICAL', 'PRACTICAL', 'METHODOLOGICAL', 'CONFIDENCE', 'OTHER']) difficultyType?: string;
  @IsOptional() @IsEnum(['ONLINE', 'IN_PERSON', 'BOTH']) preferredFormat?: string;
  @IsOptional() @IsEnum(['ONE_TIME', 'OCCASIONAL', 'REGULAR', 'INTENSIVE']) preferredRhythm?: string;
}

export class EnsureSelfDto {
  @IsOptional() @IsUUID() educationLevelId?: string;
}
