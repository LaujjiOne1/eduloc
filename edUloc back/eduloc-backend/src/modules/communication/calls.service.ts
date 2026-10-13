import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfig } from '../../core/config/app.config';
import { RateLimitService } from '../../common/rate-limit.service';
import { OutboxWriter } from '../../infrastructure/outbox/outbox-writer';
import { CALL_PROVIDER, CallProvider } from '../../infrastructure/calls/call-provider.port';
import { CommunicationPolicy } from './domain/communication-policy';
import { ConversationsService } from './conversations.service';
import { CreateCallDto } from './dto';

@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: AppConfig,
    private readonly rateLimit: RateLimitService,
    private readonly outbox: OutboxWriter,
    private readonly conversations: ConversationsService,
    @Inject(CALL_PROVIDER) private readonly provider: CallProvider,
  ) {}

  /** Appel réservé aux séances CONFIRMED / IN_PROGRESS (décision attachment n°4). */
  async createCall(userId: string, dto: CreateCallDto) {
    await this.rateLimit.consume(`rl:call:${userId}`, 10, 3600);
    const { conv, isRequester } = await this.conversations.requireParticipant(userId, dto.conversationId);

    // La relation se juge sur TOUTES les réservations de la paire, pas seulement la plus récente.
    const active = await this.prisma.booking.findFirst({
      where: {
        requesterId: conv.requesterId,
        tutorProfileId: conv.tutorProfileId,
        status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
      },
      orderBy: { startAt: 'asc' },
    });
    const relation = CommunicationPolicy.relation(
      {
        hasPending: false,
        hasConfirmedOrInProgress: !!active,
        lastCompletedAt: null,
        tutorSuspended: conv.tutorProfile.suspendedAt !== null,
      },
      new Date(),
    );
    if (!CommunicationPolicy.canCall(relation)) {
      throw new UnprocessableEntityException('CALL_NOT_ALLOWED', {
        description: 'Appel réservé aux séances confirmées ou en cours.',
      });
    }

    const caller = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { firstName: true, lastName: true } });
    const callerName = `${caller.firstName} ${caller.lastName}`.trim();
    const roomName = `eduloc_${randomUUID()}`;
    const recipientId = isRequester ? conv.tutorProfile.userId : conv.requesterId;
    // Préparation externe AVANT la transaction (règle 6.4 : rien d'externe dans le tx).
    await this.provider.ensureRoom(roomName, [userId, recipientId]);

    return this.prisma.$transaction(async (tx) => {
      const call = await tx.callSession.create({
        data: {
          conversationId: conv.id,
          bookingId: active?.id ?? null,
          roomName,
          type: dto.type as never,
          status: 'RINGING',
          initiatedById: userId,
          ringingUntil: new Date(Date.now() + 45_000),
        },
      });
      const message = await tx.message.create({
        data: {
          conversationId: conv.id,
          senderId: userId,
          type: 'CALL_EVENT',
          callSessionId: call.id,
          systemText: 'Appel entrant',
        },
      });
      await this.outbox.write(tx, {
        aggregateType: 'call',
        aggregateId: call.id,
        eventType: 'call.incoming',
        recipientIds: [recipientId],
        payload: {
          callId: call.id, roomName, type: dto.type,
          conversationId: conv.id, messageId: message.id,
          bookingId: active?.id ?? null,
          // Côté de l'appelé : l'app route vers l'espace tuteur ou demandeur.
          recipientRole: isRequester ? 'TUTOR' : 'REQUESTER',
          callerName: callerName,
        },
        pushTitle: 'Appel entrant',
        pushBody: dto.type === 'VIDEO' ? 'Appel vidéo…' : 'Appel audio…',
      });
      return {
        callId: call.id,
        roomName,
        type: call.type,
        status: call.status,
        livekitUrl: this.cfg.livekitUrl,
        token: await this.provider.participantToken(call.roomName, userId, userId),
      };
    });
  }

  async callToken(userId: string, callId: string) {
    const call = await this.prisma.callSession.findFirst({
      where: {
        id: callId,
        conversation: { OR: [{ requesterId: userId }, { tutorProfile: { userId } }] },
      },
      include: { conversation: { include: { tutorProfile: { include: { user: true } }, requester: true } } },
    });
    if (!call) throw new UnprocessableEntityException('CALL_NOT_FOUND');
    const me = call.conversation.requesterId === userId
      ? call.conversation.requester
      : call.conversation.tutorProfile.user;
    const name = `${me.firstName} ${me.lastName}`;
    return {
      callId: call.id,
      roomName: call.roomName,
      type: call.type,
      status: call.status,
      livekitUrl: this.cfg.livekitUrl,
      token: await this.provider.participantToken(call.roomName, userId, name),
    };
  }

  /** Webhook LiveKit (signature vérifiée avec les clés serveur). */
  async handleWebhook(rawBody: Buffer, authHeader: string) {
    const { WebhookReceiver } = await import('livekit-server-sdk');
    const receiver = new WebhookReceiver(this.cfg.livekitApiKey, this.cfg.livekitApiSecret);
    const event = await receiver.receive(rawBody.toString('utf8'), authHeader);
    const roomName = (event as { room?: { name?: string } }).room?.name;
    if (!roomName) return { ok: true };

    const call = await this.prisma.callSession.findUnique({ where: { roomName } });
    if (!call) return { ok: true };

    if (event.event === 'room_started') {
      await this.prisma.callSession.updateMany({
        where: { id: call.id, status: 'RINGING' },
        data: { status: 'ONGOING', startedAt: new Date() },
      });
    } else if (event.event === 'room_finished') {
      const endedAt = new Date();
      const startedAt = call.startedAt ?? call.createdAt;
      const durationSec = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
      const missed = durationSec < 5;
      await this.prisma.$transaction(async (tx) => {
        await tx.callSession.update({
          where: { id: call.id },
          data: { status: missed ? 'MISSED' : 'ENDED', endedAt, durationSec },
        });
        const conv = await tx.conversation.findUniqueOrThrow({ where: { id: call.conversationId } });
        const tutor = await tx.tutorProfile.findUniqueOrThrow({ where: { id: conv.tutorProfileId } });
        const recipientId = call.initiatedById === conv.requesterId ? tutor.userId : conv.requesterId;
        const mm = Math.floor(durationSec / 60);
        const ss = String(durationSec % 60).padStart(2, '0');
        await tx.message.create({
          data: {
            conversationId: call.conversationId,
            senderId: null,
            type: 'CALL_EVENT',
            systemText: missed ? 'Appel manqué' : `Appel terminé · ${mm}:${ss}`,
          },
        });
        await this.outbox.write(tx, {
          aggregateType: 'call',
          aggregateId: call.id,
          eventType: missed ? 'call.missed' : 'call.ended',
          recipientIds: [recipientId],
          payload: { callId: call.id, durationSec },
          pushTitle: missed ? 'Appel manqué' : 'Appel terminé',
          pushBody: missed ? 'Vous avez manqué un appel.' : 'L’appel est terminé.',
        });
      });
    }
    return { ok: true };
  }
}
