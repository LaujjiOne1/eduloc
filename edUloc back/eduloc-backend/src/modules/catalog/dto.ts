import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { DEGREES } from './domain/degree-policy';

export class SuggestSubjectsQueryDto {
  @IsOptional() @IsString() @MaxLength(60) q?: string;
  /** Plus haut diplôme du tuteur : restreint les matières aux niveaux qu'il peut enseigner. */
  @IsOptional() @IsIn(DEGREES) degree?: (typeof DEGREES)[number];
}

export class TracksQueryDto {
  @IsOptional() @IsIn(['SERIE', 'MENTION']) kind?: 'SERIE' | 'MENTION';
  /** Séries d'un niveau : « Première » ou « Terminale ». */
  @IsOptional() @IsIn(['Première', 'Terminale']) levelName?: 'Première' | 'Terminale';
}

export class CreateSubjectDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value))
  @IsString()
  @MinLength(2, { message: 'name doit contenir au moins 2 caractères.' })
  @MaxLength(60, { message: 'name ne peut pas dépasser 60 caractères.' })
  @Matches(/^[\p{L}\p{N}][\p{L}\p{N} '’.,+#&()/-]*$/u, { message: 'name contient des caractères non autorisés.' })
  name!: string;

  @IsOptional() @IsString() @MaxLength(60) category?: string;
}
