import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateBeneficiaryDto {
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

export class UpdateBeneficiaryDto {
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
