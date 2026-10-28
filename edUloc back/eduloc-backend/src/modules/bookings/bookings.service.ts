import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CryptoService } from '../../core/crypto/crypto.service';
import { AppConfig } from '../../core/config/app.config';
import { ConflictError, DomainError, ForbiddenError, NotFoundError, UnprocessableError } from '../../common/errors/domain-errors';
import { RateLimitService } from '../../common/rate-limit.service';
import { OutboxWriter, type OutboxEventInput } from '../../infrastructure/outbox/outbox-writer';
import { BookingStateMachine, BookingActor, BookingState } from './domain/booking-state-machine';
import { SlotPolicy, TeachingMode, AvailabilityRule } from './domain/slot-policy';
import { SessionPolicy } from './domain/session-policy';
import { BookingPolicy } from './domain/booking-policy';
import { BookingsRepository, Tx } from './bookings.repository';
import { CancelBookingDto, CreateBookingDto, RefuseBookingDto } from './dto';
import { RoomReservationService, ROOM_INVALID_CHOICE } from './room-reservation.service';
import { MarginConfig, MarginPolicy, locationKeyOf } from './domain/margin-policy';
import { AcceptanceConflictError } from './domain/acceptance-conflict';
import { allowedDurations } from './domain/offer-durations';
import { PriceBreakdown, computePriceBreakdown, travelFeeForDistance } from './domain/pricing';
import { resolveTravel } from './domain/travel';
import { BookingHoldsService } from './booking-holds.service';
import { approximateDistance } from '../search/domain/public-location';

/** Échecs de finalisation après lesquels le blocage temporaire est libéré (le Demandeur doit refaire un devis). */
const HOLD_RELEASING_ERRORS: ReadonlySet<string> = new Set([
  'SLOT_UNAVAILABLE', 'SLOT_HELD', 'SLOT_TOO_CLOSE', 'SLOT_OUTSIDE_AVAILABILITY', 'ROOM_UNAVAILABLE', 'ROOM_HELD', 'ROOM_CLOSED',
  'ROOM_NOT_BOOKABLE', 'ROOM_NOT_ACCEPTED_BY_TUTOR', 'OUT_OF_TRAVEL_ZONE', 'PRICE_CHANGED', 'OFFER_NOT_BOOKABLE',
]);

const toBookingState = (s: string): BookingState =>
  s as BookingState;

const bookingResponseInclude = {
  offer: { include: { subject: true, educationLevel: true } },
  tutorProfile: { include: { user: true } },
  requester: { select: { id: true, firstName: true, lastName: true } },
  beneficiary: { include: { educationLevel: true } },
  review: { select: { id: true } },
  room: { select: { id: true, name: true, zoneLabel: true, capacity: true } },
} satisfies Prisma.BookingInclude;

/**
 * Statuts à partir desquels l'adresse exacte et les instructions d'accès d'une salle partenaire peuvent être renvoyées
 * (spec 9). Avant, et après une annulation, elles ne sortent JAMAIS de l'API, quelle que soit la personne.
 */
const ROOM_REVEAL_STATUSES: ReadonlySet<string> = new Set(['CONFIRMED', 'IN_PROGRESS', 'COMPLETED']);

type BookingResponseRecord = Prisma.BookingGetPayload<{ include: typeof bookingResponseInclude }>;

interface CompetingRequest {
  id: string;
  beneficiaryFirstName: string;
  requesterName: string;
  startAt: Date;
  endAt: Date;
  createdAt: Date;
}

