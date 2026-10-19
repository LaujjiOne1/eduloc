import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export enum TeachingModeDto {
  ONLINE = 'ONLINE',
  AT_HOME_BENEFICIARY = 'AT_HOME_BENEFICIARY',
  AT_HOME_TUTOR = 'AT_HOME_TUTOR',
  PUBLIC_PLACE = 'PUBLIC_PLACE',
}

export class CreateBookingDto {
  @IsUUID() offerId!: string;
  @IsUUID() beneficiaryId!: string;
  @IsISO8601({ strict: true }) startAt!: string;
  @IsEnum(TeachingModeDto) teachingMode!: TeachingModeDto;
  @IsOptional() @IsUUID() placeId?: string;
  @IsOptional() @IsUUID() voiceNoteUploadId?: string;
  @IsOptional() @IsString() @MaxLength(500) beneficiaryAddress?: string;
  @IsOptional() @IsString() @MaxLength(1000) requesterNote?: string;
  /** Recherche (POST /matching/search) d'où vient la réservation : mesure de conversion du matching. */
  @IsOptional() @IsUUID() matchingSearchId?: string;
}

export class RefuseBookingDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class CancelBookingDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class StartSessionDto {
  @IsString() @MaxLength(6) otp!: string;
}

export class ListBookingsQueryDto {
  @IsOptional() @IsIn(['requester', 'tutor']) role: 'requester' | 'tutor' = 'requester';
  /** Un ou plusieurs statuts séparés par des virgules : « CONFIRMED,IN_PROGRESS ». */
  @IsOptional() @Matches(/^[A-Z_]+(,[A-Z_]+)*$/, { message: 'status doit être une liste de statuts' }) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}
