import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { EQUIVALENT_DEGREES } from '../catalog/domain/academic-scale';

export class UsersQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION']) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() page = 1;
}

export class AdminBookingsQueryDto {
  @IsOptional() @IsIn(['PENDING', 'CONFIRMED', 'REFUSED', 'CANCELLED', 'IN_PROGRESS', 'COMPLETED']) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
}

export class AdminOffersQueryDto {
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'DISABLED_BY_ADMIN']) state?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
}

export class SetUserStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED']) status!: 'ACTIVE' | 'SUSPENDED';
}

export class RejectApplicationDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class SuspendTutorDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class ModerateOfferDto {
  @IsIn(['disable', 'enable']) action!: 'disable' | 'enable';
}

export class ResolveConflictDto {
  @IsString() @MaxLength(2000) resolution!: string;
}

/** Corps facultatif de l'approbation : niveau académique validé et équivalence de diplôme (exigences E3, E6, E9). */
export class ApproveApplicationDto {
  /** Équivalence VALIDATED à appliquer (diplôme OTHER) ; elle alimente le niveau académique. */
  @IsOptional() @IsUUID() degreeEquivalenceId?: string;
  /** Niveau académique que l'admin valide ; prioritaire sur celui de l'équivalence. */
  @IsOptional() @IsUUID() academicLevelId?: string;
  /** Motif de la décision ; obligatoire pour un expert professionnel validé Doctorat sans doctorat (E6). */
  @IsOptional() @IsString() @MaxLength(2000) academicLevelNote?: string;
}

export class ReviewDocumentDto {
  @IsIn(['APPROVED', 'REJECTED']) status!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(1000) rejectionReason?: string;
  /**
   * Obligatoire pour approuver un diplôme, relevé, certificat, certificat de scolarité ou preuve d'expérience :
   * approuver ce document = attester de son authenticité (spec §13, décision 4).
   */
  @IsOptional() @IsBoolean() confirmAuthenticity?: boolean;
}

export class SetAcademicLevelDto {
  @IsUUID() academicLevelId!: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class DegreeEquivalencesQueryDto {
  @IsOptional() @IsIn(['PENDING', 'VALIDATED', 'REJECTED']) status?: string;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
}

export class DegreeLookupQueryDto {
  @IsString() @MaxLength(300) degreeTitle!: string;
  @IsString() @MaxLength(100) country!: string;
  @IsOptional() @IsString() @MaxLength(200) specialty?: string;
}

export class DegreeDecisionDto {
  @IsIn(['PENDING', 'VALIDATED', 'REJECTED']) status!: 'PENDING' | 'VALIDATED' | 'REJECTED';
  /** Obligatoire si VALIDATED : BAC | LICENCE | MASTER | DOCTORAT. */
  @IsOptional() @IsIn(EQUIVALENT_DEGREES) equivalentDegree?: string;
  /** Obligatoire si VALIDATED : niveau de l'échelle académique retenu. */
  @IsOptional() @IsUUID() equivalentLevelId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CreateDegreeEquivalenceDto extends DegreeDecisionDto {
  @IsString() @MaxLength(300) degreeTitle!: string;
  @IsString() @MaxLength(100) country!: string;
  @IsOptional() @IsString() @MaxLength(200) specialty?: string;
}

export class ApplyDegreeEquivalenceDto {
  @IsUUID() degreeEquivalenceId!: string;
}
