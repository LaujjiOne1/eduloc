import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, unreadOnly: boolean) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async unreadCount(userId: string) {
    return { count: await this.prisma.notification.count({ where: { userId, isRead: false } }) };
  }

  async markRead(userId: string, id?: string) {
    await this.prisma.notification.updateMany({
      where: { userId, ...(id ? { id } : {}), isRead: false },
      data: { isRead: true },
    });
    return { ok: true };
  }

  /** Déconnexion : seul le propriétaire du jeton peut le retirer. */
  async unregisterDevice(userId: string, token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
    return { ok: true };
  }

  async registerDevice(userId: string, token: string, platform: string) {
    await this.prisma.deviceToken.upsert({
      where: { token },
      update: { userId, platform: platform as never, lastSeenAt: new Date() },
      create: { userId, token, platform: platform as never },
    });
    return { ok: true };
  }
}
