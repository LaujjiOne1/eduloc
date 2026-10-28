import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsEnum, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min,
} from 'class-validator';

export enum TeachingModeDto {
  ONLINE = 'ONLINE',
  AT_HOME_BENEFICIARY = 'AT_HOME_BENEFICIARY',
  AT_HOME_TUTOR = 'AT_HOME_TUTOR',
  PUBLIC_PLACE = 'PUBLIC_PLACE',
  PARTNER_ROOM = 'PARTNER_ROOM',
}

export class CreateBookingDto {
  @IsUUID() offerId!: string;
  @IsUUID() beneficiaryId!: string;
  @IsISO8601({ strict: true }) startAt!: string;
  @IsEnum(TeachingModeDto) teachingMode!: TeachingModeDto;
  @IsOptional() @IsUUID() placeId?: string;
  /** Salle partenaire : obligatoire si teachingMode = PARTNER_ROOM, interdite sinon. */
  @IsOptional() @IsUUID() roomId?: string;
  /** Durée choisie parmi celles de l'offre (durationMinutes + durationOptions) ; absente = durée par défaut de l'offre. */
  @IsOptional() @IsInt() @Min(15) @Max(480) durationMinutes?: number;
  /** Besoins de la séance, contrôlés contre la capacité et les équipements de la salle. */
  @IsOptional() @IsInt() @Min(1) @Max(200) participantsCount?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(60, { each: true }) requiredEquipment?: string[];
  @IsOptional() @IsUUID() voiceNoteUploadId?: string;
  @IsOptional() @IsString() @MaxLength(500) beneficiaryAddress?: string;
  /** Position APPROXIMATIVE du lieu du cours chez le Bénéficiaire : sert au forfait de déplacement et à la zone du Tuteur. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) beneficiaryLatitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) beneficiaryLongitude?: number;
  /** Blocage obtenu par POST /bookings/quote : la création le consomme (et vérifie que le total annoncé n'a pas changé). */
  @IsOptional() @IsUUID() holdId?: string;
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
