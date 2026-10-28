import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { ConflictType } from '../../generated/prisma/client';
import { OutboxWriter } from '../../infrastructure/outbox/outbox-writer';
import { CacheKeys, CacheService } from '../../infrastructure/cache/cache.service';
import { BookingsService } from '../bookings/bookings.service';
import { MessagesService } from '../communication/messages.service';
import { enqueueTutorReindex } from '../matching/indexing/reindex-events';
import { AUTHENTICITY_CHECKED_TYPES, approvalMeaning } from '../matching/indexing/document-labels';
import { AcademicLevelService } from './academic-level.service';
import { DegreeEquivalencesService, equivalenceKey } from './degree-equivalences.service';
import type { ApproveApplicationDto, ReviewDocumentDto } from './dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxWriter,
    private readonly cache: CacheService,
    private readonly bookingsService: BookingsService,
    private readonly messages: MessagesService,
    private readonly equivalences: DegreeEquivalencesService,
    private readonly academicLevels: AcademicLevelService,
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

  async tutorApplications(status?: string) {
    const applications = await this.prisma.tutorApplication.findMany({
      where: status ? { status: status as never } : {},
      include: {
        // Métadonnées seulement : jamais le texte extrait ni le pré-contrôle d'un document.
        documents: {
          select: {
            id: true, type: true, status: true, fileName: true, mimeType: true, uploadedAt: true,
            extractionStatus: true, autoCheck: true, reviewedAt: true, rejectionReason: true,
          },
          orderBy: { uploadedAt: 'asc' },
        },
        tutorProfile: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } },
            academicLevel: { select: { id: true, name: true, category: true, academicRank: true } },
            degreeEquivalence: true,
            experiences: { orderBy: { createdAt: 'asc' } },
            subjects: {
              include: { subject: { select: { name: true } }, educationLevel: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    // Revue d'un diplôme OTHER : l'équivalence déjà tranchée pour ce diplôme est proposée à l'admin.
    const others = applications.filter((a) =>
      a.tutorProfile.highestDegree === 'OTHER' && a.tutorProfile.degreeTitle && a.tutorProfile.degreeCountry);
    const keyOf = (a: (typeof applications)[number]) => equivalenceKey({
      degreeTitle: a.tutorProfile.degreeTitle!,
      country: a.tutorProfile.degreeCountry!,
      specialty: a.tutorProfile.fieldOfStudy,
    });
    const matches = others.length
      ? await this.equivalences.matchAll(this.prisma, others.map((a) => ({
          degreeTitle: a.tutorProfile.degreeTitle!,
          country: a.tutorProfile.degreeCountry!,
          specialty: a.tutorProfile.fieldOfStudy,
        })))
      : new Map();
    return applications.map((a) => ({
      ...a,
      documents: a.documents.map((d) => ({ ...d, approvalMeaning: approvalMeaning(d.type) })),
      degreeEquivalenceSuggestion: others.includes(a) ? matches.get(keyOf(a)) ?? null : null,
    }));
  }

  /**
   * Revue d'un justificatif. Approuver un document dont l'authenticité est contrôlée (diplôme, relevé, certificat,
   * preuve d'expérience) exige une confirmation explicite : le libellé « vérifié » montré au Demandeur n'a de sens
   * que si un humain a réellement contrôlé l'élément. Le tuteur est réindexé (le document entre dans l'index, ou en sort).
   */
  async reviewDocument(documentId: string, dto: ReviewDocumentDto) {
    const doc = await this.prisma.tutorDocument.findUnique({
      where: { id: documentId },
      select: { id: true, type: true, tutorApplication: { select: { tutorProfileId: true } } },
    });
    if (!doc) throw new NotFoundException('DOCUMENT_NOT_FOUND');
    if (dto.status === 'APPROVED' && AUTHENTICITY_CHECKED_TYPES.has(doc.type) && dto.confirmAuthenticity !== true) {
      throw new UnprocessableEntityException('AUTHENTICITY_CONFIRMATION_REQUIRED');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.tutorDocument.update({
        where: { id: doc.id },
        data: {
          status: dto.status,
          reviewedAt: new Date(),
          rejectionReason: dto.status === 'REJECTED' ? dto.rejectionReason?.trim() || null : null,
        },
      });
      await enqueueTutorReindex(tx, doc.tutorApplication.tutorProfileId);
    });
    return { ok: true, status: dto.status };
  }

  /**
   * Demande la réindexation sémantique d'un tuteur approuvé, ou de TOUS (premier déploiement, tuteurs approuvés avant
   * l'indexation). Le calcul des embeddings se fait en tâche de fond (outbox), jamais dans cette requête.
   */
  async requestReindex(tutorProfileId?: string) {
    const tutors = await this.prisma.tutorProfile.findMany({
      where: { ...(tutorProfileId ? { id: tutorProfileId } : {}), applications: { some: { status: 'APPROVED' } } },
      select: { id: true },
    });
    if (tutorProfileId && tutors.length === 0) throw new NotFoundException('TUTOR_NOT_FOUND');
    await this.prisma.$transaction(async (tx) => {
      for (const tutor of tutors) await enqueueTutorReindex(tx, tutor.id);
    });
    return { queued: tutors.length };
  }

  /** UC-G05 : approbation + visibilité dans la MÊME transaction. */
  async approveApplication(adminId: string, applicationId: string, decision: ApproveApplicationDto = {}) {
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
      // E3/E9 : l'équivalence appliquée alimente d'abord le niveau académique ; le niveau choisi explicitement
      // par l'admin prime. Sans l'un ni l'autre, le niveau validé reste inchangé (donc absent pour un nouveau tuteur).
      if (decision.degreeEquivalenceId) {
        await this.equivalences.applyInTx(tx, adminId, app.tutorProfileId, decision.degreeEquivalenceId);
      }
      if (decision.academicLevelId) {
        await this.academicLevels.validateInTx(
          tx, adminId, app.tutorProfileId, decision.academicLevelId, decision.academicLevelNote,
        );
      }
      const tutor = await tx.tutorProfile.findUniqueOrThrow({
        where: { id: app.tutorProfileId },
        select: { userId: true },
      });
      // Les compétences ajoutées librement par ce tuteur entrent au catalogue avec son dossier.
      await tx.subject.updateMany({
        where: { isVerified: false, createdById: tutor.userId, tutorSubjects: { some: { tutorProfileId: app.tutorProfileId } } },
        data: { isVerified: true },
      });
      // Dossier approuvé : réindexation complète du tuteur (calculée hors requête, par l'outbox).
      await enqueueTutorReindex(tx, app.tutorProfileId);
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

  /**
   * Levée de suspension : le profil redevient visible (dossier APPROVED requis). Les conflits TUTOR_SUSPENDED encore
   * ouverts n'ont plus de cause : ils sont classés. Les autres conflits (offre retirée, salle…) restent à traiter.
   */
  async reinstateTutor(adminId: string, tutorProfileId: string, note?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const tp = await tx.tutorProfile.findUnique({
        where: { id: tutorProfileId },
        select: { userId: true, suspendedAt: true, applications: { where: { status: 'APPROVED' }, select: { id: true }, take: 1 } },
      });
      if (!tp) throw new NotFoundException('TUTOR_NOT_FOUND');
      if (!tp.suspendedAt) throw new UnprocessableEntityException('TUTOR_NOT_SUSPENDED');
      if (tp.applications.length === 0) throw new UnprocessableEntityException('TUTOR_APPLICATION_NOT_APPROVED');
      await tx.tutorProfile.update({ where: { id: tutorProfileId }, data: { isVisible: true, suspendedAt: null } });
      const dismissed = await tx.conflict.updateMany({
        where: { type: 'TUTOR_SUSPENDED', status: 'OPEN', booking: { tutorProfileId } },
        data: {
          status: 'DISMISSED', resolvedById: adminId, resolvedAt: new Date(),
          resolution: note?.trim() ? `Suspension levée : ${note.trim()}` : 'Suspension levée',
        },
      });
      await enqueueTutorReindex(tx, tutorProfileId);
      await this.outbox.write(tx, {
        aggregateType: 'tutor',
        aggregateId: tutorProfileId,
        eventType: 'tutor.reinstated',
        recipientIds: [tp.userId],
        payload: { tutorProfileId },
        pushTitle: 'Compte rétabli',
        pushBody: 'Votre profil tuteur est de nouveau visible.',
        cacheKeys: [CacheKeys.tutorPublic(tutorProfileId)],
      });
      return { ok: true, dismissedConflicts: dismissed.count };
    });
    await this.cache.bumpSearch();
    return result;
  }

  /** UC-G08 : retrait d'offre par l'admin — le tuteur ne peut pas réactiver. */
  async moderateOffer(offerId: string, action: 'disable' | 'enable') {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('OFFER_NOT_FOUND');
    await this.prisma.$transaction(async (tx) => {
      await tx.offer.update({
        where: { id: offerId },
        data: action === 'disable' ? { isActive: false, disabledByAdminAt: new Date() } : { disabledByAdminAt: null, isActive: true },
      });
      await enqueueTutorReindex(tx, offer.tutorProfileId); // son chunk OFFER apparaît ou disparaît
    });
    await this.cache.bumpSearch();
    return { ok: true };
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
