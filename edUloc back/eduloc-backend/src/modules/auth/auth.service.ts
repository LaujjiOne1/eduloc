import {
  ForbiddenException, Injectable, UnauthorizedException, UnprocessableEntityException,
} from '@nestjs/common';
import argon2 from 'argon2';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CryptoService } from '../../core/crypto/crypto.service';
import { RateLimitService } from '../../common/rate-limit.service';
import { TokensService } from './tokens.service';
import {
  LoginDto, RegisterDto, RequestPasswordResetDto, ResendVerificationDto, ResetPasswordDto, VerifyEmailDto,
} from './dto';

const VERIFICATION_TTL_MS = 60 * 60_000;
const PASSWORD_RESET_TTL_MS = 30 * 60_000;

interface SessionUser {
  id: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly tokens: TokensService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    const password = await argon2.hash(dto.password, { type: argon2.argon2id });

    if (existing) {
      // Compte jamais vérifié (inscription abandonnée) : on le reprend et on renvoie un code.
      // Sans danger : seul le propriétaire de la boîte mail peut le valider.
      if (existing.status !== 'PENDING_VERIFICATION' || existing.deletedAt) {
        throw new UnprocessableEntityException('EMAIL_TAKEN');
      }
      await this.prisma.user.update({
        where: { id: existing.id },
        data: { firstName: dto.firstName, lastName: dto.lastName, password, phone: dto.phone ?? null },
      });
      await this.issueVerificationCode(existing.id, email);
      return { id: existing.id, status: existing.status };
    }

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email,
        password,
        phone: dto.phone ?? null,
        status: 'PENDING_VERIFICATION',
      },
    });
    await this.issueVerificationCode(user.id, email);
    return { id: user.id, status: user.status };
  }

  /** Vérifie le code à 6 chiffres puis ouvre la session : l'utilisateur n'a pas à se reconnecter. */
  async verifyEmail(dto: VerifyEmailDto) {
    const email = dto.email.toLowerCase();
    await this.rateLimit.consume(`rl:verify:${email}`, 5, 900);
    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = !!user
      && !user.deletedAt
      && !!user.emailVerificationTokenHash
      && !!user.emailVerificationExpiresAt
      && user.emailVerificationExpiresAt > new Date()
      && this.crypto.safeEqual(user.emailVerificationTokenHash, this.crypto.emailCodeHash(email, dto.code));
    if (!valid || !user) throw new UnprocessableEntityException('VERIFICATION_INVALID');

    const verified = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        status: 'ACTIVE',
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
        lastLoginAt: new Date(),
      },
    });
    return this.openSession(verified);
  }

  async resendVerification(dto: ResendVerificationDto) {
    const email = dto.email.toLowerCase();
    await this.rateLimit.consume(`rl:resend:${email}`, 3, 3600);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && user.status === 'PENDING_VERIFICATION' && !user.deletedAt) {
      await this.issueVerificationCode(user.id, email);
    }
    return { ok: true }; // ne jamais révéler l'existence du compte
  }

  async login(dto: LoginDto, ip: string) {
    await this.rateLimit.consume(`rl:login:${ip}:${dto.email.toLowerCase()}`, 5, 900);
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !(await argon2.verify(user.password, dto.password).catch(() => false))) {
      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }
    if (user.deletedAt || user.status === 'SUSPENDED') throw new ForbiddenException('ACCOUNT_DISABLED');
    if (user.status === 'PENDING_VERIFICATION') throw new ForbiddenException('EMAIL_NOT_VERIFIED');
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.openSession(user);
  }

  async refresh(raw: string, userAgent?: string) {
    return this.tokens.rotate(raw, userAgent);
  }

  async logout(raw: string) {
    await this.tokens.revoke(raw);
    return { ok: true };
  }

  async requestPasswordReset(dto: RequestPasswordResetDto) {
    const email = dto.email.toLowerCase();
    await this.rateLimit.consume(`rl:pwreset:${email}`, 3, 3600);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && !user.deletedAt) {
      const code = this.crypto.generateEmailCode();
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: user.id },
          data: {
            passwordResetTokenHash: this.crypto.emailCodeHash(email, code),
            passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
          },
        }),
        this.prisma.outboxEvent.create({
          data: {
            aggregateType: 'user',
            aggregateId: user.id,
            eventType: 'user.password_reset_requested',
            recipientIds: [],
            payload: { email, code },
          },
        }),
      ]);
    }
    return { ok: true }; // ne jamais révéler l'existence du compte
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.toLowerCase();
    await this.rateLimit.consume(`rl:pwreset-confirm:${email}`, 5, 900);
    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = !!user
      && !!user.passwordResetTokenHash
      && !!user.passwordResetExpiresAt
      && user.passwordResetExpiresAt > new Date()
      && this.crypto.safeEqual(user.passwordResetTokenHash, this.crypto.emailCodeHash(email, dto.code));
    if (!valid || !user) throw new UnprocessableEntityException('RESET_INVALID');

    const password = await argon2.hash(dto.password, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { password, passwordResetTokenHash: null, passwordResetExpiresAt: null },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { ok: true };
  }

  /** Nouveau code de vérification + événement outbox (l'envoi d'e-mail est externe : relay). */
  private async issueVerificationCode(userId: string, email: string): Promise<void> {
    const code = this.crypto.generateEmailCode();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          emailVerificationTokenHash: this.crypto.emailCodeHash(email, code),
          emailVerificationExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
        },
      }),
      this.prisma.outboxEvent.create({
        data: {
          aggregateType: 'user',
          aggregateId: userId,
          eventType: 'user.verification_requested',
          recipientIds: [],
          payload: { email, code },
        },
      }),
    ]);
  }

  private async openSession(user: SessionUser) {
    const refresh = await this.tokens.issueRefreshToken(user.id);
    return {
      accessToken: this.tokens.accessToken(user.id, user.isAdmin),
      refreshToken: refresh.refreshToken,
      refreshExpiresAt: refresh.expiresAt,
      user: { id: user.id, firstName: user.firstName, lastName: user.lastName, isAdmin: user.isAdmin },
    };
  }
}
