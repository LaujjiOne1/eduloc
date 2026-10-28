import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { BusyInterval, locationKeyOf } from './domain/margin-policy';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class BookingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async lockTutor(tx: Tx, tutorProfileId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tutorProfileId}::text))`;
  }

  findBookableOffer(tx: Tx, offerId: string) {
    return tx.offer.findFirst({
      where: {
        id: offerId,
        isActive: true,
        disabledByAdminAt: null,
        tutorProfile: { isVisible: true, suspendedAt: null },
      },
      include: { tutorProfile: true },
    });
  }

  async blockingOverlap(tx: Tx, tutorProfileId: string, startAt: Date, endAt: Date, excludeId?: string) {
    return tx.booking.findFirst({
      where: {
        tutorProfileId,
        id: excludeId ? { not: excludeId } : undefined,
        status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    });
  }

  /**
   * Séances CONFIRMED / IN_PROGRESS du Tuteur dans [startAt - windowMinutes, endAt + windowMinutes] avec leur lieu,
   * pour appliquer les marges (MarginPolicy). Les PENDING ne comptent pas : aucun blocage temporaire.
   */
  async tutorNeighbours(
    tx: Tx, tutorProfileId: string, startAt: Date, endAt: Date, windowMinutes: number, excludeId?: string,
  ): Promise<BusyInterval[]> {
    const rows = await tx.booking.findMany({
      where: {
        tutorProfileId,
        id: excludeId ? { not: excludeId } : undefined,
        status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
        startAt: { lt: new Date(endAt.getTime() + windowMinutes * 60_000) },
        endAt: { gt: new Date(startAt.getTime() - windowMinutes * 60_000) },
      },
      select: { startAt: true, endAt: true, teachingMode: true, roomId: true, placeId: true, locationAddress: true },
    });
    return rows.map((r) => ({
      startAt: r.startAt,
      endAt: r.endAt,
      locationKey: locationKeyOf({
        teachingMode: r.teachingMode, roomId: r.roomId, placeId: r.placeId, address: r.locationAddress,
      }),
    }));
  }

  /** Auto-refus SYSTEM des PENDING chevauchantes (décision attachment n°1). */
  async refuseOverlappingPending(tx: Tx, tutorProfileId: string, startAt: Date, endAt: Date, excludeId: string) {
    const overlapping = await tx.booking.findMany({
      where: {
        tutorProfileId,
        id: { not: excludeId },
        status: 'PENDING',
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    });
    if (overlapping.length) {
      await tx.booking.updateMany({
        where: { id: { in: overlapping.map((b) => b.id) } },
        data: {
          status: 'REFUSED',
          refusalReason: 'Créneau réservé par une autre demande.',
          cancelledBy: 'SYSTEM',
        },
      });
      await tx.bookingEvent.createMany({
        data: overlapping.map((b) => ({
          bookingId: b.id,
          fromStatus: 'PENDING' as never,
          toStatus: 'REFUSED' as never,
          actor: 'SYSTEM' as never,
          reason: 'OVERLAPPING_ACCEPTED',
        })),
      });
    }
    return overlapping;
  }
}
