import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { PartnerPlan, VenueSubscription } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { OutboxWriter } from '../../infrastructure/outbox/outbox-writer';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors/domain-errors';
import { PlanDto, UpdatePlanDto } from './dto';
import { Tx, recordStatus } from './partner-support';

type SubscriptionWithPlan = VenueSubscription & { plan: PartnerPlan };

export const planResponse = (p: PartnerPlan) => ({
  id: p.id, code: p.code, name: p.name, description: p.description,
  price: { amount: p.priceAmount.toString(), currency: p.currency }, durationDays: p.durationDays, isActive: p.isActive,
});

/**
 * Statut de souscription exposé : « NOT_SELECTED » sans ligne, et une souscription ACTIVE dont la date de fin est passée
 * compte déjà comme EXPIRED (la salle cesse d'être réservable à la seconde près, sans attendre le job de nettoyage).
 */
export function effectiveSubscription(sub: SubscriptionWithPlan | null, now: Date) {
  if (!sub) return { status: 'NOT_SELECTED' as const, plan: null, startsAt: null, endsAt: null };
  const expired = sub.status === 'ACTIVE' && sub.endsAt !== null && sub.endsAt <= now;
  return {
    id: sub.id,
    status: expired ? ('EXPIRED' as const) : sub.status,
    plan: planResponse(sub.plan),
    startsAt: sub.startsAt,
    endsAt: sub.endsAt,
  };
}

/**
 * Offre commerciale (spec 8.4). Décision de modélisation : la souscription couvre la STRUCTURE et donc toutes ses salles ;
 * prix, durée et renouvellement sont des données du catalogue PartnerPlan, jamais du code. Pas de paiement en ligne
 * (hors périmètre) : un plan gratuit s'active immédiatement, un plan payant attend l'activation par un administrateur.
 */
@Injectable()
export class PartnerSubscriptionService {
  private readonly logger = new Logger(PartnerSubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxWriter,
  ) {}

  async listPlans() {
    const plans = await this.prisma.partnerPlan.findMany({ where: { isActive: true }, orderBy: { priceAmount: 'asc' } });
    return plans.map(planResponse);
  }

  async current(userId: string) {
    const venue = await this.prisma.partnerVenue.findUnique({
      where: { managerId: userId },
      include: { subscriptions: { orderBy: { createdAt: 'desc' }, take: 1, include: { plan: true } } },
    });
    if (!venue) throw new NotFoundError('VENUE_NOT_FOUND');
    return effectiveSubscription(venue.subscriptions[0] ?? null, new Date());
  }

  /** Le Gestionnaire choisit une offre après la validation d'au moins une salle (spec 8.2 étape 11). */
  async select(userId: string, planId: string) {
    const venue = await this.prisma.partnerVenue.findUnique({ where: { managerId: userId } });
    if (!venue) throw new NotFoundError('VENUE_NOT_FOUND');
    if (venue.status !== 'APPROVED') throw new UnprocessableError('VENUE_NOT_APPROVED');
    const approvedRooms = await this.prisma.room.count({ where: { venueId: venue.id, status: 'APPROVED' } });
    if (approvedRooms < 1) throw new UnprocessableError('ROOM_APPROVAL_REQUIRED');
    const plan = await this.prisma.partnerPlan.findFirst({ where: { id: planId, isActive: true } });
    if (!plan) throw new NotFoundError('PLAN_NOT_FOUND');

    await this.prisma.$transaction(async (tx: Tx) => {
      const open = await tx.venueSubscription.findFirst({
        where: { venueId: venue.id, status: { in: ['PENDING', 'ACTIVE'] } },
      });
      if (open && !(open.status === 'ACTIVE' && open.endsAt && open.endsAt <= new Date())) {
        throw new ConflictError('SUBSCRIPTION_ALREADY_OPEN');
      }
      if (open) await tx.venueSubscription.update({ where: { id: open.id }, data: { status: 'EXPIRED' } });
      const free = plan.priceAmount.isZero();
      const startsAt = free ? new Date() : null;
      const created = await tx.venueSubscription.create({
        data: {
          venueId: venue.id,
          planId: plan.id,
          status: free ? 'ACTIVE' : 'PENDING',
          startsAt,
          endsAt: startsAt ? new Date(startsAt.getTime() + plan.durationDays * 86_400_000) : null,
        },
      });
      await recordStatus(tx, { venueId: venue.id, scope: 'SUBSCRIPTION', from: open?.status ?? 'NOT_SELECTED', to: created.status, actorUserId: userId, note: plan.code });
    });
    return this.current(userId);
  }

