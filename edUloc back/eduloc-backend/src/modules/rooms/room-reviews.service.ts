import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { OutboxWriter } from '../../infrastructure/outbox/outbox-writer';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors/domain-errors';
import { bookableRoomWhere } from '../partners/domain/room-bookability';
import { CreateRoomReviewDto } from './room-reviews.dto';

type Tx = Prisma.TransactionClient;

export const ROOM_REVIEW_CRITERIA = ['cleanliness', 'safety', 'accessibility', 'equipment', 'punctuality', 'overall'] as const;
export type RoomReviewCriterion = (typeof ROOM_REVIEW_CRITERIA)[number];

interface ReviewRecord {
  id: string;
  bookingId: string;
  cleanliness: number; safety: number; accessibility: number; equipment: number; punctuality: number; overall: number;
  comment: string | null;
  partnerReply: string | null;
  repliedAt: Date | null;
  createdAt: Date;
  author: { id: string; firstName: string };
}

/** Vue publique : prénom de l'auteur et son rôle dans la séance uniquement (ni nom, ni identifiant de compte). */
const toPublicReview = (r: ReviewRecord, role: 'REQUESTER' | 'TUTOR') => ({
  id: r.id,
  authorFirstName: r.author.firstName,
  authorRole: role,
  ratings: {
    cleanliness: r.cleanliness, safety: r.safety, accessibility: r.accessibility,
    equipment: r.equipment, punctuality: r.punctuality, overall: r.overall,
  },
  comment: r.comment,
  partnerReply: r.partnerReply,
  repliedAt: r.repliedAt,
  createdAt: r.createdAt,
});

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Avis sur les salles partenaires. Un avis est LIÉ à une séance terminée tenue dans la salle et écrit par une personne
 * qui y a assisté (le Demandeur ou le Tuteur de la séance) : un seul avis par séance et par auteur. Le partenaire peut
 * répondre UNE fois ; l'administrateur peut masquer un avis (motif enregistré), ce qui le retire des moyennes.
 */
