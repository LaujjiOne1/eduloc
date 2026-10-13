import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { ConflictType } from '../../generated/prisma/client';
import { OutboxWriter } from '../../infrastructure/outbox/outbox-writer';
import { CacheKeys, CacheService } from '../../infrastructure/cache/cache.service';
import { BookingsService } from '../bookings/bookings.service';
import { MessagesService } from '../communication/messages.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxWriter,
    private readonly cache: CacheService,
    private readonly bookingsService: BookingsService,
    private readonly messages: MessagesService,
  ) {}

  /** UC-G02 : indicateurs (cache 60 s). */
  dashboard() {
    return this.cache.wrap(CacheKeys.adminDashboard(), 60, async () => {
      const [
        requesters, tutors, offers, upcomingBookings, pendingBookings, pendingApplications,
      ] = await Promise.all([
        this.prisma.user.count({ where: { deletedAt: null, isAdmin: false } }),
        this.prisma.tutorProfile.count({ where: { isVisible: true } }),
        this.prisma.offer.count({ where: { isActive: true, disabledByAdminAt: null } }),
        this.prisma.booking.count({
          where: { status: { in: ['PENDING', 'CONFIRMED'] }, startAt: { gt: new Date() } },
        }),
        this.prisma.booking.count({ where: { status: 'PENDING' } }),
        this.prisma.tutorApplication.count({ where: { status: 'PENDING' } }),
      ]);
      return {
        requesters, tutors, offers, upcomingBookings, pendingBookings, pendingApplications,
      };
    });
  }

  users(q: { search?: string; status?: string; page: number }) {
    return this.prisma.user.findMany({
      where: {
        ...(q.search
          ? {
              OR: [
                { email: { contains: q.search, mode: 'insensitive' } },
                { firstName: { contains: q.search, mode: 'insensitive' } },
                { lastName: { contains: q.search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(q.status ? { status: q.status as never } : {}),
      },
      select: {
        id: true, firstName: true, lastName: true, email: true, status: true,
        isAdmin: true, lastLoginAt: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * 50,
      take: 50,
    });
  }

  async setUserStatus(userId: string, status: 'ACTIVE' | 'SUSPENDED') {
    await this.prisma.user.update({ where: { id: userId }, data: { status } });
    if (status === 'SUSPENDED') {
      await this.prisma.refreshToken.updateMany({
        where: { userId },
        data: { revokedAt: new Date() },
      });
    }
    return { ok: true };
  }

  tutorApplications(status?: string) {
    return this.prisma.tutorApplication.findMany({
      where: status ? { status: status as never } : {},
      include: {
        tutorProfile: {
          include: { user: { select: { firstName: true, lastName: true, email: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** UC-G05 : approbation + visibilité dans la MÊME transaction. */
  async approveApplication(adminId: string, applicationId: string) {
    await this.prisma.$transaction(async (tx) => {
      const app = await tx.tutorApplication.findUnique({ where: { id: applicationId } });
      if (!app) throw new NotFoundException('APPLICATION_NOT_FOUND');
      if (app.status !== 'PENDING') throw new UnprocessableEntityException('APPLICATION_NOT_PENDING');
      await tx.tutorApplication.update({
        where: { id: app.id },
        data: { status: 'APPROVED', reviewedAt: new Date(), reviewedById: adminId },
      });
      await tx.tutorProfile.update({
        where: { id: app.tutorProfileId },
        data: { isVisible: true, suspendedAt: null },
      });
      const tutor = await tx.tutorProfile.findUniqueOrThrow({
        where: { id: app.tutorProfileId },
        select: { userId: true },
      });
      // Les compétences ajoutées librement par ce tuteur entrent au catalogue avec son dossier.
      await tx.subject.updateMany({
        where: { isVerified: false, createdById: tutor.userId, tutorSubjects: { some: { tutorProfileId: app.tutorProfileId } } },
        data: { isVerified: true },
      });
      await this.outbox.write(tx, {
        aggregateType: 'tutorApplication',
        aggregateId: app.id,
        eventType: 'tutor.application.approved',
        recipientIds: [tutor.userId],
        payload: { applicationId: app.id },
        pushTitle: 'Dossier approuvé',
        pushBody: 'Vous êtes visible dans la recherche.',
        cacheKeys: [CacheKeys.tutorPublic(app.tutorProfileId), CacheKeys.subjects()],
      });
    });
    // Le tuteur doit apparaître tout de suite dans la recherche (résultats mis en cache 90 s),
    // et ses compétences libres dans le catalogue (l'outbox n'invalide qu'avec un délai).
    await this.cache.invalidate(CacheKeys.subjects());
    await this.cache.bumpSearch();
    return { ok: true };
  }

  async rejectApplication(adminId: string, applicationId: string, reason?: string) {
    const app = await this.prisma.tutorApplication.findUnique({ where: { id: applicationId } });
    if (!app) throw new NotFoundException('APPLICATION_NOT_FOUND');
    if (app.status !== 'PENDING') throw new UnprocessableEntityException('APPLICATION_NOT_PENDING');
    await this.prisma.tutorApplication.update({
      where: { id: app.id },
      data: {
        status: 'REJECTED',
        reviewedAt: new Date(),
        reviewedById: adminId,
        rejectionReason: reason ?? null,
      },
    });
    const tutor = await this.prisma.tutorProfile.findUniqueOrThrow({
      where: { id: app.tutorProfileId },
      select: { userId: true },
    });
    await this.prisma.outboxEvent.create({
      data: {
        aggregateType: 'tutorApplication',
        aggregateId: app.id,
        eventType: 'tutor.application.rejected',
        recipientIds: [tutor.userId],
        payload: { applicationId: app.id, reason: reason ?? null },
        pushTitle: 'Dossier rejeté',
        pushBody: reason ?? 'Votre dossier a été rejeté.',
      },
    });
    return { ok: true };
  }

  /** UC-G07 : suspension + conflits sur les réservations futures (UC-G10). */
  async suspendTutor(adminId: string, tutorProfileId: string, reason?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const tp = await tx.tutorProfile.findUnique({ where: { id: tutorProfileId } });
      if (!tp) throw new NotFoundException('TUTOR_NOT_FOUND');
      await tx.tutorProfile.update({
        where: { id: tutorProfileId },
        data: { isVisible: false, suspendedAt: new Date() },
      });
      const future = await tx.booking.findMany({
        where: {
          tutorProfileId,
          status: { in: ['PENDING', 'CONFIRMED'] },
          startAt: { gt: new Date() },
        },
      });
      for (const b of future) {
        await tx.conflict.upsert({
          where: { bookingId_type: { bookingId: b.id, type: 'TUTOR_SUSPENDED' } },
          update: {},
          create: {
            type: 'TUTOR_SUSPENDED',
            bookingId: b.id,
            details: { reason: reason ?? null, by: adminId },
          } as never,
        });
      }
      await this.outbox.write(tx, {
        aggregateType: 'tutor',
        aggregateId: tutorProfileId,
        eventType: 'tutor.suspended',
        recipientIds: [tp.userId],
        payload: { tutorProfileId, reason: reason ?? null, affectedBookings: future.length },
        pushTitle: 'Compte suspendu',
        pushBody: 'Votre profil tuteur a été suspendu.',
        cacheKeys: [CacheKeys.tutorPublic(tutorProfileId)],
      });
      return { ok: true, affectedBookings: future.length };
    });
    await this.cache.bumpSearch();
    return result;
  }

  /** UC-G08 : retrait d'offre par l'admin — le tuteur ne peut pas réactiver. */
  async moderateOffer(offerId: string, action: 'disable' | 'enable') {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('OFFER_NOT_FOUND');
    if (action === 'disable') {
      await this.prisma.offer.update({
        where: { id: offerId },
        data: { isActive: false, disabledByAdminAt: new Date() },
      });
    } else {
      await this.prisma.offer.update({
        where: { id: offerId },
        data: { disabledByAdminAt: null, isActive: true },
      });
    }
    await this.cache.bumpSearch();
    return { ok: true };
  }

  bookings(status?: string, page = 1) {
    return this.prisma.booking.findMany({
      where: status ? { status: status as never } : {},
      orderBy: { startAt: 'desc' },
      skip: (page - 1) * 50,
      take: 50,
    });
  }

  conflicts(status?: string) {
    return this.prisma.conflict.findMany({
      where: status ? { status: status as never } : {},
      include: {
        booking: true,
        resolvedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async resolveConflict(adminId: string, id: string, resolution: string) {
    await this.prisma.conflict.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedById: adminId,
        resolution,
        resolvedAt: new Date(),
      },
    });
    return { ok: true };
  }

  async dismissConflict(adminId: string, id: string) {
    await this.prisma.conflict.update({
      where: { id },
      data: { status: 'DISMISSED', resolvedById: adminId, resolvedAt: new Date() },
    });
    return { ok: true };
  }

  /** UC-G10 : détection planifiée des conflits (toutes les 15 min). */
  @Cron('*/15 * * * *')
  async detectConflicts(): Promise<void> {
    const now = new Date();
    const candidates: { type: ConflictType; id: string }[] = [];

    const inactiveOffers = await this.prisma.booking.findMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        startAt: { gt: now },
        offer: { isActive: false },
      },
      select: { id: true },
    });
    for (const b of inactiveOffers) candidates.push({ type: 'OFFER_INACTIVE', id: b.id });

    const removedAvail = await this.prisma.booking.findMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        startAt: { gt: now },
        availability: { is: { isActive: false } },
      },
      select: { id: true },
    });
    for (const b of removedAvail) candidates.push({ type: 'AVAILABILITY_REMOVED', id: b.id });

    const suspended = await this.prisma.booking.findMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        startAt: { gt: now },
        tutorProfile: { suspendedAt: { not: null } },
      },
      select: { id: true },
    });
    for (const b of suspended) candidates.push({ type: 'TUTOR_SUSPENDED', id: b.id });

    for (const c of candidates) {
      await this.prisma.conflict.upsert({
        where: { bookingId_type: { bookingId: c.id, type: c.type } },
        update: {},
        create: { type: c.type, bookingId: c.id } as never,
      });
    }
    this.logger.log(`Détection des conflits : ${candidates.length} conflit(s) détecté(s).`);
  }

  /** Clôture automatique des séances IN_PROGRESS restées ouvertes 3 h après endAt. */
  @Cron('*/10 * * * *')
  async autoCloseSessions(): Promise<void> {
    const n = await this.bookingsService.autoCompleteStaleSessions();
    if (n > 0) this.logger.log(`${n} séance(s) auto-clôturée(s).`);
  }

  /** Rétention des médias : purge 12 mois après la fin de séance (décision attachment). */
  @Cron('0 3 * * *')
  async mediaCleanup(): Promise<void> {
    const n = await this.messages.cleanupExpiredMedia();
    if (n > 0) this.logger.log(`${n} média(s) expiré(s) purgé(s).`);
  }
}
