import { Body, Controller, Headers, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import {
  LoginDto, LogoutDto, RefreshDto, RegisterDto,
  RequestPasswordResetDto, ResendVerificationDto, ResetPasswordDto, VerifyEmailDto,
} from './dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.service.register(dto);
  }

  @Public()
  @Post('verify-email')
  verify(@Body() dto: VerifyEmailDto) {
    return this.service.verifyEmail(dto);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(200)
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.service.resendVerification(dto);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.service.login(dto, ip);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Headers('user-agent') ua?: string) {
    return this.service.refresh(dto.refreshToken, ua);
  }

  @Post('logout')
  logout(@Body() dto: LogoutDto) {
    return this.service.logout(dto.refreshToken);
  }

  @Public()
  @Post('password/request')
  requestReset(@Body() dto: RequestPasswordResetDto) {
    return this.service.requestPasswordReset(dto);
  }

  @Public()
  @Post('password/reset')
  reset(@Body() dto: ResetPasswordDto) {
    return this.service.resetPassword(dto);
  }
}
