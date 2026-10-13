import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Inject } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { REALTIME_PUBLISHER, RealtimePublisher } from '../realtime/realtime-publisher.port';
import { PUSH_PROVIDER, PushProvider } from '../push/push-provider.port';
import { ResendEmailService } from './resend-email.service';

interface RelayRow {
  id: string;
  aggregateId: string;
  eventType: string;
  recipientIds: string[] | null;
  payload: unknown;
  pushTitle: string | null;
  pushBody: string | null;
  cacheKeys: string[] | null;
  attempts: number;
}

/** Au-delà, l'événement est abandonné (dead-letter) au lieu d'être rejoué indéfiniment. */
const MAX_ATTEMPTS = 8;

/** Données de push : valeurs scalaires uniquement (FCM / APNs n'acceptent que des chaînes). */
function flattenPayload(payload: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (payload && typeof payload === 'object') {
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      if (value === null || value === undefined) continue;
      if (['string', 'number', 'boolean'].includes(typeof value)) out[key] = String(value);
    }
  }
  return out;
}

/** Événement outbox → type de notification persistée (écran « Notifications »). */
const NOTIFICATION_TYPES: Record<string, string> = {
  'booking.requested': 'BOOKING_REQUEST',
  'booking.confirmed': 'BOOKING_CONFIRMED',
  'booking.refused': 'BOOKING_REFUSED',
  'booking.cancelled': 'BOOKING_CANCELLED',
  'booking.reminder': 'REMINDER',
  'session.started': 'SESSION_STARTED',
  'session.completed': 'REVIEW_REQUEST',
  'tutor.application.submitted': 'TUTOR_APPLICATION',
  'tutor.application.approved': 'TUTOR_APPLICATION_APPROVED',
  'tutor.application.rejected': 'TUTOR_APPLICATION_REJECTED',
  'tutor.suspended': 'TUTOR_SUSPENDED',
  'message.voice.created': 'VOICE_MESSAGE',
  'message.document.created': 'DOCUMENT_MESSAGE',
  'call.incoming': 'INCOMING_CALL',
  'call.missed': 'MISSED_CALL',
  'review.created': 'SYSTEM',
};

/** Événements dont le payload contient un secret (code e-mail) : jamais diffusé ni conservé. */
const isSecretEvent = (eventType: string) => eventType.startsWith('user.');

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    private readonly email: ResendEmailService,
  ) {}

  @Cron('*/5 * * * * *')
  async relay(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.prisma.$transaction(async (tx) => {
        const events = await tx.$queryRaw<RelayRow[]>`
          SELECT id, "aggregateId", "eventType", "recipientIds", payload,
                 "pushTitle", "pushBody", "cacheKeys", attempts
          FROM outbox_events
          WHERE "processedAt" IS NULL
            AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
          ORDER BY "createdAt" ASC
          LIMIT 50
          FOR UPDATE SKIP LOCKED`;

        for (const ev of events) {
          try {
            await this.dispatch(tx, ev);
            await tx.outboxEvent.update({
              where: { id: ev.id },
              data: {
                processedAt: new Date(),
                // Un code e-mail ne doit pas survivre à son envoi.
                ...(isSecretEvent(ev.eventType) ? { payload: {} } : {}),
              },
            });
          } catch (err) {
            const attempts = ev.attempts + 1;
            const abandoned = attempts >= MAX_ATTEMPTS;
            await tx.outboxEvent.update({
              where: { id: ev.id },
              data: {
                attempts,
                lastError: (err as Error).message.slice(0, 500),
                lockedUntil: new Date(Date.now() + Math.min(60_000, 2 ** ev.attempts * 1000)),
                ...(abandoned
                  ? { processedAt: new Date(), ...(isSecretEvent(ev.eventType) ? { payload: {} } : {}) }
                  : {}),
              },
            });
            this.logger.warn(
              `outbox ${ev.id} (${ev.eventType}) tentative ${attempts}/${MAX_ATTEMPTS}: ${(err as Error).message}`,
            );
          }
        }
      }, { timeout: 15_000 });
    } finally {
      this.running = false;
    }
  }

  private async dispatch(tx: Prisma.TransactionClient, ev: RelayRow): Promise<void> {
    const recipientIds = ev.recipientIds ?? [];
    const cacheKeys = ev.cacheKeys ?? [];

    if (!isSecretEvent(ev.eventType)) {
      const data = { eventId: ev.id, type: ev.eventType, aggregateId: ev.aggregateId, payload: ev.payload };
      for (const userId of recipientIds) {
        await this.realtime.publish(this.realtime.personalChannel(userId), data, ev.id);
      }
    }

    const notificationType = NOTIFICATION_TYPES[ev.eventType];
    if (notificationType && ev.pushTitle && ev.pushBody && recipientIds.length) {
      await tx.notification.createMany({
        data: recipientIds.map((userId) => ({
          userId,
          type: notificationType as never,
          title: ev.pushTitle!,
          message: ev.pushBody!,
          data: (ev.payload ?? undefined) as Prisma.InputJsonValue | undefined,
        })),
      });
    }

    if (ev.pushTitle && ev.pushBody && recipientIds.length) {
      const tokens = await tx.deviceToken.findMany({
        where: { userId: { in: recipientIds } },
        select: { token: true },
      });
      const isCall = ev.eventType === 'call.incoming';
      await this.push.sendToTokens(tokens.map((t) => t.token), {
        title: ev.pushTitle,
        body: ev.pushBody,
        // Les données permettent d'ouvrir le bon écran au toucher (réservation, conversation, appel à rejoindre).
        data: { ...flattenPayload(ev.payload), eventId: ev.id, type: ev.eventType },
        channelId: isCall ? 'calls' : 'default',
        priority: 'high',
        // Un appel n'a de sens que pendant qu'il sonne (45 s côté serveur).
        ttlSeconds: isCall ? 45 : undefined,
        sound: isCall ? 'ringtone.wav' : undefined,
      });
    }

    if (cacheKeys.length) await this.redis.del(...cacheKeys);
    await this.email.sendOutboxEmail(ev.eventType, ev.payload, ev.id);
  }
}