/** Texte du message qui transmet le code : « Code de séance : 482 913 ». */
const sharedCodeText = (otp: string) => `Code de séance : ${otp.slice(0, 3)} ${otp.slice(3)}`;

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
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: BookingsRepository,
    private readonly crypto: CryptoService,
    private readonly outbox: OutboxWriter,
    private readonly rateLimit: RateLimitService,
    private readonly cfg: AppConfig,
    private readonly rooms: RoomReservationService,
    private readonly holds: BookingHoldsService,
  ) {}

  private get margins(): MarginConfig {
    return { bufferMinutes: this.cfg.bookingBufferMinutes, travelBufferMinutes: this.cfg.bookingTravelBufferMinutes };
  }

  /**
   * Vérifie une demande de réservation et calcule son prix SANS rien créer : tout ce qui rend un créneau réservable
   * (disponibilité du Tuteur, salle, marges, zone de déplacement, blocages des autres Demandeurs) est décidé ici, côté
   * serveur, dans la transaction appelante. Partagé par le devis (qui pose le blocage) et la création (qui le consomme).
   */
  private async prepare(tx: Tx, requesterId: string, dto: CreateBookingDto) {
    const isRoom = dto.teachingMode === 'PARTNER_ROOM';
    if (isRoom && !dto.roomId) throw new UnprocessableError('ROOM_REQUIRED');
    if (!isRoom && dto.roomId) throw new UnprocessableError('ROOM_NOT_ALLOWED_FOR_MODE');
    const offer = await this.repo.findBookableOffer(tx, dto.offerId);
    if (!offer) throw new NotFoundError('OFFER_NOT_BOOKABLE');

    await this.repo.lockTutor(tx, offer.tutorProfileId);

    const beneficiary = await tx.beneficiary.findFirst({
      where: { id: dto.beneficiaryId, requesterId },
      include: { educationLevel: { select: { category: true } } },
    });
    if (!beneficiary) throw new ForbiddenError('BENEFICIARY_NOT_OWNED');
    const atHome = dto.teachingMode === 'AT_HOME_BENEFICIARY';
    if (atHome && !dto.beneficiaryAddress?.trim()) throw new UnprocessableError('BENEFICIARY_ADDRESS_REQUIRED');
    if (isRoom && offer.format === 'ONLINE') throw new UnprocessableError('OFFER_FORMAT_MISMATCH');

    const durationMinutes = dto.durationMinutes ?? offer.durationMinutes;
    if (!allowedDurations(offer).includes(durationMinutes)) throw new UnprocessableError('DURATION_NOT_OFFERED');
    // Le prix de l'offre vaut pour sa durée par défaut ; les autres durées sont proportionnelles (à confirmer).
    const price = offer.price.mul(durationMinutes).div(offer.durationMinutes).toDecimalPlaces(2);

    const startAt = new Date(dto.startAt);
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
    // Préavis mesuré à l'envoi de la demande (spec 4.5, point 13.6 à confirmer) : la vérification est ici, côté
    // backend, et ne dépend pas du frontend.
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
    // Un autre Demandeur finalise déjà sa réservation sur ce créneau (blocage temporaire).
    if (await this.holds.tutorHeldByOther(tx, offer.tutorProfileId, startAt, endAt, requesterId)) throw new ConflictError('SLOT_HELD');

    // Lieu de la séance en présentiel chez le Tuteur / en lieu public : celui choisi par le Demandeur, sinon celui de la
    // plage, sinon l'unique lieu de ce type. Sans lui, la séance serait créée sans lieu ni adresse (« présentiel non détaillé »).
    const place = await this.resolvePlace(tx, offer.tutorProfileId, dto.teachingMode as TeachingMode, dto.placeId, rule.placeId);
    // Marges avant / après et de déplacement entre deux lieux en présentiel (spec 4.4).
    const candidateKey = locationKeyOf({
      teachingMode: dto.teachingMode, roomId: dto.roomId, placeId: place?.id, address: dto.beneficiaryAddress,
    });
    const neighbours = await this.repo.tutorNeighbours(
      tx, offer.tutorProfileId, startAt, endAt, MarginPolicy.maxGapMinutes(this.margins),
    );
    if (MarginPolicy.findConflict({ startAt, endAt, locationKey: candidateKey }, neighbours, this.margins)) {
      throw new ConflictError('SLOT_TOO_CLOSE');
    }

    // Salle partenaire : vérifiée ici pour ne pas créer de demande vouée à l'échec ; la salle n'est RÉSERVÉE qu'à
    // l'acceptation (le blocage temporaire du devis la protège entre-temps).
    let room: Awaited<ReturnType<RoomReservationService['check']>>['room'];
    if (isRoom) {
      await this.rooms.lock(tx, dto.roomId!);
      const checked = await this.rooms.check(tx, {
        roomId: dto.roomId!,
        tutorProfileId: offer.tutorProfileId,
        startAt,
        endAt,
        participantsCount: dto.participantsCount ?? 1,
        requiredEquipment: dto.requiredEquipment ?? [],
        beneficiary,
      });
      if (checked.failure) {
        throw ROOM_INVALID_CHOICE.has(checked.failure)
          ? new UnprocessableError(checked.failure)
          : checked.failure === 'ROOM_NOT_BOOKABLE'
            ? new NotFoundError(checked.failure)
            : new ConflictError(checked.failure);
      }
      room = checked.room;
      if (await this.holds.roomHeldByOther(tx, room!.id, startAt, endAt, requesterId)) throw new ConflictError('ROOM_HELD');
    }

    // Déplacement du Tuteur chez le Bénéficiaire : forfait par tranche selon la distance entre sa position de référence
    // et l'adresse APPROXIMATIVE du Demandeur ; hors de sa zone, la demande est refusée.
    let travel: { distanceM: number; fee: number } | null = null;
    if (atHome) {
      const tutorPlaces = await tx.place.findMany({
        where: { tutorProfileId: offer.tutorProfileId, isActive: true, type: { in: ['BENEFICIARY_HOME', 'TUTOR_HOME'] } },
        select: { type: true, latitude: true, longitude: true, radius: true },
      });
      const hasReference = tutorPlaces.some((p) => p.latitude !== null && p.longitude !== null);
      if (hasReference) {
        if (dto.beneficiaryLatitude === undefined || dto.beneficiaryLongitude === undefined) {
          throw new UnprocessableError('BENEFICIARY_COORDINATES_REQUIRED');
        }
        const resolved = resolveTravel(tutorPlaces, { lat: dto.beneficiaryLatitude, lng: dto.beneficiaryLongitude });
        if (resolved.kind === 'OUT_OF_ZONE') throw new UnprocessableError('OUT_OF_TRAVEL_ZONE');
        if (resolved.kind === 'OK') travel = { distanceM: resolved.distanceM, fee: travelFeeForDistance(resolved.distanceM) };
      }
    }

    const roomFee = room?.pricePerHour ? room.pricePerHour.mul(durationMinutes).div(60).toDecimalPlaces(2) : null;
    // Taux global au MVP : les colonnes commissionRate du Tuteur et de la salle sont prévues mais non lues.
    const pricing = computePriceBreakdown({
      tutorFee: price.toNumber(), travelFee: travel?.fee ?? 0, roomFee: roomFee?.toNumber() ?? 0,
      commissionRate: this.cfg.platformCommissionRate,
    });
    return { offer, beneficiary, durationMinutes, price, startAt, endAt, rule, place, room, roomFee, travel, pricing, isRoom, atHome };
  }

  private async resolvePlace(tx: Tx, tutorProfileId: string, mode: TeachingMode, requestedId?: string, ruleId?: string | null) {
    const type = mode === 'AT_HOME_TUTOR' ? 'TUTOR_HOME' : mode === 'PUBLIC_PLACE' ? 'PUBLIC_PLACE' : null;
    if (!type) return ruleId ? tx.place.findUnique({ where: { id: ruleId } }) : null;
    const candidates = await tx.place.findMany({ where: { tutorProfileId, isActive: true, type }, orderBy: { createdAt: 'asc' } });
    const wanted = requestedId ?? ruleId;
    if (wanted) {
      const chosen = candidates.find((p) => p.id === wanted);
      if (!chosen) throw new UnprocessableError('PLACE_NOT_FOUND');
      return chosen;
    }
    if (candidates.length === 1) return candidates[0];
    throw new UnprocessableError(candidates.length ? 'PLACE_REQUIRED' : 'PLACE_NOT_FOUND');
  }

  /**
   * Devis : vérifie la demande, calcule le prix détaillé et BLOQUE le créneau (Tuteur + salle) pendant
   * BOOKING_HOLD_MINUTES. Sans finalisation (POST /bookings avec `holdId`) dans ce délai, le blocage expire seul.
   */
  async quote(requesterId: string, dto: CreateBookingDto) {
    await this.rateLimit.consume(`rl:booking-quote:${requesterId}`, 30, 3600);
    return this.prisma.$transaction(async (tx: Tx) => {
      const p = await this.prepare(tx, requesterId, dto);
      const hold = await this.holds.create(tx, {
        requesterId, beneficiaryId: p.beneficiary.id, offerId: p.offer.id, tutorProfileId: p.offer.tutorProfileId,
        roomId: p.room?.id ?? null, teachingMode: dto.teachingMode, startAt: p.startAt, endAt: p.endAt,
        durationMinutes: p.durationMinutes, totalAmount: p.pricing.total.toFixed(2),
      });
      return {
        holdId: hold.id,
        expiresAt: hold.expiresAt,
        durationMinutes: p.durationMinutes,
        currency: p.offer.currency,
        pricing: this.pricingResponse(p.pricing, p.offer.currency),
        // Distance arrondie : la position du Tuteur n'est jamais déductible de ce devis.
        travel: p.travel ? { distanceM: approximateDistance(p.travel.distanceM), fee: p.travel.fee } : null,
      };
    }, { timeout: 10_000 });
  }

  private pricingResponse(p: PriceBreakdown, currency: string) {
    const money = (n: number) => ({ amount: n.toFixed(2), currency });
    return {
      tutorFee: money(p.tutorFee),
      travelFee: money(p.travelFee),
      roomFee: money(p.roomFee),
      serviceFee: money(p.serviceFee),
      serviceFeeRate: p.serviceFeeRate,
      total: money(p.total),
    };
  }

  async createBooking(requesterId: string, dto: CreateBookingDto) {
    await this.rateLimit.consume(`rl:booking:${requesterId}`, 10, 3600);
    try {
      return await this.createBookingOnce(requesterId, dto);
    } catch (err) {
      // La transaction annulée emporte la mise à jour du blocage : si la finalisation échoue parce qu'une ressource n'est
      // plus disponible ou que le prix a changé, on le libère ici pour que le demandeur puisse recommencer sans attendre.
      if (dto.holdId && err instanceof DomainError && HOLD_RELEASING_ERRORS.has(err.code)) await this.holds.release(dto.holdId);
      throw err;
    }
  }

  private async createBookingOnce(requesterId: string, dto: CreateBookingDto) {
    const bookingId = await this.prisma.$transaction(async (tx: Tx) => {
      const p = await this.prepare(tx, requesterId, dto);
      const { offer, beneficiary, durationMinutes, price, startAt, endAt, rule, place, room, roomFee, travel, pricing } = p;

      if (dto.holdId) {
        const hold = await tx.bookingHold.findFirst({ where: { id: dto.holdId, requesterId } });
        if (!hold) throw new NotFoundError('HOLD_NOT_FOUND');
        if (hold.status !== 'ACTIVE') throw new ConflictError(hold.status === 'EXPIRED' ? 'HOLD_EXPIRED' : 'HOLD_NOT_ACTIVE');
        if (hold.expiresAt <= new Date()) throw new ConflictError('HOLD_EXPIRED');
        const same = hold.offerId === offer.id && hold.beneficiaryId === beneficiary.id
          && hold.teachingMode === dto.teachingMode && hold.roomId === (room?.id ?? null)
          && hold.startAt.getTime() === startAt.getTime() && hold.durationMinutes === durationMinutes;
        if (!same) throw new UnprocessableError('HOLD_MISMATCH');
        // Le total annoncé fait foi : s'il a changé entre-temps (tarif, salle, zone), le Demandeur doit le revalider.
        if (hold.totalAmount.toFixed(2) !== pricing.total.toFixed(2)) throw new ConflictError('PRICE_CHANGED');
      }

      // Demandes déjà en attente sur le même horaire : le tuteur doit pouvoir arbitrer en connaissance de cause.
      const competing = await tx.booking.count({
        where: { tutorProfileId: offer.tutorProfileId, status: 'PENDING', startAt: { lt: endAt }, endAt: { gt: startAt } },
      });

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
          roomId: room?.id ?? null,
          startAt,
          endAt,
          status: 'PENDING',
          teachingMode: dto.teachingMode as never,
          price,
          offerTitle: offer.title,
          // Salle partenaire : seule la zone approximative est enregistrée à ce stade. L'adresse exacte, la position
          // et les instructions d'accès sont copiées à la confirmation seulement (spec 9).
          locationLabel: room
            ? [room.name, room.zoneLabel].filter(Boolean).join(' — ')
            : dto.teachingMode === 'ONLINE'
              ? 'En ligne'
              : dto.teachingMode === 'AT_HOME_BENEFICIARY'
                ? 'Domicile du bénéficiaire'
                : place?.label ?? null,
          locationAddress: room
            ? null
            : dto.teachingMode === 'AT_HOME_BENEFICIARY'
              ? dto.beneficiaryAddress?.trim() ?? null
              : place?.address ?? null,
          latitude: room ? null : p.atHome ? dto.beneficiaryLatitude ?? null : place?.latitude ?? null,
          longitude: room ? null : p.atHome ? dto.beneficiaryLongitude ?? null : place?.longitude ?? null,
          requesterNote: dto.requesterNote?.trim() || null,
          participantsCount: dto.participantsCount ?? 1,
          requiredEquipment: dto.requiredEquipment ?? [],
          roomFee,
          // Décomposition figée : montant Tuteur (price + déplacement), partenaire (roomFee), EduLoc (serviceFee), total payé.
          travelFee: pricing.travelFee,
          travelDistanceM: travel?.distanceM ?? null,
          serviceFee: pricing.serviceFee,
          serviceFeeRate: pricing.serviceFeeRate,
          totalAmount: pricing.total,
        },
      });
      if (dto.holdId) await this.holds.consume(tx, dto.holdId, booking.id);
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
    let accepted: { bookingId: string; otp: string };
    try {
      accepted = await this.acceptInTransaction(tutorUserId, bookingId);
    } catch (err) {
      // La transaction est annulée (ni séance ni salle confirmées) : le conflit est tracé et notifié à part (spec 7.3).
      if (err instanceof AcceptanceConflictError) await this.recordAcceptanceConflict(bookingId, err);
      throw err;
    }
    const booking = await this.getForUser(tutorUserId, accepted.bookingId);
    return { ...booking, startOtp: accepted.otp };
  }

  /**
   * Revérification complète et confirmation, en UNE transaction (spec 7.2) : séance et salle sont la même ligne, donc
   * confirmées ensemble ou pas du tout. Verrous pris toujours dans le même ordre : Tuteur, puis salle.
   */
  private async acceptInTransaction(tutorUserId: string, bookingId: string): Promise<{ bookingId: string; otp: string }> {
    return this.prisma.$transaction(async (tx: Tx) => {
      const tutor = await tx.tutorProfile.findFirst({
        where: { userId: tutorUserId, isVisible: true, suspendedAt: null },
      });
      if (!tutor) throw new ForbiddenError('TUTOR_NOT_APPROVED');
      await this.repo.lockTutor(tx, tutor.id);

      const booking = await tx.booking.findFirst({
        where: { id: bookingId, tutorProfileId: tutor.id },
        include: { offer: true, beneficiary: { include: { educationLevel: { select: { category: true } } } } },
      });
      if (!booking) throw new NotFoundError('BOOKING_NOT_FOUND');
      BookingStateMachine.assertCanTransition(toBookingState(booking.status as string), 'CONFIRMED', 'TUTOR');

      const conflict = await this.repo.blockingOverlap(tx, tutor.id, booking.startAt, booking.endAt, booking.id);
      if (conflict) throw new AcceptanceConflictError('SLOT_NO_LONGER_AVAILABLE', 'OVERLAPPING_BOOKINGS', 'TUTOR_OVERLAP');
      const neighbours = await this.repo.tutorNeighbours(
        tx, tutor.id, booking.startAt, booking.endAt, MarginPolicy.maxGapMinutes(this.margins), booking.id,
      );
      const candidate = {
        startAt: booking.startAt,
        endAt: booking.endAt,
        locationKey: locationKeyOf({
          teachingMode: booking.teachingMode, roomId: booking.roomId, placeId: booking.placeId, address: booking.locationAddress,
        }),
      };
      if (MarginPolicy.findConflict(candidate, neighbours, this.margins)) {
        throw new AcceptanceConflictError('SLOT_NO_LONGER_AVAILABLE', 'OVERLAPPING_BOOKINGS', 'TUTOR_MARGIN');
      }

      // Données de lieu copiées à la confirmation d'une salle partenaire (et seulement alors).
      let roomReveal: { locationLabel: string; locationAddress: string | null; latitude: number | null; longitude: number | null; roomAccessInstructions: string | null } | null = null;
      if (booking.roomId) {
        const bookable = await this.repo.findBookableOffer(tx, booking.offerId);
        if (!bookable) throw new AcceptanceConflictError('SLOT_NO_LONGER_AVAILABLE', 'OFFER_INACTIVE', 'OFFER_NOT_BOOKABLE');
        await this.assertTutorStillAvailable(tx, booking);

        await this.rooms.lock(tx, booking.roomId);
        const checked = await this.rooms.check(tx, {
          roomId: booking.roomId,
          tutorProfileId: tutor.id,
          startAt: booking.startAt,
          endAt: booking.endAt,
          participantsCount: booking.participantsCount,
          requiredEquipment: booking.requiredEquipment,
          beneficiary: booking.beneficiary,
          excludeBookingId: booking.id,
        });
        if (checked.failure) {
          throw new AcceptanceConflictError('ROOM_NO_LONGER_AVAILABLE', 'ROOM_UNAVAILABLE', checked.failure);
        }
        const room = checked.room;
        roomReveal = {
          locationLabel: [room.name, room.zoneLabel].filter(Boolean).join(' — '),
          locationAddress: [room.addressLine, room.city].filter(Boolean).join(', ') || null,
          latitude: room.latitude,
          longitude: room.longitude,
          roomAccessInstructions: room.accessInstructions,
        };
      }

      const otp = this.crypto.generateOtp();
      const { count } = await tx.booking.updateMany({
        where: { id: booking.id, status: 'PENDING' },
        data: {
          status: 'CONFIRMED',
          startOtpCipher: this.crypto.encrypt(otp),
          otpExpiresAt: booking.endAt,
          otpAttempts: 0,
          ...(roomReveal ?? {}),
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
  }

  /** Le Tuteur couvre-t-il encore le créneau (plages actives, périodes bloquées) ? Sinon : conflit à l'acceptation. */
  private async assertTutorStillAvailable(
    tx: Tx,
    booking: { tutorProfileId: string; offerId: string; startAt: Date; endAt: Date; teachingMode: string },
  ): Promise<void> {
    const rawRules = await tx.availability.findMany({
      where: { tutorProfileId: booking.tutorProfileId, isActive: true },
      include: { place: true },
    });
    const rules: AvailabilityRule[] = rawRules.map((r) => ({
      id: r.id, dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime, timezone: r.timezone,
      validFrom: r.validFrom, validUntil: r.validUntil, isActive: r.isActive, offerId: r.offerId, placeId: r.placeId,
      placeType: r.place?.type ?? null,
    }));
    const blocked = await tx.blockedPeriod.findFirst({
      where: { tutorProfileId: booking.tutorProfileId, startAt: { lt: booking.endAt }, endAt: { gt: booking.startAt } },
      select: { id: true },
    });
    if (blocked || !SlotPolicy.matchRule(rules, booking.startAt, booking.endAt, booking.teachingMode as TeachingMode, undefined, booking.offerId)) {
      throw new AcceptanceConflictError('SLOT_NO_LONGER_AVAILABLE', 'TUTOR_UNAVAILABLE', 'TUTOR_NOT_AVAILABLE');
    }
  }

  /**
   * Trace le conflit et informe le Demandeur ET le Tuteur (une seule fois par type de conflit). La demande reste PENDING :
   * le Demandeur est invité à choisir un autre créneau ou une autre salle, rien n'est déplacé automatiquement.
   */
  private async recordAcceptanceConflict(bookingId: string, err: AcceptanceConflictError): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx: Tx) => {
        const booking = await tx.booking.findFirst({
          where: { id: bookingId, status: 'PENDING' },
          include: { tutorProfile: { select: { userId: true } } },
        });
        if (!booking) return;
        const existing = await tx.conflict.findUnique({
          where: { bookingId_type: { bookingId, type: err.conflictType } },
        });
        const details = { code: err.code, reason: err.reason, detectedAt: new Date().toISOString() };
        await tx.conflict.upsert({
          where: { bookingId_type: { bookingId, type: err.conflictType } },
          create: { bookingId, type: err.conflictType, details },
          update: { details, ...(existing && existing.status !== 'OPEN' ? { status: 'OPEN' as const, resolvedAt: null, resolvedById: null, resolution: null } : {}) },
        });
        if (existing?.status === 'OPEN') return;
        await this.outbox.writeMany(tx, [
          {
            aggregateType: 'booking',
            aggregateId: bookingId,
            eventType: 'booking.conflict',
            recipientIds: [booking.requesterId],
            payload: { bookingId, conflict: err.conflictType },
            pushTitle: 'Créneau indisponible',
            pushBody: 'Le créneau demandé n’est plus disponible. Choisissez un autre créneau ou une autre salle.',
          },
          {
            aggregateType: 'booking',
            aggregateId: bookingId,
            eventType: 'booking.conflict',
            recipientIds: [booking.tutorProfile.userId],
            payload: { bookingId, conflict: err.conflictType },
            pushTitle: 'Demande impossible à confirmer',
            pushBody: 'Le créneau n’est plus disponible : la demande reste en attente et le demandeur a été invité à choisir un autre créneau.',
          },
        ]);
      });
    } catch (traceError) {
      // La trace d'un conflit ne doit jamais masquer l'erreur 409 renvoyée au Tuteur.
      this.logger.warn(`Conflit d'acceptation non tracé (${bookingId}) : ${(traceError as Error).message}`);
    }
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
      if (booking.startOtpCipher) await this.scrubSharedCode(tx, booking, this.crypto.decrypt(booking.startOtpCipher));
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

  /**
   * Cours EN LIGNE uniquement : le Demandeur envoie son code au Tuteur dans la conversation, là où il ne peut pas le lire
   * à voix haute en face. Ce n'est PAS un texte libre : un message SYSTEM au contenu fixé par le serveur. En présentiel
   * le code reste la preuve de présence du Tuteur et ne circule pas par message. Le code écrit dans le fil est remplacé
   * dès qu'il est utilisé ou que la réservation est annulée.
   */
  async shareOtp(requesterId: string, bookingId: string) {
    await this.rateLimit.consume(`rl:otp-share:${bookingId}`, 5, 3600);
    await this.prisma.$transaction(async (tx: Tx) => {
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, requesterId },
        include: { tutorProfile: { select: { userId: true } } },
      });
      if (!booking) throw new NotFoundError('BOOKING_NOT_FOUND');
      if (booking.status !== 'CONFIRMED' || !booking.startOtpCipher) throw new UnprocessableError('OTP_NOT_AVAILABLE');
      if (booking.teachingMode !== 'ONLINE') throw new UnprocessableError('OTP_SHARE_ONLINE_ONLY');

      const conversation = await tx.conversation.findUnique({
        where: { requesterId_tutorProfileId: { requesterId, tutorProfileId: booking.tutorProfileId } },
        select: { id: true },
      });
      if (!conversation) throw new NotFoundError('CONVERSATION_NOT_FOUND');
      const text = sharedCodeText(this.crypto.decrypt(booking.startOtpCipher));
      await tx.message.create({ data: { conversationId: conversation.id, senderId: null, type: 'SYSTEM', systemText: text } });
      // Les listes de conversations n'affichent jamais le code : l'aperçu est neutre.
      await tx.conversation.update({ where: { id: conversation.id }, data: systemPreview('Code de séance envoyé') });
      await this.outbox.write(tx, {
        aggregateType: 'booking',
        aggregateId: booking.id,
        eventType: 'message.system.created',
        recipientIds: [booking.tutorProfile.userId],
        payload: { bookingId: booking.id, conversationId: conversation.id },
        pushTitle: 'Code de séance reçu',
        pushBody: 'Le bénéficiaire vous a envoyé le code pour démarrer la séance en ligne.',
      });
    });
    return { ok: true };
  }

  /** Remplace, dans le fil, le code partagé par un texte neutre une fois qu'il ne sert plus. */
  private async scrubSharedCode(tx: Tx, b: { requesterId: string; tutorProfileId: string }, otp: string): Promise<void> {
    const conversation = await tx.conversation.findUnique({
      where: { requesterId_tutorProfileId: { requesterId: b.requesterId, tutorProfileId: b.tutorProfileId } },
      select: { id: true },
    });
    if (!conversation) return;
    await tx.message.updateMany({
      where: { conversationId: conversation.id, type: 'SYSTEM', systemText: sharedCodeText(otp) },
      data: { systemText: 'Code de séance transmis' },
    });
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
      await this.scrubSharedCode(tx, booking, this.crypto.decrypt(booking.startOtpCipher!));
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
    // Contrôle côté backend, jamais seulement masqué par le frontend : pour une salle partenaire, l'adresse exacte
    // n'est renvoyée à personne tant que la séance n'est pas confirmée (et plus après une annulation / un refus).
    const hideExact = b.roomId
      ? !ROOM_REVEAL_STATUSES.has(b.status)
      // Domicile : l'adresse de l'élève est cachée au tuteur, et celle du tuteur à l'élève, jusqu'à l'acceptation.
      : b.status === 'PENDING' && (viewerRole === 'TUTOR' || b.teachingMode === 'AT_HOME_TUTOR');
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
      // Décomposition figée à la réservation : ce que paie le Demandeur et à qui revient chaque part.
      pricing: {
        tutorFee: { amount: b.price.toFixed(2), currency: b.currency },
        travelFee: { amount: b.travelFee.toFixed(2), currency: b.currency },
        roomFee: { amount: b.roomFee ? b.roomFee.toFixed(2) : '0.00', currency: b.currency },
        serviceFee: { amount: b.serviceFee.toFixed(2), currency: b.currency },
        serviceFeeRate: Number(b.serviceFeeRate),
        total: { amount: b.totalAmount.toFixed(2), currency: b.currency },
      },
      locationLabel: b.locationLabel,
      locationAddress: hideExact ? null : b.locationAddress,
      latitude: hideExact ? null : b.latitude,
      longitude: hideExact ? null : b.longitude,
      room: b.room ? { id: b.room.id, name: b.room.name, zoneLabel: b.room.zoneLabel } : null,
      participantsCount: b.participantsCount,
      roomFee: b.roomFee ? { amount: b.roomFee.toString(), currency: b.currency } : null,
      /** Salle partenaire : présent seulement une fois la séance confirmée (spec 9). */
      roomAccessInstructions: b.roomId && !ROOM_REVEAL_STATUSES.has(b.status) ? null : b.roomAccessInstructions,
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
