import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches,
  Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** ASSOCIATION et COMMUNITY_CENTER sont conservés pour les structures déjà créées. */
export const VENUE_TYPES = ['TRAINING_CENTER', 'SCHOOL', 'LIBRARY', 'COWORKING', 'COMPANY', 'ASSOCIATION', 'COMMUNITY_CENTER', 'OTHER'] as const;
export const VENUE_DOCUMENT_TYPES = ['OWNERSHIP_PROOF', 'BUSINESS_REGISTRATION', 'MANAGER_IDENTITY', 'INSURANCE', 'OTHER'] as const;

export class VenueDto {
  @IsString() @MinLength(2) @MaxLength(200) name!: string;
  @IsOptional() @IsIn(VENUE_TYPES) type?: (typeof VENUE_TYPES)[number];
  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsOptional() @IsString() @MaxLength(200) legalName?: string;
  @IsOptional() @IsString() @MaxLength(100) registrationNumber?: string;
  /** Facultatifs à l'inscription ; obligatoires pour être validé « Partenaire vérifié ». */
  @IsOptional() @IsString() @Matches(/^[0-9A-Za-z .\-/]{5,30}$/, { message: 'Numéro invalide' }) nif?: string;
  @IsOptional() @IsString() @Matches(/^[0-9A-Za-z .\-/]{5,30}$/, { message: 'Numéro invalide' }) stat?: string;
  @IsOptional() @IsString() @MaxLength(40) contactPhone?: string;
  @IsOptional() @IsEmail() @MaxLength(200) contactEmail?: string;
}

export class UpdateVenueDto extends PartialType(VenueDto) {}

export class RoomDto {
  @IsString() @MinLength(2) @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  /** Position EXACTE : jamais renvoyée par une API publique ni avant la confirmation de la séance. */
  @IsOptional() @IsString() @MaxLength(300) addressLine?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsString() @MaxLength(1500) accessInstructions?: string;
  /** Zone approximative affichée publiquement (quartier, ville) : ne mettez pas l'adresse exacte. */
  @IsOptional() @IsString() @MaxLength(120) zoneLabel?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) capacity?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) @MaxLength(60, { each: true }) equipment?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(60, { each: true }) accessibility?: string[];
  @IsOptional() @IsBoolean() welcomesMinors?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) pricePerHour?: number;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
  @IsOptional() @IsString() @MaxLength(3000) rules?: string;
  @IsOptional() @IsString() @MaxLength(3000) cancellationPolicy?: string;
}

export class UpdateRoomDto extends PartialType(RoomDto) {}

export class RoomAvailabilityDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(6) dayOfWeek!: number;
  @Matches(HHMM, { message: 'startTime doit être au format HH:mm' }) startTime!: string;
  @Matches(HHMM, { message: 'endTime doit être au format HH:mm' }) endTime!: string;
  @IsOptional() @IsDateString() validFrom?: string | null;
  @IsOptional() @IsDateString() validUntil?: string | null;
}

/** Remplace TOUTES les plages d'ouverture de la salle (liste vide = salle fermée). */
export class ReplaceRoomAvailabilitiesDto {
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => RoomAvailabilityDto)
  availabilities!: RoomAvailabilityDto[];
}

export class RoomBlockDto {
  @IsDateString() startAt!: string;
  @IsDateString() endAt!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class SetRoomActiveDto {
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean() isActive!: boolean;
}

export class UploadRequestDto {
  @IsString() @MaxLength(100) mimeType!: string;
  @Type(() => Number) @IsInt() @Min(1) sizeBytes!: number;
  @IsOptional() @IsString() @MaxLength(255) fileName?: string;
}

export class RegisterVenueDocumentDto {
  @IsUUID() uploadId!: string;
  @IsIn(VENUE_DOCUMENT_TYPES) type!: (typeof VENUE_DOCUMENT_TYPES)[number];
}

export class RegisterRoomPhotoDto {
  @IsUUID() uploadId!: string;
}

export class SelectPlanDto {
  @IsUUID() planId!: string;
}

export class ReservationsQueryDto {
  @IsOptional() @IsUUID() roomId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 100;
}

// ---------------------------------------------------------------- administration

export const VENUE_DECISIONS = ['START_REVIEW', 'APPROVE', 'REQUEST_CORRECTION', 'SUSPEND', 'REINSTATE', 'REJECT', 'DISABLE'] as const;
export const ROOM_DECISIONS = ['START_REVIEW', 'APPROVE', 'REQUEST_CORRECTION', 'SUSPEND', 'REINSTATE', 'REJECT'] as const;

export class VenueReviewDto {
  @IsIn(VENUE_DECISIONS) decision!: (typeof VENUE_DECISIONS)[number];
  /** Obligatoire pour demander une correction ou suspendre : le Gestionnaire doit savoir quoi faire. */
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class RoomReviewDto {
  @IsIn(ROOM_DECISIONS) decision!: (typeof ROOM_DECISIONS)[number];
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class RoomPublicationDecisionDto {
  @IsIn(['UNPUBLISH', 'RESTORE']) action!: 'UNPUBLISH' | 'RESTORE';
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class AdminListQueryDto {
  @IsOptional() @IsString() @MaxLength(40) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 50;
}

export class AdminReservationsQueryDto {
  @IsOptional() @IsUUID() roomId?: string;
  @IsOptional() @Matches(/^[A-Z_]+(,[A-Z_]+)*$/) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 100;
}

export class PlanDto {
  @IsString() @Matches(/^[A-Z0-9_]{2,40}$/, { message: 'code : majuscules, chiffres et _' }) code!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @Type(() => Number) @IsNumber() @Min(0) priceAmount!: number;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(3650) durationDays!: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdatePlanDto extends PartialType(PlanDto) {}
