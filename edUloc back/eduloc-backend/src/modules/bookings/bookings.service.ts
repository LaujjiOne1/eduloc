import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CryptoService } from '../../core/crypto/crypto.service';
import { AppConfig } from '../../core/config/app.config';
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../common/errors/domain-errors';
import { RateLimitService } from '../../common/rate-limit.service';
import { OutboxWriter, type OutboxEventInput } from '../../infrastructure/outbox/outbox-writer';
import { BookingStateMachine, BookingActor, BookingState } from './domain/booking-state-machine';
import { SlotPolicy, TeachingMode, AvailabilityRule } from './domain/slot-policy';
import { SessionPolicy } from './domain/session-policy';
import { BookingPolicy } from './domain/booking-policy';
import { BookingsRepository, Tx } from './bookings.repository';
import { CancelBookingDto, CreateBookingDto, RefuseBookingDto } from './dto';

const toBookingState = (s: string): BookingState =>
  s as BookingState;

const bookingResponseInclude = {
  offer: { include: { subject: true, educationLevel: true } },
  tutorProfile: { include: { user: true } },
  requester: { select: { id: true, firstName: true, lastName: true } },
  beneficiary: { include: { educationLevel: true } },
  review: { select: { id: true } },
} satisfies Prisma.BookingInclude;

type BookingResponseRecord = Prisma.BookingGetPayload<{ include: typeof bookingResponseInclude }>;

interface CompetingRequest {
  id: string;
  beneficiaryFirstName: string;
  requesterName: string;
  startAt: Date;
  endAt: Date;
  createdAt: Date;
}

const pairKey = (b: { requesterId: string; tutorProfileId: string }) => `${b.requesterId}:${b.tutorProfileId}`;

const whenFormat = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  timeZone: 'Indian/Antananarivo',
});
/** « mardi 20 octobre, 20:00 » (fuseau métier) : la conversation est commune à toutes les séances de la paire. */
const when = (date: Date): string => whenFormat.format(date);

