import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString,
  IsIn, IsUUID, Matches, Max, MaxLength, Min,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ProfileDto {
  @IsOptional() @IsString() @MaxLength(120) displayName?: string;
  @IsOptional() @IsString() @MaxLength(2000) bio?: string;
  @IsOptional() @IsDateString() birthDate?: string;
  @IsOptional() @IsString() @MaxLength(512) profilePhoto?: string;
  @IsOptional() @IsIn(['MALE', 'FEMALE']) gender?: 'MALE' | 'FEMALE';
  @IsOptional() @IsString() @MaxLength(2000) experience?: string;
  @IsOptional() @IsString() @MaxLength(2000) educationBackground?: string;
}

export class SubjectDto {
  @IsUUID() subjectId!: string;
  @IsUUID() educationLevelId!: string;
  @IsOptional() @IsString() @MaxLength(1000) competenceDescription?: string;
}

export class OfferDto {
  @IsUUID() subjectId!: string;
  @IsOptional() @IsUUID() educationLevelId?: string;
  @IsString() @MaxLength(200) title!: string;
  @IsString() @MaxLength(5000) description!: string;
  @IsOptional() @IsEnum(['ONLINE', 'IN_PERSON', 'BOTH']) format?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(15) @Max(480) durationMinutes?: number;
  @Type(() => Number) @IsNumber() @Min(0) price!: number;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
}

/** PartialType hérite des règles de validation : un PATCH ne peut jamais écrire un champ hors DTO. */
export class UpdateOfferDto extends PartialType(OfferDto) {}

export class SetActiveDto {
  /** Accepte `true` / `false` (booléen) comme « true » / « false » (chaîne). */
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean() isActive!: boolean;
}

export class PlaceDto {
  @IsString() @MaxLength(200) label!: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number;
  /** Rayon de déplacement en mètres. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) radiusMeters?: number;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsEnum(['TUTOR_HOME', 'BENEFICIARY_HOME', 'PUBLIC_PLACE', 'ONLINE']) type!: string;
}

export class UpdatePlaceDto extends PartialType(PlaceDto) {}

export class AvailabilityDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(6) dayOfWeek!: number;
  @Matches(HHMM, { message: 'startTime doit être au format HH:mm' }) startTime!: string;
  @Matches(HHMM, { message: 'endTime doit être au format HH:mm' }) endTime!: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional() @IsUUID() placeId?: string | null;
  /** true : cours à distance. Le serveur rattache la plage au lieu « En ligne » du tuteur (créé au besoin). */
  @IsOptional() @IsBoolean() online?: boolean;
  @IsOptional() @IsUUID() offerId?: string | null;
  @IsOptional() @IsDateString() validFrom?: string | null;
  @IsOptional() @IsDateString() validUntil?: string | null;
}

export class UpdateAvailabilityDto extends PartialType(AvailabilityDto) {}

export class BlockPeriodDto {
  @IsDateString() startAt!: string;
  @IsDateString() endAt!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
