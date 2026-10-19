import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../core/config/app.config';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AvailabilityRule, SlotPolicy, TeachingMode } from '../../bookings/domain/slot-policy';

export interface OfferForSlots {
  id: string;
  format: 'ONLINE' | 'IN_PERSON' | 'BOTH';
  durationMinutes: number;
}

export interface SlotView {
  startAt: string;
  endAt: string;
}

/** Fenêtre de la Phase 3 (spec §6.5) : 3 créneaux sur 14 jours. */
export const SLOT_WINDOW_DAYS = 14;
export const SLOTS_PER_TUTOR = 3;
const SLOT_STEP_MS = 30 * 60_000;

const modesForFormat = (format: OfferForSlots['format']): TeachingMode[] => {
  if (format === 'ONLINE') return ['ONLINE'];
  if (format === 'IN_PERSON') return ['AT_HOME_BENEFICIARY', 'AT_HOME_TUTOR', 'PUBLIC_PLACE'];
  return ['ONLINE', 'AT_HOME_BENEFICIARY', 'AT_HOME_TUTOR', 'PUBLIC_PLACE'];
};

/** Premier multiple de 30 min ≥ `date` : les créneaux proposés tombent toujours sur :00 ou :30. */
const ceilToStep = (date: Date): Date => new Date(Math.ceil(date.getTime() / SLOT_STEP_MS) * SLOT_STEP_MS);

/**
 * Phase 3 — disponibilités réelles du top K uniquement : règles `Availability` actives (fuseau de chaque règle),
 * moins les `BlockedPeriod` et les `Booking` PENDING / CONFIRMED / IN_PROGRESS. Un tuteur sans créneau reste listé
 * (`nextSlots: []`) : le Demandeur peut le contacter. Le contrôle final de réservabilité reste celui du module de
 * réservation. Calcul en mémoire à partir de 3 requêtes pour tous les tuteurs (pas de N+1).
 */
@Injectable()
export class NextSlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: AppConfig,
  ) {}

  /** `offersByTutor` : offres COMPATIBLES avec la demande (niveau, format), dont on tire les créneaux. */
  async nextSlots(offersByTutor: Map<string, OfferForSlots[]>, now: Date = new Date()): Promise<Map<string, SlotView[]>> {
    const tutorIds = [...offersByTutor.keys()];
    const result = new Map<string, SlotView[]>(tutorIds.map((id) => [id, []]));
    if (!tutorIds.length) return result;

    const from = ceilToStep(new Date(now.getTime() + this.cfg.bookingMinNoticeHours * 3_600_000));
    const to = new Date(now.getTime() + SLOT_WINDOW_DAYS * 86_400_000);
    const [rawRules, rawBusy, rawBlocked] = await Promise.all([
      this.prisma.availability.findMany({
        where: { tutorProfileId: { in: tutorIds }, isActive: true },
        include: { place: true },
      }),
      this.prisma.booking.findMany({
        where: {
          tutorProfileId: { in: tutorIds },
          status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
          startAt: { lt: to },
          endAt: { gt: from },
        },
        select: { tutorProfileId: true, startAt: true, endAt: true },
      }),
      this.prisma.blockedPeriod.findMany({
        where: { tutorProfileId: { in: tutorIds }, startAt: { lt: to }, endAt: { gt: from } },
        select: { tutorProfileId: true, startAt: true, endAt: true },
      }),
    ]);

    const group = <T extends { tutorProfileId: string }>(rows: T[]) => {
      const map = new Map<string, T[]>();
      for (const row of rows) map.set(row.tutorProfileId, [...(map.get(row.tutorProfileId) ?? []), row]);
      return map;
    };
    const rulesByTutor = group(rawRules);
    const busyByTutor = group(rawBusy);
    const blockedByTutor = group(rawBlocked);

    for (const [tutorId, offers] of offersByTutor) {
      const rules: AvailabilityRule[] = (rulesByTutor.get(tutorId) ?? []).map((r) => ({
        id: r.id, dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime, timezone: r.timezone,
        validFrom: r.validFrom, validUntil: r.validUntil, isActive: r.isActive, offerId: r.offerId, placeId: r.placeId,
        placeType: r.place?.type ?? null,
      }));
      const slots = new Map<number, SlotView>();
      for (const offer of offers) {
        const computed = SlotPolicy.computeSlots(
          rules.filter((r) => !r.offerId || r.offerId === offer.id),
          blockedByTutor.get(tutorId) ?? [],
          busyByTutor.get(tutorId) ?? [],
          from, SLOT_WINDOW_DAYS, offer.durationMinutes, modesForFormat(offer.format), offer.id,
        );
        for (const s of computed) {
          if (s.startAt >= to) continue;
          if (!slots.has(s.startAt.getTime())) slots.set(s.startAt.getTime(), { startAt: s.startAt.toISOString(), endAt: s.endAt.toISOString() });
        }
      }
      result.set(tutorId, [...slots.entries()].sort(([a], [b]) => a - b).slice(0, SLOTS_PER_TUTOR).map(([, s]) => s));
    }
    return result;
  }
}
