import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const LESSON_ALARM_LEADS = [10, 15, 30, 60] as const;

export class UpdateMeDto {
  @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(20) language?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional() @IsString() @MaxLength(512) avatar?: string;
  /** Alarme de cours : activée ou non, et combien de minutes avant la séance. */
  @IsOptional() @IsBoolean() lessonAlarmEnabled?: boolean;
  @IsOptional() @IsIn(LESSON_ALARM_LEADS as unknown as number[]) lessonAlarmLeadMinutes?: number;
}
