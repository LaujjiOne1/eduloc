import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import { OutboxWriter, type OutboxEventInput } from '../../infrastructure/outbox/outbox-writer';

/** Délai de rappel le plus grand proposé dans les paramètres (minutes) : borne la recherche des séances à venir. */
const MAX_LEAD_MINUTES = 60;

const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Antananarivo' });

type Side = 'requester' | 'tutor';

/**
 * Alarme de cours : chaque minute, prévient les deux parties d'une séance CONFIRMÉE qui commence bientôt,
 * selon LEUR paramètre (activée ou non, X minutes avant). Un seul rappel par partie et par séance
 * (marqueurs `requesterRemindedAt` / `tutorRemindedAt`, posés de façon conditionnelle donc sûrs en multi-instance).
 * Le rappel passe par l'outbox : notification persistée + temps réel + push, comme tout événement métier.
 */
@Injectable()
export class LessonRemindersService {
  private readonly logger = new Logger(LessonRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxWriter,
  ) {}

  @Cron('* * * * *')
  async run(): Promise<void> {
    const n = await this.sendDueReminders(new Date());
    if (n > 0) this.logger.log(`${n} rappel(s) de cours envoyé(s).`);
  }

  /** Visible pour les tests : envoie les rappels dus à l'instant `now`, renvoie leur nombre. */
  async sendDueReminders(now: Date): Promise<number> {
    const horizon = new Date(now.getTime() + MAX_LEAD_MINUTES * 60_000);
    const candidates = await this.prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        startAt: { gt: now, lte: horizon },
        OR: [{ requesterRemindedAt: null }, { tutorRemindedAt: null }],
      },
      select: {
        id: true,
        startAt: true,
        offerTitle: true,
        requesterRemindedAt: true,
        tutorRemindedAt: true,
        requester: { select: { id: true, lessonAlarmEnabled: true, lessonAlarmLeadMinutes: true } },
        tutorProfile: { select: { user: { select: { id: true, lessonAlarmEnabled: true, lessonAlarmLeadMinutes: true } } } },
        beneficiary: { select: { firstName: true } },
      },
    });

    let sent = 0;
    for (const b of candidates) {
      const sides: { side: Side; user: { id: string; lessonAlarmEnabled: boolean; lessonAlarmLeadMinutes: number }; done: Date | null }[] = [
        { side: 'requester', user: b.requester, done: b.requesterRemindedAt },
        { side: 'tutor', user: b.tutorProfile.user, done: b.tutorRemindedAt },
      ];
      for (const { side, user, done } of sides) {
        if (done || !user.lessonAlarmEnabled) continue;
        if (b.startAt.getTime() - user.lessonAlarmLeadMinutes * 60_000 > now.getTime()) continue;
        const minutes = Math.max(1, Math.round((b.startAt.getTime() - now.getTime()) / 60_000));
        const event: OutboxEventInput = {
          aggregateType: 'booking',
          aggregateId: b.id,
          eventType: 'booking.reminder',
          recipientIds: [user.id],
          payload: { bookingId: b.id, startAt: b.startAt.toISOString(), minutes },
          pushTitle: 'Cours dans ' + (minutes >= 60 ? '1 h' : `${minutes} min`),
          pushBody: side === 'tutor'
            ? `${b.beneficiary.firstName} · ${b.offerTitle} à ${timeFormat.format(b.startAt)}.`
            : `${b.offerTitle} à ${timeFormat.format(b.startAt)}. Préparez-vous.`,
        };
        const marker = side === 'requester' ? { requesterRemindedAt: now } : { tutorRemindedAt: now };
        const claimed = await this.prisma.$transaction(async (tx) => {
          // Conditionnel : si une autre instance a déjà envoyé ce rappel, count = 0 et on n'écrit rien.
          const { count } = await tx.booking.updateMany({
            where: { id: b.id, status: 'CONFIRMED', ...(side === 'requester' ? { requesterRemindedAt: null } : { tutorRemindedAt: null }) },
            data: marker,
          });
          if (count !== 1) return false;
          await this.outbox.write(tx, event);
          return true;
        });
        if (claimed) sent += 1;
      }
    }
    return sent;
  }
}
