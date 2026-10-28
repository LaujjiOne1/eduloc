import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../core/config/app.config';
import { PrismaService } from '../../core/prisma/prisma.service';
import { NotFoundError, UnprocessableError } from '../../common/errors/domain-errors';
import { AvailabilityRule, SlotPolicy, TeachingMode } from '../bookings/domain/slot-policy';
import { BusyInterval, MarginConfig, MarginPolicy, locationKeyOf } from '../bookings/domain/margin-policy';
import { BUSINESS_TIMEZONE, computeDaySlots } from '../bookings/domain/day-slots';
import { allowedDurations } from '../bookings/domain/offer-durations';
import { distanceMeters } from '../bookings/domain/travel';
import { toPublicPlace } from '../search/domain/public-location';
export { distanceMeters };
import { bookableRoomWhere } from '../partners/domain/room-bookability';
import { RoomsService, toPublicRoom } from './rooms.service';

export const BOOKING_MODES: TeachingMode[] = ['ONLINE', 'AT_HOME_BENEFICIARY', 'AT_HOME_TUTOR', 'PUBLIC_PLACE', 'PARTNER_ROOM'];

/**
 * Ce que le Demandeur peut choisir pour une offre (spec 3 et 6.5-6.8) : modes, lieux et durées COMPATIBLES avec le Tuteur,
 * puis créneaux de la date demandée. Tout est calculé ici, côté backend ; le frontend n'affiche que ce qui est renvoyé.
 * Ces calculs guident le choix : la création de la demande et l'acceptation refont leurs propres vérifications.
 */
