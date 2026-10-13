import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { UpdateMeDto } from './dto';

const meInclude = {
  tutorProfile: {
    select: {
      id: true,
      isVisible: true,
      suspendedAt: true,
      applications: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { status: true } },
    },
  },
  beneficiaries: {
    where: { relationship: 'SELF' as const, archivedAt: null },
    select: { id: true },
    take: 1,
  },
} satisfies Prisma.UserInclude;

type MeRecord = Prisma.UserGetPayload<{ include: typeof meInclude }>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Profil du compte connecté : identité + rôle tuteur éventuel (jamais de secret). */
  async me(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, include: meInclude });
    if (!u) throw new NotFoundException('USER_NOT_FOUND');
    return this.toResponse(u);
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    await this.prisma.user.update({ where: { id: userId }, data: dto });
    return this.me(userId);
  }

  async softDelete(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(), status: 'SUSPENDED' as never },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  private toResponse(u: MeRecord) {
    const profile = u.tutorProfile;
    return {
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phone: u.phone,
      avatar: u.avatar,
      language: u.language,
      timezone: u.timezone,
      status: u.status,
      emailVerified: u.emailVerified,
      isAdmin: u.isAdmin,
      lessonAlarm: { enabled: u.lessonAlarmEnabled, leadMinutes: u.lessonAlarmLeadMinutes },
      selfBeneficiaryId: u.beneficiaries[0]?.id ?? null,
      tutor: profile
        ? {
            tutorProfileId: profile.id,
            applicationStatus: profile.applications[0]?.status ?? 'DRAFT',
            isVisible: profile.isVisible,
            isSuspended: profile.suspendedAt !== null,
          }
        : null,
    };
  }
}
