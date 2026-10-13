import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  decodeCursor, encodeCursor, CursorPage, CursorQueryDto,
} from '../../common/pagination/cursor-pagination';
import { CommunicationPolicy, RelationFacts, RelationState } from './domain/communication-policy';
import type { MessagesQueryDto } from './dto';

const conversationInclude = {
  requester: { select: { id: true, firstName: true, lastName: true } },
  tutorProfile: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
} satisfies Prisma.ConversationInclude;

type ConversationRecord = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;

const messageInclude = {
  attachment: true,
  sender: { select: { firstName: true } },
} satisfies Prisma.MessageInclude;

export type MessageRecord = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async requireParticipant(userId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [{ requesterId: userId }, { tutorProfile: { userId } }],
      },
      include: { tutorProfile: true },
    });
    if (!conv) throw new NotFoundException('CONVERSATION_NOT_FOUND');
    const isRequester = conv.requesterId === userId;
    return { conv, isRequester };
  }

  /**
   * Faits de relation entre UN demandeur et UN tuteur, tous bookings confondus.
   * La conversation est unique par paire (ADR-12) : se limiter à `Conversation.bookingId`
   * (la réservation « de contexte » la plus récente) ignorerait une séance confirmée plus ancienne.
   */
  async relationFacts(requesterId: string, tutorProfileId: string, tutorSuspended: boolean): Promise<RelationFacts> {
    const bookings = await this.prisma.booking.findMany({
      where: { requesterId, tutorProfileId, status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] } },
      select: { status: true, completedAt: true },
    });
    return this.factsFromBookings(bookings, tutorSuspended);
  }

  private factsFromBookings(
    bookings: { status: string; completedAt: Date | null }[],
    tutorSuspended: boolean,
  ): RelationFacts {
    const completed = bookings
      .filter((b) => b.status === 'COMPLETED' && b.completedAt)
      .map((b) => b.completedAt!.getTime());
    return {
      hasPending: bookings.some((b) => b.status === 'PENDING'),
      hasConfirmedOrInProgress: bookings.some((b) => b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS'),
      lastCompletedAt: completed.length ? new Date(Math.max(...completed)) : null,
      tutorSuspended,
    };
  }

  async relationFor(requesterId: string, tutorProfileId: string, tutorSuspended: boolean): Promise<RelationState> {
    return CommunicationPolicy.relation(
      await this.relationFacts(requesterId, tutorProfileId, tutorSuspended),
      new Date(),
    );
  }

  async listMine(userId: string, q: CursorQueryDto): Promise<CursorPage<unknown>> {
    const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
    const rows = await this.prisma.conversation.findMany({
      where: { OR: [{ requesterId: userId }, { tutorProfile: { userId } }] },
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      take: q.limit + 1,
      include: conversationInclude,
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);

    // Faits de relation de toutes les paires en UNE requête (pas de N+1).
    const bookings = page.length
      ? await this.prisma.booking.findMany({
          where: {
            status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] },
            OR: page.map((c) => ({ requesterId: c.requesterId, tutorProfileId: c.tutorProfileId })),
          },
          select: { requesterId: true, tutorProfileId: true, status: true, completedAt: true },
        })
      : [];
    const unread = await Promise.all(page.map((c) => this.unreadCount(c, userId)));

    const items = page.map((c, index) => {
      const pairBookings = bookings.filter(
        (b) => b.requesterId === c.requesterId && b.tutorProfileId === c.tutorProfileId,
      );
      const relation = CommunicationPolicy.relation(
        this.factsFromBookings(pairBookings, c.tutorProfile.suspendedAt !== null),
        new Date(),
      );
      return this.toConversationResponse(c, userId, unread[index], relation);
    });
    const last = page[page.length - 1];
    return {
      items,
      nextCursor: rows.length > q.limit && last
        ? encodeCursor(last.lastMessageAt ?? last.createdAt, last.id)
        : null,
    };
  }

  async getOne(userId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, OR: [{ requesterId: userId }, { tutorProfile: { userId } }] },
      include: conversationInclude,
    });
    if (!conv) throw new NotFoundException('CONVERSATION_NOT_FOUND');
    const relation = await this.relationFor(conv.requesterId, conv.tutorProfileId, conv.tutorProfile.suspendedAt !== null);
    return this.toConversationResponse(conv, userId, await this.unreadCount(conv, userId), relation);
  }

  async listMessages(userId: string, conversationId: string, q: MessagesQueryDto) {
    await this.requireParticipant(userId, conversationId);
    const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
    const rows = await this.prisma.message.findMany({
      where: { conversationId, deletedAt: null, ...(q.type ? { type: q.type as never } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      include: messageInclude,
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
    });
    const items = rows.slice(0, q.limit).reverse().map((m) => this.toMessageResponse(m, userId));
    const last = rows[q.limit - 1];
    return {
      items,
      nextCursor: rows.length > q.limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async markRead(userId: string, conversationId: string) {
    const { isRequester } = await this.requireParticipant(userId, conversationId);
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: isRequester
        ? { requesterLastReadAt: new Date() }
        : { tutorLastReadAt: new Date() },
    });
    return { ok: true };
  }

  /** Messages de l'AUTRE partie (vocaux, documents, appels) postérieurs à la dernière lecture. */
  private unreadCount(c: ConversationRecord, userId: string): Promise<number> {
    const lastReadAt = c.requesterId === userId ? c.requesterLastReadAt : c.tutorLastReadAt;
    return this.prisma.message.count({
      where: {
        conversationId: c.id,
        deletedAt: null,
        senderId: { not: userId },
        type: { in: ['VOICE', 'DOCUMENT'] },
        ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
      },
    });
  }

  toConversationResponse(c: ConversationRecord, userId: string, unreadCount: number, relation: RelationState) {
    const viewerRole = c.requesterId === userId ? 'REQUESTER' : 'TUTOR';
    const tutor = c.tutorProfile;
    return {
      id: c.id,
      status: c.status === 'CLOSED' ? 'CLOSED' : relation === 'READ_ONLY' ? 'READ_ONLY' : 'OPEN',
      viewerRole,
      requester: c.requester,
      tutor: {
        id: tutor.id,
        firstName: tutor.user.firstName,
        lastName: tutor.user.lastName,
        displayName: tutor.displayName,
        profilePhoto: tutor.profilePhoto,
        gender: tutor.gender,
        rating: tutor.rating,
        reviewsCount: tutor.reviewsCount,
        isVerified: tutor.isVisible,
      },
      bookingId: c.bookingId,
      lastMessageType: c.lastMessageType,
      lastMessagePreview: c.lastMessagePreview,
      lastMessageAt: c.lastMessageAt,
      unreadCount,
      canSend: CommunicationPolicy.canSend(relation),
      canCall: CommunicationPolicy.canCall(relation),
    };
  }

  toMessageResponse(m: MessageRecord, userId: string) {
    const a = m.attachment;
    return {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      senderFirstName: m.sender?.firstName ?? null,
      isMine: m.senderId === userId,
      type: m.type,
      clientMessageId: m.clientMessageId,
      systemText: m.systemText,
      replyToId: m.replyToId,
      attachment: a
        ? {
            id: a.id,
            kind: a.kind,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            fileName: a.fileName,
            durationMs: a.durationMs,
            waveform: Array.isArray(a.waveform) ? (a.waveform as number[]) : null,
            transcriptStatus: a.transcriptStatus,
            transcript: a.transcript,
          }
        : null,
      callSessionId: m.callSessionId,
      listenedAt: m.listenedAt,
      createdAt: m.createdAt,
    };
  }
}

export { messageInclude };