@Injectable()
export class RoomReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxWriter,
  ) {}

  async create(userId: string, dto: CreateRoomReviewDto) {
    return this.prisma.$transaction(async (tx: Tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: dto.bookingId },
        include: {
          tutorProfile: { select: { userId: true } },
          room: { select: { id: true, name: true, venue: { select: { managerId: true } } } },
        },
      });
      // Ni la séance d'un autre ni une séance inexistante : même réponse (aucune fuite d'existence).
      const role = !booking ? null : booking.requesterId === userId ? 'REQUESTER' : booking.tutorProfile.userId === userId ? 'TUTOR' : null;
      if (!booking || !role) throw new NotFoundError('BOOKING_NOT_FOUND');
      if (!booking.room) throw new UnprocessableError('ROOM_REVIEW_NOT_A_ROOM_BOOKING');
      if (booking.status !== 'COMPLETED') throw new UnprocessableError('BOOKING_NOT_COMPLETED');

      const author = { id: userId, firstName: (await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { firstName: true } })).firstName };
      const existing = await tx.roomReview.findUnique({ where: { bookingId_authorId: { bookingId: booking.id, authorId: userId } } });
      if (existing) return toPublicReview({ ...existing, author }, role);

      // Verrou de ligne sur la salle : agrégat recalculé sans course entre deux avis simultanés.
      await tx.$executeRaw`SELECT id FROM rooms WHERE id = ${booking.room.id} FOR UPDATE`;
      const review = await tx.roomReview.create({
        data: {
          bookingId: booking.id, roomId: booking.room.id, authorId: userId,
          cleanliness: dto.cleanliness, safety: dto.safety, accessibility: dto.accessibility,
          equipment: dto.equipment, punctuality: dto.punctuality, overall: dto.overall,
          comment: dto.comment?.trim() || null,
        },
      });
      await this.refreshAggregate(tx, booking.room.id);
      await this.outbox.write(tx, {
        aggregateType: 'roomReview',
        aggregateId: review.id,
        eventType: 'partner.room.review.created',
        recipientIds: [booking.room.venue.managerId],
        payload: { reviewId: review.id, roomId: booking.room.id, overall: dto.overall },
        pushTitle: 'Nouvel avis sur votre salle',
        pushBody: `« ${booking.room.name} » a reçu ${dto.overall}/5.`,
      });
      return toPublicReview({ ...review, author }, role);
    });
  }

  /** Avis visibles d'une salle réservable, plus la moyenne de chaque critère. Une salle non publique est « introuvable ». */
  async listPublic(roomId: string) {
    const room = await this.prisma.room.findFirst({ where: { id: roomId, ...bookableRoomWhere() }, select: { id: true, rating: true, reviewsCount: true } });
    if (!room) throw new NotFoundError('ROOM_NOT_FOUND');
    const reviews = await this.prisma.roomReview.findMany({
      where: { roomId, hiddenAt: null },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { id: true, firstName: true } }, booking: { select: { requesterId: true } } },
    });
    const averages = await this.criteriaAverages(this.prisma, roomId);
    return {
      rating: round1(room.rating),
      reviewsCount: room.reviewsCount,
      averages,
      reviews: reviews.map((r) => toPublicReview(r, r.booking.requesterId === r.authorId ? 'REQUESTER' : 'TUTOR')),
    };
  }

  /** Avis des salles du Gestionnaire (ceux à qui il n'a pas encore répondu d'abord). Jamais ceux d'une autre structure. */
  async listForManager(userId: string, roomId?: string) {
    const reviews = await this.prisma.roomReview.findMany({
      where: { hiddenAt: null, roomId, room: { venue: { managerId: userId } } },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        author: { select: { id: true, firstName: true } },
        booking: { select: { requesterId: true } },
        room: { select: { id: true, name: true } },
      },
    });
    const sorted = [...reviews].sort((a, b) => Number(a.partnerReply !== null) - Number(b.partnerReply !== null));
    return sorted.map((r) => ({
      ...toPublicReview(r, r.booking.requesterId === r.authorId ? 'REQUESTER' : 'TUTOR'),
      room: r.room,
      needsReply: r.partnerReply === null,
    }));
  }

  /** Réponse du partenaire : une seule, non modifiable. */
  async reply(userId: string, reviewId: string, text: string) {
    const body = text.trim();
    if (!body) throw new UnprocessableError('ROOM_REVIEW_REPLY_REQUIRED');
    const review = await this.prisma.roomReview.findFirst({
      where: { id: reviewId, room: { venue: { managerId: userId } } },
      select: { id: true, hiddenAt: true, partnerReply: true },
    });
    if (!review) throw new NotFoundError('ROOM_REVIEW_NOT_FOUND');
    if (review.hiddenAt) throw new UnprocessableError('ROOM_REVIEW_HIDDEN');
    // Conditionnel : deux réponses simultanées ne peuvent pas toutes les deux aboutir.
    const { count } = await this.prisma.roomReview.updateMany({
      where: { id: reviewId, partnerReply: null },
      data: { partnerReply: body, repliedAt: new Date() },
    });
    if (count !== 1) throw new ConflictError('ROOM_REVIEW_ALREADY_REPLIED');
    return { ok: true };
  }

  // ------------------------------------------------------------------ administration

  async listForAdmin(opts: { hidden?: boolean; roomId?: string; limit: number }) {
    const reviews = await this.prisma.roomReview.findMany({
      where: {
        roomId: opts.roomId,
        ...(opts.hidden === undefined ? {} : opts.hidden ? { hiddenAt: { not: null } } : { hiddenAt: null }),
      },
      orderBy: { createdAt: 'desc' },
      take: opts.limit,
      include: { author: { select: { id: true, firstName: true, lastName: true } }, room: { select: { id: true, name: true } } },
    });
    return reviews.map((r) => ({
      id: r.id, bookingId: r.bookingId, room: r.room, author: r.author, overall: r.overall, comment: r.comment,
      partnerReply: r.partnerReply, hiddenAt: r.hiddenAt, hiddenReason: r.hiddenReason, createdAt: r.createdAt,
    }));
  }

  /** Masque un avis frauduleux, offensant ou contenant des informations privées : motif obligatoire, moyenne recalculée. */
  async hide(adminId: string, reviewId: string, reason: string) {
    const why = reason.trim();
    if (why.length < 3) throw new UnprocessableError('REVIEW_HIDE_REASON_REQUIRED');
    await this.prisma.$transaction(async (tx: Tx) => {
      const review = await tx.roomReview.findUnique({ where: { id: reviewId }, select: { id: true, roomId: true } });
      if (!review) throw new NotFoundError('ROOM_REVIEW_NOT_FOUND');
      await tx.$executeRaw`SELECT id FROM rooms WHERE id = ${review.roomId} FOR UPDATE`;
      await tx.roomReview.update({ where: { id: reviewId }, data: { hiddenAt: new Date(), hiddenReason: why, hiddenById: adminId } });
      await this.refreshAggregate(tx, review.roomId);
    });
    return { ok: true };
  }

  async unhide(reviewId: string) {
    await this.prisma.$transaction(async (tx: Tx) => {
      const review = await tx.roomReview.findUnique({ where: { id: reviewId }, select: { id: true, roomId: true } });
      if (!review) throw new NotFoundError('ROOM_REVIEW_NOT_FOUND');
      await tx.$executeRaw`SELECT id FROM rooms WHERE id = ${review.roomId} FOR UPDATE`;
      await tx.roomReview.update({ where: { id: reviewId }, data: { hiddenAt: null, hiddenReason: null, hiddenById: null } });
      await this.refreshAggregate(tx, review.roomId);
    });
    return { ok: true };
  }

  // ------------------------------------------------------------------ agrégats

  private async refreshAggregate(tx: Tx, roomId: string): Promise<void> {
    const agg = await tx.roomReview.aggregate({ where: { roomId, hiddenAt: null }, _avg: { overall: true }, _count: true });
    await tx.room.update({ where: { id: roomId }, data: { rating: agg._avg.overall ?? 0, reviewsCount: agg._count } });
  }

  private async criteriaAverages(db: Pick<Tx, 'roomReview'>, roomId: string): Promise<Record<RoomReviewCriterion, number>> {
    const agg = await db.roomReview.aggregate({
      where: { roomId, hiddenAt: null },
      _avg: { cleanliness: true, safety: true, accessibility: true, equipment: true, punctuality: true, overall: true },
    });
    return Object.fromEntries(ROOM_REVIEW_CRITERIA.map((c) => [c, round1(agg._avg[c] ?? 0)])) as Record<RoomReviewCriterion, number>;
  }
}
