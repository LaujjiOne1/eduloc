import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AppConfig } from '../../core/config/app.config';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Tx } from './bookings.repository';

export interface NewHold {
  requesterId: string;
  beneficiaryId: string;
  offerId: string;
  tutorProfileId: string;
  roomId: string | null;
  teachingMode: string;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  totalAmount: string;
}

/**
 * Blocage temporaire du créneau (Tuteur + salle) pendant que le Demandeur finalise sa réservation.
 *
 * Tout est décidé ICI, côté serveur : un blocage ACTIVE et non expiré compte comme occupé pour les AUTRES demandeurs
 * (jamais pour son propre titulaire). L'expiration est évaluée à la lecture (`expiresAt > now`), donc exacte même si la
 * tâche de nettoyage tarde ; la tâche ne fait que marquer EXPIRED. Les appelants prennent d'abord les verrous du
 * Tuteur puis de la salle (même ordre que partout), ce qui rend ces contrôles sûrs en concurrence.
 */
@Injectable()
export class BookingHoldsService {
  private readonly logger = new Logger(BookingHoldsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: AppConfig,
  ) {}

  /** Un autre Demandeur bloque-t-il déjà le Tuteur sur ce créneau ? */
  async tutorHeldByOther(tx: Tx, tutorProfileId: string, startAt: Date, endAt: Date, requesterId: string, now = new Date()): Promise<boolean> {
    return (await tx.bookingHold.count({
      where: {
        tutorProfileId, requesterId: { not: requesterId }, status: 'ACTIVE', expiresAt: { gt: now },
        startAt: { lt: endAt }, endAt: { gt: startAt },
      },
    })) > 0;
  }

  /** Un autre Demandeur bloque-t-il déjà la salle (rotation comprise) ? */
  async roomHeldByOther(tx: Tx, roomId: string, startAt: Date, endAt: Date, requesterId: string, now = new Date()): Promise<boolean> {
    const turnover = this.cfg.roomTurnoverBufferMinutes * 60_000;
    return (await tx.bookingHold.count({
      where: {
        roomId, requesterId: { not: requesterId }, status: 'ACTIVE', expiresAt: { gt: now },
        startAt: { lt: new Date(endAt.getTime() + turnover) }, endAt: { gt: new Date(startAt.getTime() - turnover) },
      },
    })) > 0;
  }

  /** Crée le blocage ; les blocages encore actifs du même Demandeur chez le même Tuteur sont libérés (un seul à la fois). */
  async create(tx: Tx, hold: NewHold, now = new Date()) {
    await tx.bookingHold.updateMany({
      where: { requesterId: hold.requesterId, tutorProfileId: hold.tutorProfileId, status: 'ACTIVE' },
      data: { status: 'RELEASED' },
    });
    return tx.bookingHold.create({
      data: {
        requesterId: hold.requesterId, beneficiaryId: hold.beneficiaryId, offerId: hold.offerId,
        tutorProfileId: hold.tutorProfileId, roomId: hold.roomId, teachingMode: hold.teachingMode as never,
        startAt: hold.startAt, endAt: hold.endAt, durationMinutes: hold.durationMinutes, totalAmount: hold.totalAmount,
        expiresAt: new Date(now.getTime() + this.cfg.bookingHoldMinutes * 60_000),
      },
    });
  }

  /** Marque le blocage consommé par la réservation créée (dans la même transaction). */
  async consume(tx: Tx, holdId: string, bookingId: string): Promise<void> {
    await tx.bookingHold.update({ where: { id: holdId }, data: { status: 'CONSUMED', bookingId } });
  }

  /** Libère un blocage encore actif (hors transaction : l'échec de finalisation a annulé la transaction). */
  async release(holdId: string): Promise<void> {
    await this.prisma.bookingHold.updateMany({ where: { id: holdId, status: 'ACTIVE' }, data: { status: 'RELEASED' } });
  }

  @Cron('* * * * *')
  async run(): Promise<void> {
    const n = await this.expireDue(new Date());
    if (n > 0) this.logger.log(`${n} blocage(s) de créneau expiré(s).`);
  }

  /** Visible pour les tests : marque EXPIRED les blocages ACTIVE échus à l'instant `now`. */
  async expireDue(now: Date): Promise<number> {
    const { count } = await this.prisma.bookingHold.updateMany({
      where: { status: 'ACTIVE', expiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });
    return count;
  }
}
