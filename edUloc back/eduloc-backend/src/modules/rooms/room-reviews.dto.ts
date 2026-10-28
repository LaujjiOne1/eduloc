import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateRoomReviewDto {
  /** Séance TERMINÉE tenue dans une salle partenaire, à laquelle l'auteur a assisté. */
  @IsUUID() bookingId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) cleanliness!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) safety!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) accessibility!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) equipment!: number;
  /** Respect des horaires. */
  @Type(() => Number) @IsInt() @Min(1) @Max(5) punctuality!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) overall!: number;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

export class ReplyRoomReviewDto {
  @IsString() @MaxLength(2000) text!: string;
}

export class HideRoomReviewDto {
  /** Motif enregistré : avis frauduleux, offensant ou contenant des informations privées. */
  @IsString() @MaxLength(1000) reason!: string;
}

export class AdminRoomReviewsQueryDto {
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() hidden?: boolean;
  @IsOptional() @IsUUID() roomId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 100;
}
