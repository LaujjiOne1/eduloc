import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const SIX_DIGITS = /^\d{6}$/;

export class RegisterDto {
  @IsString() @MaxLength(100) firstName!: string;
  @IsString() @MaxLength(100) lastName!: string;
  @IsEmail() @MaxLength(255) email!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}

/** Code à 6 chiffres reçu par e-mail. */
export class VerifyEmailDto {
  @IsEmail() email!: string;
  @Matches(SIX_DIGITS, { message: 'code doit contenir 6 chiffres' }) code!: string;
}

export class ResendVerificationDto {
  @IsEmail() email!: string;
}

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

export class RefreshDto {
  @IsString() refreshToken!: string;
}

export class LogoutDto {
  @IsString() refreshToken!: string;
}

export class RequestPasswordResetDto {
  @IsEmail() email!: string;
}

export class ResetPasswordDto {
  @IsEmail() email!: string;
  @Matches(SIX_DIGITS, { message: 'code doit contenir 6 chiffres' }) code!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
}