/** La conversation (une par paire) affiche le dernier événement. */
const systemPreview = (text: string) => ({
  lastMessageType: 'SYSTEM' as const,
  lastMessagePreview: text,
  lastMessageAt: new Date(),
});

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: BookingsRepository,
    private readonly crypto: CryptoService,
    private readonly outbox: OutboxWriter,
    private readonly rateLimit: RateLimitService,
    private readonly cfg: AppConfig,
  ) {}

  async createBooking(requesterId: string, dto: CreateBookingDto) {
    await this.rateLimit.consume(`rl:booking:${requesterId}`, 10, 3600);
    const bookingId = await this.prisma.$transaction(async (tx: Tx) => {
      const offer = await this.repo.findBookableOffer(tx, dto.offerId);
      if (!offer) throw new NotFoundError('OFFER_NOT_BOOKABLE');

      await this.repo.lockTutor(tx, offer.tutorProfileId);

      const beneficiary = await tx.beneficiary.findFirst({ where: { id: dto.beneficiaryId, requesterId } });
      if (!beneficiary) throw new ForbiddenError('BENEFICIARY_NOT_OWNED');
      if (dto.teachingMode === 'AT_HOME_BENEFICIARY' && !dto.beneficiaryAddress?.trim()) {
        throw new UnprocessableError('BENEFICIARY_ADDRESS_REQUIRED');
      }

      const startAt = new Date(dto.startAt);
      const endAt = new Date(startAt.getTime() + offer.durationMinutes * 60_000);
      BookingPolicy.assertMinNotice(startAt, new Date(), this.cfg.bookingMinNoticeHours);

      const rawRules = await tx.availability.findMany({
        where: { tutorProfileId: offer.tutorProfileId, isActive: true },
        include: { place: true },
      });
      const rules: AvailabilityRule[] = rawRules.map((r) => ({
        id: r.id,
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        endTime: r.endTime,
        timezone: r.timezone,
        validFrom: r.validFrom,
        validUntil: r.validUntil,
        isActive: r.isActive,
        offerId: r.offerId,
        placeId: r.placeId,
        placeType: r.place?.type ?? null,
      }));
      const rule = SlotPolicy.matchRule(rules, startAt, endAt, dto.teachingMode as TeachingMode, dto.placeId, offer.id);
      if (!rule) throw new UnprocessableError('SLOT_OUTSIDE_AVAILABILITY');

      const conflict = await this.repo.blockingOverlap(tx, offer.tutorProfileId, startAt, endAt);
      if (conflict) throw new ConflictError('SLOT_UNAVAILABLE');

      // Demandes déjà en attente sur le même horaire : le tuteur doit pouvoir arbitrer en connaissance de cause.
      const competing = await tx.booking.count({
        where: { tutorProfileId: offer.tutorProfileId, status: 'PENDING', startAt: { lt: endAt }, endAt: { gt: startAt } },
      });

      const place = rule.placeId ? await tx.place.findUnique({ where: { id: rule.placeId } }) : null;
      // Conversion du matching : seule une recherche du demandeur lui-même est rattachée (sinon ignorée, sans bloquer la réservation).
      const matchingSearch = dto.matchingSearchId
        ? await tx.matchingSearch.findFirst({ where: { id: dto.matchingSearchId, requesterId }, select: { id: true } })
        : null;
      const booking = await tx.booking.create({
        data: {
          requesterId,
          matchingSearchId: matchingSearch?.id ?? null,
          beneficiaryId: beneficiary.id,
          tutorProfileId: offer.tutorProfileId,
          offerId: offer.id,
          availabilityId: rule.id,
          placeId: place?.id ?? null,
          startAt,
          endAt,
          status: 'PENDING',
          teachingMode: dto.teachingMode as never,
          price: offer.price,
          offerTitle: offer.title,
          locationLabel: dto.teachingMode === 'ONLINE'
            ? 'En ligne'
            : dto.teachingMode === 'AT_HOME_BENEFICIARY'
              ? 'Domicile du bénéficiaire'
              : place?.label ?? null,
          locationAddress: dto.teachingMode === 'AT_HOME_BENEFICIARY'
            ? dto.beneficiaryAddress?.trim() ?? null
            : place?.address ?? null,
          latitude: place?.latitude ?? null,
          longitude: place?.longitude ?? null,
          requesterNote: dto.requesterNote?.trim() || null,
        },
      });
      await tx.bookingEvent.create({
        data: { bookingId: booking.id, toStatus: 'PENDING' as never, actor: 'REQUESTER' as never, actorUserId: requesterId },
      });

      const requestText = `Demande envoyée pour ${when(startAt)}.`;
      const conversation = await tx.conversation.upsert({
        where: { requesterId_tutorProfileId: { requesterId, tutorProfileId: offer.tutorProfileId } },
        update: { bookingId: booking.id, status: 'OPEN' as never, ...systemPreview(requestText) },
        create: { requesterId, tutorProfileId: offer.tutorProfileId, bookingId: booking.id, ...systemPreview(requestText) },
      });
      await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderId: null,
          type: 'SYSTEM',
          systemText: requestText,
        },
      });

      await this.outbox.write(tx, {
        aggregateType: 'booking',
        aggregateId: booking.id,
        eventType: 'booking.requested',
        recipientIds: [offer.tutorProfile.userId],
        payload: { bookingId: booking.id, startAt: startAt.toISOString(), conversationId: conversation.id, competingRequests: competing },
        pushTitle: competing > 0 ? 'Nouvelle demande sur un créneau déjà demandé' : 'Nouvelle demande',
        pushBody: competing > 0
          ? `${competing === 1 ? 'Une autre demande vise' : `${competing} autres demandes visent`} le même horaire (${when(startAt)}). En accepter une refusera automatiquement les autres.`
          : 'Un demandeur souhaite réserver un créneau.',
        cacheKeys: [`slots:${offer.tutorProfileId}:${startAt.toISOString().slice(0, 10)}:${offer.id}:${offer.durationMinutes}`],
      });
      return booking.id;
    }, { timeout: 10_000 });
    return this.getForUser(requesterId, bookingId);
  }

  async acceptBooking(tutorUserId: string, bookingId: string) {
    const accepted = await this.prisma.$transaction(async (tx: Tx) => {
      const tutor = await tx.tutorProfile.findFirst({
        where: { userId: tutorUserId, isVisible: true, suspendedAt: null },
      });
      if (!tutor) throw new ForbiddenError('TUTOR_NOT_APPROVED');
      await this.repo.lockTutor(tx, tutor.id);

      const booking = await tx.booking.findFirst({
        where: { id: bookingId, tutorProfileId: tutor.id },
        include: { offer: true },
      });
      if (!booking) throw new NotFoundError('BOOKING_NOT_FOUND');
      BookingStateMachine.assertCanTransition(toBookingState(booking.status as string), 'CONFIRMED', 'TUTOR');

      const conflict = await this.repo.blockingOverlap(tx, tutor.id, booking.startAt, booking.endAt, booking.id);
      if (conflict) throw new ConflictError('SLOT_NO_LONGER_AVAILABLE');

      const otp = this.crypto.generateOtp();
      const { count } = await tx.booking.updateMany({
        where: { id: booking.id, status: 'PENDING' },
        data: {
          status: 'CONFIRMED',
          startOtpCipher: this.crypto.encrypt(otp),
          otpExpiresAt: booking.endAt,
          otpAttempts: 0,
        },
      });
      if (count !== 1) throw new ConflictError('BOOKING_STATE_CHANGED');
      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          fromStatus: 'PENDING' as never,
          toStatus: 'CONFIRMED' as never,
          actor: 'TUTOR' as never,
          actorUserId: tutorUserId,
        },
      });

      const autoRefused = await this.repo.refuseOverlappingPending(tx, tutor.id, booking.startAt, booking.endAt, booking.id);
      await this.journal(tx, booking, `Demande acceptée : séance du ${when(booking.startAt)}.`);
      for (const b of autoRefused) await this.journal(tx, b, `Demande refusée : le créneau du ${when(b.startAt)} a été réservé par une autre demande.`);
      const inputs: OutboxEventInput[] = [{
        aggregateType: 'booking',
        aggregateId: booking.id,
        eventType: 'booking.confirmed',
        recipientIds: [booking.requesterId],
        payload: { bookingId: booking.id, startAt: booking.startAt.toISOString() },
        pushTitle: 'Réservation confirmée',
        pushBody: 'Le tuteur a accepté votre demande.',
        cacheKeys: [`slots:${tutor.id}:${booking.startAt.toISOString().slice(0, 10)}:${booking.offerId}:${booking.offer.durationMinutes}`],
      }];
      for (const b of autoRefused) {
        inputs.push({
          aggregateType: 'booking',
          aggregateId: b.id,
          eventType: 'booking.refused',
          recipientIds: [b.requesterId],
          payload: { bookingId: b.id, reason: 'SLOT_TAKEN', by: 'SYSTEM' },
          pushTitle: 'Créneau indisponible',
          pushBody: 'Ce créneau vient d’être réservé.',
        });
      }
      await this.outbox.writeMany(tx, inputs);
      return { bookingId: booking.id, otp };
    }, { timeout: 10_000 });
    const booking = await this.getForUser(tutorUserId, accepted.bookingId);
    return { ...booking, startOtp: accepted.otp };
  }

  async refuseBooking(tutorUserId: string, bookingId: string, dto: RefuseBookingDto) {
    return this.transitionAsTutor(tutorUserId, bookingId, 'REFUSED', dto.reason ?? null);
  }

  async cancelBooking(userId: string, bookingId: string, dto: CancelBookingDto, isAdmin: boolean) {
    const cancellation = await this.prisma.$transaction(async (tx: Tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { tutorProfile: true, offer: true },
      });
      if (!booking) throw new NotFoundError('BOOKING_NOT_FOUND');
      const isRequester = booking.requesterId === userId;
      const isTutor = booking.tutorProfile.userId === userId;
      if (!isRequester && !isTutor && !isAdmin) throw new ForbiddenError('BOOKING_NOT_OWNED');

      const actor: BookingActor = isAdmin && !isRequester && !isTutor ? 'ADMIN' : isRequester ? 'REQUESTER' : 'TUTOR';
      BookingStateMachine.assertCanTransition(toBookingState(booking.status as string), 'CANCELLED', actor);
      BookingPolicy.assertCancellationAllowed(booking.startAt, new Date(), dto.reason, this.cfg.cancellationFreeNoticeHours);

      const from = booking.status as string;
      const { count } = await tx.booking.updateMany({
        where: { id: booking.id, status: { in: ['PENDING', 'CONFIRMED'] } },
        data: { status: 'CANCELLED', cancelledBy: actor as never, cancellationReason: dto.reason ?? null },
      });
      if (count !== 1) throw new ConflictError('BOOKING_STATE_CHANGED');
      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          fromStatus: from as never,
          toStatus: 'CANCELLED' as never,
          actor: actor as never,
          actorUserId: userId,
          reason: dto.reason,
        },
      });
      const byLabel = actor === 'REQUESTER' ? 'le demandeur' : actor === 'TUTOR' ? 'le tuteur' : 'EduLoc';
      await this.journal(tx, booking, `Séance du ${when(booking.startAt)} annulée par ${byLabel}.`);
      const other = actor === 'REQUESTER' ? booking.tutorProfile.userId : booking.requesterId;
      await this.outbox.write(tx, {
        aggregateType: 'booking',
        aggregateId: booking.id,
        eventType: 'booking.cancelled',
        recipientIds: [other],
        payload: { bookingId: booking.id, by: actor },
        pushTitle: 'Rendez-vous annulé',
        pushBody: 'Une réservation a été annulée.',
        cacheKeys: [`slots:${booking.tutorProfileId}:${booking.startAt.toISOString().slice(0, 10)}:${booking.offerId}:${booking.offer.durationMinutes}`],
      });
      return {
        bookingId: booking.id,
        viewerRole: isRequester ? 'REQUESTER' as const : isTutor ? 'TUTOR' as const : 'REQUESTER' as const,
      };
    }, { timeout: 10_000 });
    if (isAdmin) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: cancellation.bookingId },
        include: bookingResponseInclude,
      });
      if (!booking) throw new NotFoundError('BOOKING_NOT_FOUND');
      return this.toResponse(booking, cancellation.viewerRole, (await this.conversationIds([booking])).get(pairKey(booking)) ?? null);
    }
    return this.getForUser(userId, cancellation.bookingId);
  }

  async getOtp(requesterId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({ where: { id: bookingId, requesterId } });
    if (!booking) throw new NotFoundError('BOOKING_NOT_FOUND');
    if (booking.status !== 'CONFIRMED' || !booking.startOtpCipher) {
      throw new UnprocessableError('OTP_NOT_AVAILABLE');
    }
    return { bookingId: booking.id, otp: this.crypto.decrypt(booking.startOtpCipher) };
  }

  async startSession(tutorUserId: string, bookingId: string, otp: string) {
    await this.rateLimit.consume(`rl:otp:${bookingId}`, 5, 3600);
    const result = await this.prisma.$transaction(async (tx: Tx) => {
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, tutorProfile: { userId: tutorUserId } },
      });
      if (!booking) throw new NotFoundError('BOOKING_NOT_FOUND');
      BookingStateMachine.assertCanTransition(toBookingState(booking.status as string), 'IN_PROGRESS', 'TUTOR');
      SessionPolicy.assertWithinStartWindow(booking.startAt, booking.endAt, new Date());
      if (booking.otpAttempts >= 5) throw new UnprocessableError('OTP_LOCKED');

      const valid = this.crypto.safeEqual(this.crypto.decrypt(booking.startOtpCipher!), otp);
      if (!valid) {
        await tx.booking.update({ where: { id: booking.id }, data: { otpAttempts: { increment: 1 } } });
        return { ok: false as const };
      }
      const { count } = await tx.booking.updateMany({
        where: { id: booking.id, status: 'CONFIRMED' },
        data: { status: 'IN_PROGRESS', startedAt: new Date(), startOtpCipher: null },
      });
      if (count !== 1) throw new ConflictError('BOOKING_STATE_CHANGED');
      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          fromStatus: 'CONFIRMED' as never,
          toStatus: 'IN_PROGRESS' as never,
          actor: 'TUTOR' as never,
          actorUserId: tutorUserId,
        },
      });
      await this.outbox.write(tx, {
        aggregateType: 'booking',
        aggregateId: booking.id,
        eventType: 'session.started',
        recipientIds: [booking.requesterId],
        payload: { bookingId: booking.id },
        pushTitle: 'Séance démarrée',
        pushBody: 'Le tuteur a démarré la séance.',
      });
      return { ok: true as const };
    });
    if (!result.ok) throw new UnprocessableError('OTP_INVALID');
    return this.getForUser(tutorUserId, bookingId);
  }

  async completeSession(tutorUserId: string, bookingId: string) {
    const completedBookingId = await this.prisma.$transaction(async (tx: Tx) => {
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, tutorProfile: { userId: tutorUserId } },
      });
      if (!booking) throw new NotFoundError('BOOKING_NOT_FOUND');
      BookingStateMachine.assertCanTransition(toBookingState(booking.status as string), 'COMPLETED', 'TUTOR');
      const { count } = await tx.booking.updateMany({
        where: { id: booking.id, status: 'IN_PROGRESS' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      if (count !== 1) throw new ConflictError('BOOKING_STATE_CHANGED');
      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          fromStatus: 'IN_PROGRESS' as never,
          toStatus: 'COMPLETED' as never,
          actor: 'TUTOR' as never,
          actorUserId: tutorUserId,
        },
      });
      await this.journal(tx, booking, `Séance du ${when(booking.startAt)} terminée.`);
      await this.outbox.write(tx, {
        aggregateType: 'booking',
        aggregateId: booking.id,
        eventType: 'session.completed',
        recipientIds: [booking.requesterId],
        payload: { bookingId: booking.id, reviewable: true },
        pushTitle: 'Séance terminée',
        pushBody: 'Évaluez votre séance.',
      });
      return booking.id;
    });
    return this.getForUser(tutorUserId, completedBookingId);
  }

  /** Clôture automatique par le SYSTEM 3 h après endAt (job planifié). */
  async autoCompleteStaleSessions(): Promise<number> {
    return this.prisma.$transaction(async (tx: Tx) => {
      const stale = await tx.booking.findMany({
        where: { status: 'IN_PROGRESS', endAt: { lt: new Date(Date.now() - 3 * 3_600_000) } },
      });
      for (const b of stale) {
        await tx.booking.update({ where: { id: b.id }, data: { status: 'COMPLETED', completedAt: new Date() } });
        await tx.bookingEvent.create({
          data: {
            bookingId: b.id,
            fromStatus: 'IN_PROGRESS' as never,
            toStatus: 'COMPLETED' as never,
            actor: 'SYSTEM' as never,
            reason: 'AUTO_CLOSE',
          },
        });
        await this.outbox.write(tx, {
          aggregateType: 'booking',
          aggregateId: b.id,
          eventType: 'session.completed',
          recipientIds: [b.requesterId],
          payload: { bookingId: b.id, reviewable: true },
          pushTitle: 'Séance terminée',
          pushBody: 'Évaluez votre séance.',
        });
      }
      return stale.length;
    });
  }

  /**
   * Réservations du compte connecté. Le paramètre status accepte une liste séparée par des
   * virgules (« CONFIRMED,IN_PROGRESS ») : un onglet de l'app = UNE requête.
   */
  async listMine(userId: string, role: 'requester' | 'tutor', status?: string, limit = 50) {
    const statuses = status
      ? status.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean)
      : [];
    const where = {
      ...(role === 'requester' ? { requesterId: userId } : { tutorProfile: { userId } }),
      ...(statuses.length ? { status: { in: statuses as never[] } } : {}),
    };
    const bookings = await this.prisma.booking.findMany({
      where,
      orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
      take: Math.min(Math.max(limit, 1), 100),
      include: bookingResponseInclude,
    });
    const conversations = await this.conversationIds(bookings);
    const competing = role === 'tutor' ? await this.competingRequests(bookings) : new Map<string, CompetingRequest[]>();
    return bookings.map((booking) =>
      this.toResponse(booking, role === 'requester' ? 'REQUESTER' : 'TUTOR', conversations.get(pairKey(booking)) ?? null, competing.get(booking.id) ?? []),
    );
  }

  async getForUser(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, OR: [{ requesterId: userId }, { tutorProfile: { userId } }] },
      include: bookingResponseInclude,
    });
    if (!booking) throw new NotFoundError('BOOKING_NOT_FOUND');
    const conversations = await this.conversationIds([booking]);
    const isRequester = booking.requesterId === userId;
    const competing = isRequester ? new Map<string, CompetingRequest[]>() : await this.competingRequests([booking]);
    return this.toResponse(
      booking,
      isRequester ? 'REQUESTER' : 'TUTOR',
      conversations.get(pairKey(booking)) ?? null,
      competing.get(booking.id) ?? [],
    );
  }

  /**
   * Pour chaque demande EN ATTENTE, les autres demandes en attente du même tuteur dont l'horaire chevauche le sien.
   * Accepter l'une d'elles refuse automatiquement les autres : le tuteur doit le savoir avant de choisir.
   */
  private async competingRequests(bookings: BookingResponseRecord[]): Promise<Map<string, CompetingRequest[]>> {
    const result = new Map<string, CompetingRequest[]>();
    const pending = bookings.filter((b) => b.status === 'PENDING');
    if (!pending.length) return result;
    const rows = await this.prisma.booking.findMany({
      where: {
        status: 'PENDING',
        tutorProfileId: { in: [...new Set(pending.map((b) => b.tutorProfileId))] },
        startAt: { lt: new Date(Math.max(...pending.map((b) => b.endAt.getTime()))) },
        endAt: { gt: new Date(Math.min(...pending.map((b) => b.startAt.getTime()))) },
      },
      select: {
        id: true, tutorProfileId: true, startAt: true, endAt: true, createdAt: true,
        requester: { select: { firstName: true, lastName: true } },
        beneficiary: { select: { firstName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    for (const b of pending) {
      const others = rows.filter(
        (o) => o.id !== b.id && o.tutorProfileId === b.tutorProfileId && o.startAt < b.endAt && o.endAt > b.startAt,
      );
      if (others.length) {
        result.set(b.id, others.map((o) => ({
          id: o.id,
          beneficiaryFirstName: o.beneficiary.firstName,
          requesterName: `${o.requester.firstName} ${o.requester.lastName}`.trim(),
          startAt: o.startAt,
          endAt: o.endAt,
          createdAt: o.createdAt,
        })));
      }
    }
    return result;
  }

  /**
   * Conversation de chaque paire demandeur/tuteur (ADR-12 : une par paire). Se fier à
   * Conversation.bookingId laisserait conversationId à null sur toute réservation plus ancienne.
   */
  private async conversationIds(bookings: { requesterId: string; tutorProfileId: string }[]) {
    const pairs = [...new Map(bookings.map((b) => [pairKey(b), b])).values()];
    if (!pairs.length) return new Map<string, string>();
    const conversations = await this.prisma.conversation.findMany({
      where: { OR: pairs.map((p) => ({ requesterId: p.requesterId, tutorProfileId: p.tutorProfileId })) },
      select: { id: true, requesterId: true, tutorProfileId: true },
    });
    return new Map(conversations.map((c) => [pairKey(c), c.id]));
  }

  /** Trace un événement de réservation dans la conversation de la paire (message SYSTEM, jamais du texte utilisateur). */
  private async journal(tx: Tx, b: { requesterId: string; tutorProfileId: string }, text: string): Promise<void> {
    const conversation = await tx.conversation.findUnique({
      where: { requesterId_tutorProfileId: { requesterId: b.requesterId, tutorProfileId: b.tutorProfileId } },
      select: { id: true },
    });
    if (!conversation) return;
    await tx.message.create({ data: { conversationId: conversation.id, senderId: null, type: 'SYSTEM', systemText: text } });
    await tx.conversation.update({ where: { id: conversation.id }, data: systemPreview(text) });
  }

  private async transitionAsTutor(tutorUserId: string, bookingId: string, to: 'REFUSED', reason: string | null) {
    const refusedBookingId = await this.prisma.$transaction(async (tx: Tx) => {
      const tutor = await tx.tutorProfile.findFirst({ where: { userId: tutorUserId } });
      const booking = await tx.booking.findFirst({ where: { id: bookingId, tutorProfileId: tutor?.id } });
      if (!booking) throw new NotFoundError('BOOKING_NOT_FOUND');
      BookingStateMachine.assertCanTransition(toBookingState(booking.status as string), to, 'TUTOR');
      const from = booking.status as string;
      const { count } = await tx.booking.updateMany({
        where: { id: booking.id, status: 'PENDING' },
        data: { status: to, refusalReason: reason },
      });
      if (count !== 1) throw new ConflictError('BOOKING_STATE_CHANGED');
      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          fromStatus: from as never,
          toStatus: to as never,
          actor: 'TUTOR' as never,
          actorUserId: tutorUserId,
          reason,
        },
      });
      await this.journal(tx, booking, `Demande refusée : séance du ${when(booking.startAt)}.`);
      await this.outbox.write(tx, {
        aggregateType: 'booking',
        aggregateId: booking.id,
        eventType: 'booking.refused',
        recipientIds: [booking.requesterId],
        payload: { bookingId: booking.id, reason, by: 'TUTOR' },
        pushTitle: 'Demande refusée',
        pushBody: 'Le tuteur a refusé votre demande.',
      });
      return booking.id;
    });
    return this.getForUser(tutorUserId, refusedBookingId);
  }

  private toResponse(
    b: BookingResponseRecord,
    viewerRole: 'REQUESTER' | 'TUTOR',
    conversationId: string | null,
    competingRequests: CompetingRequest[] = [],
  ) {
    return {
      id: b.id,
      status: b.status,
      viewerRole,
      startAt: b.startAt,
      endAt: b.endAt,
      teachingMode: b.teachingMode,
      offer: {
        id: b.offer.id,
        title: b.offer.title,
        subject: {
          id: b.offer.subject.id,
          name: b.offer.subject.name,
          category: b.offer.subject.category,
          description: b.offer.subject.description,
        },
        educationLevel: b.offer.educationLevel
          ? {
              id: b.offer.educationLevel.id,
              name: b.offer.educationLevel.name,
              category: b.offer.educationLevel.category,
              displayOrder: b.offer.educationLevel.displayOrder,
            }
          : null,
        format: b.offer.format,
        durationMinutes: b.offer.durationMinutes,
        price: { amount: b.price.toString(), currency: b.currency },
        isActive: b.offer.isActive,
      },
      tutor: {
        id: b.tutorProfile.id,
        firstName: b.tutorProfile.user.firstName,
        lastName: b.tutorProfile.user.lastName,
        displayName: b.tutorProfile.displayName,
        profilePhoto: b.tutorProfile.profilePhoto,
        gender: b.tutorProfile.gender,
        rating: b.tutorProfile.rating,
        reviewsCount: b.tutorProfile.reviewsCount,
        isVerified: b.tutorProfile.isVisible,
      },
      requester: b.requester,
      beneficiary: {
        id: b.beneficiary.id,
        firstName: b.beneficiary.firstName,
        lastName: b.beneficiary.lastName,
        relationship: b.beneficiary.relationship,
        educationLevel: b.beneficiary.educationLevel
          ? {
              id: b.beneficiary.educationLevel.id,
              name: b.beneficiary.educationLevel.name,
              category: b.beneficiary.educationLevel.category,
              displayOrder: b.beneficiary.educationLevel.displayOrder,
            }
          : null,
        difficultyType: b.beneficiary.difficultyType,
        objective: b.beneficiary.objective,
      },
      availabilityId: b.availabilityId,
      placeId: b.placeId,
      price: { amount: b.price.toString(), currency: b.currency },
      offerTitle: b.offerTitle,
      locationLabel: b.locationLabel,
      locationAddress: viewerRole === 'TUTOR' && b.status === 'PENDING' ? null : b.locationAddress,
      latitude: viewerRole === 'TUTOR' && b.status === 'PENDING' ? null : b.latitude,
      longitude: viewerRole === 'TUTOR' && b.status === 'PENDING' ? null : b.longitude,
      requesterNote: b.requesterNote,
      startedAt: b.startedAt,
      completedAt: b.completedAt,
      cancelledBy: b.cancelledBy,
      cancellationReason: b.cancellationReason,
      refusalReason: b.refusalReason,
      conversationId,
      hasReview: Boolean(b.review),
      /** Vue tuteur d'une demande en attente : autres demandes sur le même horaire (accepter l'une refuse les autres). */
      competingRequests,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    };
  }
}
