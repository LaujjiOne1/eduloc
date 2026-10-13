import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { OutboxWriter } from '../../infrastructure/outbox/outbox-writer';
import { CacheKeys } from '../../infrastructure/cache/cache.service';
import { CreateReviewDto } from './dto';

interface ReviewRow {
  id: string;
  bookingId: string;
  rating: number;
  text: string | null;
  officialReply: string | null;
  repliedAt: Date | null;
  createdAt: Date;
}

/** Vue publique d'un avis : prénom de l'auteur uniquement (ni nom, ni identifiant de compte). */
const toReviewResponse = (review: ReviewRow, authorFirstName: string) => ({
  id: review.id,
  bookingId: review.bookingId,
  rating: review.rating,
  text: review.text,
  authorFirstName,
  officialReply: review.officialReply,
  repliedAt: review.repliedAt,
  createdAt: review.createdAt,
});

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxWriter,
  ) {}

  async create(requesterId: string, dto: CreateReviewDto) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { id: dto.bookingId, requesterId },
        include: {
          tutorProfile: { select: { userId: true } },
          requester: { select: { firstName: true } },
        },
      });
      if (!booking) throw new NotFoundException('BOOKING_NOT_FOUND');
      if (booking.status !== 'COMPLETED') throw new UnprocessableEntityException('BOOKING_NOT_COMPLETED');
      const authorFirstName = booking.requester.firstName;
      const existing = await tx.review.findUnique({ where: { bookingId: dto.bookingId } });
      if (existing) return toReviewResponse(existing, authorFirstName);

      // Verrou de ligne sur le profil tuteur : agrégat recalculé sans race.
      await tx.$executeRaw`SELECT id FROM tutor_profiles WHERE id = ${booking.tutorProfileId} FOR UPDATE`;
      const review = await tx.review.create({
        data: {
          bookingId: dto.bookingId,
          tutorProfileId: booking.tutorProfileId,
          requesterId,
          rating: dto.rating,
          text: dto.text?.trim() || null,
        },
      });
      const agg = await tx.review.aggregate({
        where: { tutorProfileId: booking.tutorProfileId, hiddenAt: null },
        _avg: { rating: true },
        _count: true,
      });
      await tx.tutorProfile.update({
        where: { id: booking.tutorProfileId },
        data: { rating: agg._avg.rating ?? 0, reviewsCount: agg._count },
      });
      await this.outbox.write(tx, {
        aggregateType: 'review',
        aggregateId: review.id,
        eventType: 'review.created',
        recipientIds: [booking.tutorProfile.userId],
        payload: { reviewId: review.id, bookingId: dto.bookingId, rating: dto.rating },
        pushTitle: 'Nouvel avis',
        pushBody: `Un demandeur vous a attribué ${dto.rating}/5.`,
        cacheKeys: [CacheKeys.tutorPublic(booking.tutorProfileId)],
      });
      return toReviewResponse(review, authorFirstName);
    });
  }

  async tutorReviews(tutorProfileId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { tutorProfileId, hiddenAt: null },
      orderBy: { createdAt: 'desc' },
      include: { requester: { select: { firstName: true } } },
    });
    return reviews.map((review) => toReviewResponse(review, review.requester.firstName));
  }
}