@Injectable()
export class BookingOptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: AppConfig,
    private readonly rooms: RoomsService,
  ) {}

  private get margins(): MarginConfig {
    return { bufferMinutes: this.cfg.bookingBufferMinutes, travelBufferMinutes: this.cfg.bookingTravelBufferMinutes };
  }

  private async bookableOffer(offerId: string) {
    const offer = await this.prisma.offer.findFirst({
      where: { id: offerId, isActive: true, disabledByAdminAt: null, tutorProfile: { isVisible: true, suspendedAt: null } },
      include: {
        tutorProfile: {
          include: {
            places: { where: { isActive: true } },
            availabilities: { where: { isActive: true }, include: { place: true } },
          },
        },
      },
    });
    if (!offer) throw new NotFoundError('OFFER_NOT_BOOKABLE');
    return offer;
  }

  private toRules(
    availabilities: { id: string; dayOfWeek: number; startTime: string; endTime: string; timezone: string; validFrom: Date | null;
      validUntil: Date | null; isActive: boolean; offerId: string | null; placeId: string | null; place: { type: string } | null }[],
  ): AvailabilityRule[] {
    return availabilities.map((r) => ({
      id: r.id, dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime, timezone: r.timezone,
      validFrom: r.validFrom, validUntil: r.validUntil, isActive: r.isActive, offerId: r.offerId, placeId: r.placeId,
      placeType: r.place?.type ?? null,
    }));
  }

  /** Salles réservables que le Tuteur accepte : jamais une salle proche mais non acceptée (spec 3). */
  private async acceptedRooms(tutorProfileId: string) {
    return this.prisma.room.findMany({
      where: { ...bookableRoomWhere(), tutorRooms: { some: { tutorProfileId, isActive: true } } },
      include: {
        photos: { orderBy: { position: 'asc' } },
        availabilities: { where: { isActive: true }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        venue: { select: { type: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  /** `maxDistanceM` (rayon choisi par le demandeur depuis sa position) écarte les salles plus lointaines ; sans position, aucun filtre. */
  async options(offerId: string, near?: { lat: number; lng: number }, maxDistanceM?: number) {
    const offer = await this.bookableOffer(offerId);
    const tutor = offer.tutorProfile;
    const rules = this.toRules(tutor.availabilities);
    const inPerson = offer.format !== 'ONLINE';
    const online = offer.format !== 'IN_PERSON';
    const placesOf = (type: string) => tutor.places.filter((p) => p.type === type);

    const acceptedRooms = inPerson && SlotPolicy.supportsMode(rules, 'PARTNER_ROOM', offer.id) ? await this.acceptedRooms(tutor.id) : [];
    // Distance exacte (PostGIS) demandeur ↔ salle : sert au filtre et au tri ; seule la valeur arrondie est publiée.
    const withDistance = await Promise.all(acceptedRooms.map(async (room) => {
      let distance: number | null = null;
      if (near) {
        const rows = await this.prisma.$queryRaw<{ d: number | null }[]>`
          SELECT ST_Distance(location, ST_MakePoint(${near.lng}::float8, ${near.lat}::float8)::geography) AS d
          FROM rooms WHERE id = ${room.id}`;
        distance = rows[0]?.d === null || rows[0]?.d === undefined ? null : Number(rows[0].d);
      }
      return { room, distance };
    }));
    const inRange = withDistance.filter(({ distance }) => !near || maxDistanceM === undefined || distance === null || distance <= maxDistanceM);
    const rooms = inRange.map(({ room }) => room);

    // Zone de déplacement : seulement si l'adresse du Bénéficiaire est connue ET que le Tuteur a borné sa zone.
    const home = placesOf('BENEFICIARY_HOME');
    const zoned = home.filter((p) => p.latitude !== null && p.longitude !== null && p.radius);
    const homeInZone = !near || zoned.length === 0
      || zoned.some((p) => distanceMeters(near, { lat: p.latitude!, lng: p.longitude! }) <= p.radius!);

    const available: Record<TeachingMode, boolean> = {
      ONLINE: online && SlotPolicy.supportsMode(rules, 'ONLINE', offer.id),
      AT_HOME_BENEFICIARY: inPerson && SlotPolicy.supportsMode(rules, 'AT_HOME_BENEFICIARY', offer.id) && homeInZone,
      AT_HOME_TUTOR: inPerson && placesOf('TUTOR_HOME').length > 0 && SlotPolicy.supportsMode(rules, 'AT_HOME_TUTOR', offer.id),
      PUBLIC_PLACE: inPerson && placesOf('PUBLIC_PLACE').length > 0 && SlotPolicy.supportsMode(rules, 'PUBLIC_PLACE', offer.id),
      PARTNER_ROOM: rooms.length > 0,
    };

    const publicRooms = await Promise.all(inRange.map(async ({ room, distance }) =>
      toPublicRoom(room, await this.rooms.photosOf(room), distance)));
    if (near) publicRooms.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));

    return {
      offerId: offer.id,
      tutorId: tutor.id,
      format: offer.format,
      minNoticeHours: this.cfg.bookingMinNoticeHours,
      durations: allowedDurations(offer).map((minutes) => ({
        minutes,
        // Prix proportionnel à la durée par défaut de l'offre.
        price: { amount: offer.price.mul(minutes).div(offer.durationMinutes).toDecimalPlaces(2).toString(), currency: offer.currency },
      })),
      modes: BOOKING_MODES.filter((m) => available[m]),
      rooms: available.PARTNER_ROOM ? publicRooms : [],
      // Lieux à choisir pour « chez le tuteur » / « lieu public » (position privée floutée, comme partout en API publique).
      places: (['AT_HOME_TUTOR', 'PUBLIC_PLACE'] as const)
        .filter((m) => available[m])
        .flatMap((m) => placesOf(m === 'AT_HOME_TUTOR' ? 'TUTOR_HOME' : 'PUBLIC_PLACE').map((p) => ({ mode: m, ...toPublicPlace(p) }))),
    };
  }

  async slots(offerId: string, q: { date: string; mode: TeachingMode; roomId?: string; durationMinutes?: number; placeId?: string }) {
    const offer = await this.bookableOffer(offerId);
    const tutor = offer.tutorProfile;
    const durationMinutes = q.durationMinutes ?? offer.durationMinutes;
    if (!allowedDurations(offer).includes(durationMinutes)) throw new UnprocessableError('DURATION_NOT_OFFERED');
    if (q.mode === 'ONLINE' ? offer.format === 'IN_PERSON' : offer.format === 'ONLINE') {
      throw new UnprocessableError('OFFER_FORMAT_MISMATCH');
    }
    if (q.mode === 'PARTNER_ROOM' && !q.roomId) throw new UnprocessableError('ROOM_REQUIRED');
    if (q.mode !== 'PARTNER_ROOM' && q.roomId) throw new UnprocessableError('ROOM_NOT_ALLOWED_FOR_MODE');

    const day = Date.parse(`${q.date}T00:00:00.000Z`);
    const lowest = Date.now() - 2 * 86_400_000;
    const highest = Date.now() + 120 * 86_400_000;
    if (Number.isNaN(day) || day < lowest || day > highest) throw new UnprocessableError('SLOT_DATE_INVALID');

    const windowFrom = new Date(day - 14 * 3_600_000 - 4 * 3_600_000);
    const windowTo = new Date(day + 38 * 3_600_000 + 4 * 3_600_000);
    const gap = MarginPolicy.maxGapMinutes(this.margins) * 60_000;

    const [blocked, busyRows] = await Promise.all([
      this.prisma.blockedPeriod.findMany({
        where: { tutorProfileId: tutor.id, startAt: { lt: windowTo }, endAt: { gt: windowFrom } },
        select: { startAt: true, endAt: true },
      }),
      this.prisma.booking.findMany({
        where: {
          tutorProfileId: tutor.id, status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
          startAt: { lt: new Date(windowTo.getTime() + gap) }, endAt: { gt: new Date(windowFrom.getTime() - gap) },
        },
        select: { startAt: true, endAt: true, teachingMode: true, roomId: true, placeId: true, locationAddress: true },
      }),
    ]);
    const tutorBusy: BusyInterval[] = busyRows.map((b) => ({
      startAt: b.startAt, endAt: b.endAt,
      locationKey: locationKeyOf({ teachingMode: b.teachingMode, roomId: b.roomId, placeId: b.placeId, address: b.locationAddress }),
    }));

    let room: Parameters<typeof computeDaySlots>[0]['room'];
    if (q.mode === 'PARTNER_ROOM') {
      const row = await this.prisma.room.findFirst({
        where: { id: q.roomId!, ...bookableRoomWhere(), tutorRooms: { some: { tutorProfileId: tutor.id, isActive: true } } },
        include: {
          availabilities: { where: { isActive: true } },
          blockedPeriods: { where: { startAt: { lt: windowTo }, endAt: { gt: windowFrom } } },
        },
      });
      if (!row) throw new NotFoundError('ROOM_NOT_BOOKABLE');
      const turnover = this.cfg.roomTurnoverBufferMinutes * 60_000;
      const roomBusy = await this.prisma.booking.findMany({
        where: {
          roomId: row.id, status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
          startAt: { lt: new Date(windowTo.getTime() + turnover) }, endAt: { gt: new Date(windowFrom.getTime() - turnover) },
        },
        select: { startAt: true, endAt: true },
      });
      room = {
        rules: row.availabilities.map((a) => ({
          id: a.id, dayOfWeek: a.dayOfWeek, startTime: a.startTime, endTime: a.endTime, timezone: row.timezone,
          validFrom: a.validFrom, validUntil: a.validUntil, isActive: true, offerId: null, placeId: null, placeType: null,
        })),
        blocked: row.blockedPeriods.map((b) => ({ startAt: b.startAt, endAt: b.endAt })),
        busy: roomBusy,
        turnoverMinutes: this.cfg.roomTurnoverBufferMinutes,
      };
    }

    const slots = computeDaySlots({
      date: q.date,
      durationMinutes,
      stepMinutes: this.cfg.bookingSlotStepMinutes,
      notBefore: new Date(Date.now() + this.cfg.bookingMinNoticeHours * 3_600_000),
      mode: q.mode,
      offerId: offer.id,
      tutorRules: this.toRules(tutor.availabilities),
      tutorBlocked: blocked,
      tutorBusy,
      candidateLocationKey: locationKeyOf({
        teachingMode: q.mode, roomId: q.roomId, placeId: q.placeId, address: q.mode === 'AT_HOME_BENEFICIARY' ? '__à définir__' : null,
      }),
      margins: this.margins,
      room,
    });

    return {
      date: q.date,
      timezone: BUSINESS_TIMEZONE,
      mode: q.mode,
      roomId: q.roomId ?? null,
      durationMinutes,
      minNoticeHours: this.cfg.bookingMinNoticeHours,
      // Rappel pour l'interface : cette liste n'est PAS une réservation (aucun blocage temporaire, spec 7).
      slots: slots.map((s) => ({ startAt: s.startAt.toISOString(), endAt: s.endAt.toISOString() })),
    };
  }
}