  async cancel(userId: string) {
    const venue = await this.prisma.partnerVenue.findUnique({ where: { managerId: userId } });
    if (!venue) throw new NotFoundError('VENUE_NOT_FOUND');
    await this.prisma.$transaction(async (tx: Tx) => {
      const open = await tx.venueSubscription.findFirst({
        where: { venueId: venue.id, status: { in: ['PENDING', 'ACTIVE'] } },
      });
      if (!open) throw new NotFoundError('SUBSCRIPTION_NOT_FOUND');
      await tx.venueSubscription.update({ where: { id: open.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      await recordStatus(tx, { venueId: venue.id, scope: 'SUBSCRIPTION', from: open.status, to: 'CANCELLED', actorUserId: userId });
    });
    return this.current(userId);
  }

  // ------------------------------------------------------------------ administration

  /** Active une souscription PENDING (paiement hors ligne constaté) : démarre sa durée. */
  async activate(adminId: string, venueId: string) {
    await this.prisma.$transaction(async (tx: Tx) => {
      const venue = await tx.partnerVenue.findUnique({ where: { id: venueId } });
      if (!venue) throw new NotFoundError('VENUE_NOT_FOUND');
      const pending = await tx.venueSubscription.findFirst({
        where: { venueId, status: 'PENDING' }, include: { plan: true },
      });
      if (!pending) throw new NotFoundError('SUBSCRIPTION_NOT_FOUND');
      const startsAt = new Date();
      await tx.venueSubscription.update({
        where: { id: pending.id },
        data: { status: 'ACTIVE', startsAt, endsAt: new Date(startsAt.getTime() + pending.plan.durationDays * 86_400_000) },
      });
      await recordStatus(tx, { venueId, scope: 'SUBSCRIPTION', from: 'PENDING', to: 'ACTIVE', actorUserId: adminId });
      await this.outbox.write(tx, {
        aggregateType: 'partnerVenue', aggregateId: venueId, eventType: 'partner.subscription.updated',
        recipientIds: [venue.managerId], payload: { venueId, status: 'ACTIVE' },
        pushTitle: 'Offre activée', pushBody: 'Votre offre commerciale est active : vos salles validées peuvent être publiées.',
      });
    });
    return { ok: true };
  }

  async cancelByAdmin(adminId: string, venueId: string, note?: string) {
    await this.prisma.$transaction(async (tx: Tx) => {
      const venue = await tx.partnerVenue.findUnique({ where: { id: venueId } });
      if (!venue) throw new NotFoundError('VENUE_NOT_FOUND');
      const open = await tx.venueSubscription.findFirst({ where: { venueId, status: { in: ['PENDING', 'ACTIVE'] } } });
      if (!open) throw new NotFoundError('SUBSCRIPTION_NOT_FOUND');
      await tx.venueSubscription.update({ where: { id: open.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      await recordStatus(tx, { venueId, scope: 'SUBSCRIPTION', from: open.status, to: 'CANCELLED', actorUserId: adminId, note });
      await this.outbox.write(tx, {
        aggregateType: 'partnerVenue', aggregateId: venueId, eventType: 'partner.subscription.updated',
        recipientIds: [venue.managerId], payload: { venueId, status: 'CANCELLED' },
        pushTitle: 'Offre annulée', pushBody: 'Votre offre commerciale a été annulée : vos salles ne sont plus réservables.',
      });
    });
    return { ok: true };
  }

  async createPlan(dto: PlanDto) {
    const plan = await this.prisma.partnerPlan.create({ data: { ...dto } });
    return planResponse(plan);
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    const plan = await this.prisma.partnerPlan.update({ where: { id }, data: { ...dto } }).catch(() => null);
    if (!plan) throw new NotFoundError('PLAN_NOT_FOUND');
    return planResponse(plan);
  }

  async listAllPlans() {
    return (await this.prisma.partnerPlan.findMany({ orderBy: { createdAt: 'asc' } })).map(planResponse);
  }

  /**
   * Nettoyage : les souscriptions ACTIVE arrivées à échéance passent EXPIRED. Les salles cessent d'être réservables
   * dès l'échéance (bookableRoomWhere) ; les séances DÉJÀ confirmées ne sont jamais annulées silencieusement.
   */
  @Cron('0 */15 * * * *')
  async expireDue(): Promise<number> {
    const due = await this.prisma.venueSubscription.findMany({
      where: { status: 'ACTIVE', endsAt: { lte: new Date() } },
      include: { venue: { select: { managerId: true } } },
    });
    for (const sub of due) {
      try {
        await this.prisma.$transaction(async (tx: Tx) => {
          const { count } = await tx.venueSubscription.updateMany({ where: { id: sub.id, status: 'ACTIVE' }, data: { status: 'EXPIRED' } });
          if (count !== 1) return;
          await recordStatus(tx, { venueId: sub.venueId, scope: 'SUBSCRIPTION', from: 'ACTIVE', to: 'EXPIRED' });
          await this.outbox.write(tx, {
            aggregateType: 'partnerVenue', aggregateId: sub.venueId, eventType: 'partner.subscription.updated',
            recipientIds: [sub.venue.managerId], payload: { venueId: sub.venueId, status: 'EXPIRED' },
            pushTitle: 'Offre expirée', pushBody: 'Votre offre commerciale a expiré : vos salles ne sont plus réservables. Les séances confirmées sont maintenues.',
          });
        });
      } catch (err) {
        this.logger.warn(`Expiration de la souscription ${sub.id} impossible : ${(err as Error).message}`);
      }
    }
    return due.length;
  }
}
