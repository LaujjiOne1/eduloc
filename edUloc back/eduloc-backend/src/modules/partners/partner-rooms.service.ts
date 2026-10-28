import { Injectable } from '@nestjs/common';
import type { Prisma, Room, RoomPhoto } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfig } from '../../core/config/app.config';
import { OutboxWriter } from '../../infrastructure/outbox/outbox-writer';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors/domain-errors';
import { AvailabilityRule, SlotPolicy } from '../bookings/domain/slot-policy';
import {
  RegisterRoomPhotoDto, ReplaceRoomAvailabilitiesDto, RoomBlockDto, RoomDto, UpdateRoomDto, UploadRequestDto,
} from './dto';
import { PartnerLifecycle, RoomState } from './domain/review-lifecycle';
import { bookableRoomWhere, missingRoomFields, publishBlockers } from './domain/room-bookability';
import { MAX_PHOTOS_PER_ROOM, PartnerUploadsService, Tx, activeAdminIds, recordStatus } from './partner-support';

/** Champs d'une salle validée qu'on ne modifie plus sans nouvel examen : identité, position exacte, accueil des mineurs. */
const LOCKED_WHEN_APPROVED = ['name', 'addressLine', 'city', 'latitude', 'longitude', 'zoneLabel', 'welcomesMinors'] as const;

const HHMM_TO_MIN = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};

type RoomRecord = Room & { photos?: RoomPhoto[] };

@Injectable()
export class PartnerRoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: AppConfig,
    private readonly outbox: OutboxWriter,
    private readonly uploads: PartnerUploadsService,
  ) {}

  // ------------------------------------------------------------------ accès

  private async requireVenue(userId: string) {
    const venue = await this.prisma.partnerVenue.findUnique({ where: { managerId: userId } });
    if (!venue) throw new NotFoundError('VENUE_NOT_FOUND');
    return venue;
  }

  /** Salle d'un Gestionnaire : toute salle d'une autre structure est « introuvable », jamais « interdite ». */
  private async requireRoom(userId: string, roomId: string, tx: Tx | PrismaService = this.prisma) {
    const room = await tx.room.findFirst({ where: { id: roomId, venue: { managerId: userId } } });
    if (!room) throw new NotFoundError('ROOM_NOT_FOUND');
    return room;
  }

  // ------------------------------------------------------------------ salles

  async list(userId: string) {
    const venue = await this.requireVenue(userId);
    const now = new Date();
    const rooms = await this.prisma.room.findMany({
      where: { venueId: venue.id },
      orderBy: { createdAt: 'asc' },
      include: { photos: { orderBy: { position: 'asc' } } },
    });
    const bookable = new Set(
      (await this.prisma.room.findMany({ where: { venueId: venue.id, ...bookableRoomWhere(now) }, select: { id: true } }))
        .map((r) => r.id),
    );
    return Promise.all(rooms.map((r) => this.toResponse(r, bookable.has(r.id))));
  }

  async get(userId: string, roomId: string) {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, venue: { managerId: userId } },
      include: { photos: { orderBy: { position: 'asc' } } },
    });
    if (!room) throw new NotFoundError('ROOM_NOT_FOUND');
    const bookable = await this.prisma.room.count({ where: { id: roomId, ...bookableRoomWhere() } });
    return this.toResponse(room, bookable === 1);
  }

  /** Une salle ne coûte jamais plus que le plus haut forfait de déplacement : sinon elle ne serait plus attractive. */
  private assertHourlyFee(pricePerHour: number | undefined): void {
    if (pricePerHour !== undefined && pricePerHour > this.cfg.roomMaxHourlyFee) {
      throw new UnprocessableError('ROOM_PRICE_TOO_HIGH', undefined, [String(this.cfg.roomMaxHourlyFee)]);
    }
  }

  async create(userId: string, dto: RoomDto) {
    this.assertHourlyFee(dto.pricePerHour);
    const venue = await this.requireVenue(userId);
    if (venue.status === 'SUSPENDED') throw new UnprocessableError('VENUE_SUSPENDED');
    if (venue.status === 'REJECTED') throw new UnprocessableError('VENUE_REJECTED');
    if (venue.status === 'DISABLED') throw new UnprocessableError('VENUE_DISABLED');
    const room = await this.prisma.$transaction(async (tx) => {
      const created = await tx.room.create({ data: { venueId: venue.id, ...dto } });
      await recordStatus(tx, { venueId: venue.id, roomId: created.id, scope: 'ROOM', to: 'DRAFT', actorUserId: userId });
      return created;
    });
    return this.get(userId, room.id);
  }

  async update(userId: string, roomId: string, dto: UpdateRoomDto) {
    this.assertHourlyFee(dto.pricePerHour);
    const room = await this.requireRoom(userId, roomId);
    const state = room.status as RoomState;
    if (state === 'APPROVED') {
      const touched = LOCKED_WHEN_APPROVED.filter((field) => dto[field] !== undefined && dto[field] !== room[field]);
      if (touched.length) throw new UnprocessableError('ROOM_FIELDS_LOCKED', undefined, [...touched]);
    } else if (!PartnerLifecycle.isEditable(state)) {
      throw new UnprocessableError('ROOM_NOT_EDITABLE');
    }
    await this.prisma.room.update({ where: { id: room.id }, data: dto });
    return this.get(userId, roomId);
  }

  /** Suppression d'un brouillon / d'une salle rejetée qui n'a jamais eu de séance. */
  async remove(userId: string, roomId: string) {
    const room = await this.requireRoom(userId, roomId);
    if (!['DRAFT', 'NEEDS_CORRECTION', 'REJECTED'].includes(room.status)) throw new UnprocessableError('ROOM_NOT_EDITABLE');
    if (await this.prisma.booking.count({ where: { roomId } }) > 0) throw new UnprocessableError('ROOM_HAS_BOOKINGS');
    const photos = await this.prisma.roomPhoto.findMany({ where: { roomId }, select: { storagePath: true } });
    await this.prisma.room.delete({ where: { id: roomId } });
    await Promise.all(photos.map((p) => this.uploads.remove(this.cfg.roomPhotosBucket, p.storagePath)));
    return { ok: true };
  }

  /** Soumission INDIVIDUELLE : n'engage aucune autre salle de la structure (spec 8.1). */
  async submit(userId: string, roomId: string) {
    const room = await this.requireRoom(userId, roomId);
    const venue = await this.requireVenue(userId);
    PartnerLifecycle.assertRoom(room.status as RoomState, 'SUBMITTED', 'MANAGER');
    if (!['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(venue.status)) throw new UnprocessableError('VENUE_NOT_SUBMITTED');
    const availabilityCount = await this.prisma.roomAvailability.count({ where: { roomId, isActive: true } });
    const missing = missingRoomFields(room, availabilityCount);
    if (missing.length) throw new UnprocessableError('ROOM_INCOMPLETE', undefined, missing);

    await this.prisma.$transaction(async (tx: Tx) => {
      const { count } = await tx.room.updateMany({
        where: { id: roomId, status: room.status },
        data: { status: 'SUBMITTED', submittedAt: new Date(), reviewNote: null },
      });
      if (count !== 1) throw new ConflictError('BOOKING_STATE_CHANGED');
      await recordStatus(tx, { venueId: venue.id, roomId, scope: 'ROOM', from: room.status, to: 'SUBMITTED', actorUserId: userId });
      await this.outbox.write(tx, {
        aggregateType: 'room', aggregateId: roomId, eventType: 'partner.room.submitted',
        recipientIds: await activeAdminIds(tx), payload: { roomId, venueId: venue.id },
        pushTitle: 'Nouvelle salle à examiner', pushBody: 'Une salle partenaire a été soumise.',
      });
    });
    return this.get(userId, roomId);
  }

  /** Publication : salle validée + structure validée + souscription active, et pas dépubliée par un administrateur. */
  async publish(userId: string, roomId: string) {
    const room = await this.requireRoom(userId, roomId);
    const venue = await this.requireVenue(userId);
    const now = new Date();
    const active = await this.prisma.venueSubscription.count({
      where: { venueId: venue.id, status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } },
    });
    const blockers = publishBlockers({
      roomStatus: room.status, roomPublication: room.publication, venueStatus: venue.status, hasActiveSubscription: active > 0,
    });
    if (blockers.length) throw new UnprocessableError(blockers[0], undefined, blockers);
    await this.prisma.$transaction(async (tx: Tx) => {
      const { count } = await tx.room.updateMany({
        where: { id: roomId, status: 'APPROVED', publication: 'UNPUBLISHED' },
        data: { publication: 'PUBLISHED', publishedAt: now },
      });
      if (count === 1) {
        await recordStatus(tx, { venueId: venue.id, roomId, scope: 'PUBLICATION', from: room.publication, to: 'PUBLISHED', actorUserId: userId });
      }
    });
    return this.get(userId, roomId);
  }

  /** Retrait de la publication : les séances déjà confirmées sont conservées, les demandes en attente échoueront à l'acceptation. */
  async unpublish(userId: string, roomId: string) {
    const room = await this.requireRoom(userId, roomId);
    if (room.publication !== 'PUBLISHED') throw new UnprocessableError('ROOM_NOT_PUBLISHED');
    await this.prisma.$transaction(async (tx: Tx) => {
      await tx.room.update({ where: { id: roomId }, data: { publication: 'UNPUBLISHED' } });
      await recordStatus(tx, { venueId: room.venueId, roomId, scope: 'PUBLICATION', from: 'PUBLISHED', to: 'UNPUBLISHED', actorUserId: userId });
    });
    return this.get(userId, roomId);
  }

  /** Fermeture / réouverture temporaire sans repasser par la validation. */
  async setActive(userId: string, roomId: string, isActive: boolean) {
    await this.requireRoom(userId, roomId);
    await this.prisma.room.update({ where: { id: roomId }, data: { isActive } });
    return this.get(userId, roomId);
  }

  // ------------------------------------------------------------------ calendrier

  async listAvailabilities(userId: string, roomId: string) {
    await this.requireRoom(userId, roomId);
    const rules = await this.prisma.roomAvailability.findMany({
      where: { roomId, isActive: true }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    return rules.map(availabilityResponse);
  }

  /**
   * Remplace les plages d'ouverture. Aucune séance confirmée n'est annulée par cette modification (spec 7.4) : on
   * signale simplement combien restent hors des nouvelles plages, pour que le Gestionnaire puisse les honorer.
   */
  async replaceAvailabilities(userId: string, roomId: string, dto: ReplaceRoomAvailabilitiesDto) {
    const room = await this.requireRoom(userId, roomId);
    if (room.status === 'REJECTED') throw new UnprocessableError('ROOM_NOT_EDITABLE');
    for (const slot of dto.availabilities) {
      if (HHMM_TO_MIN(slot.endTime) <= HHMM_TO_MIN(slot.startTime)) throw new UnprocessableError('AVAILABILITY_TIME_INVALID');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.roomAvailability.deleteMany({ where: { roomId } });
      if (dto.availabilities.length) {
        await tx.roomAvailability.createMany({
          data: dto.availabilities.map((s) => ({
            roomId, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime,
            validFrom: s.validFrom ? new Date(s.validFrom) : null, validUntil: s.validUntil ? new Date(s.validUntil) : null,
          })),
        });
      }
    });
    const rules = await this.listAvailabilities(userId, roomId);
    return { availabilities: rules, uncoveredConfirmedBookings: await this.countUncovered(room, rules) };
  }

  private async countUncovered(room: Room, rules: ReturnType<typeof availabilityResponse>[]): Promise<number> {
    const future = await this.prisma.booking.findMany({
      where: { roomId: room.id, status: { in: ['CONFIRMED', 'IN_PROGRESS'] }, endAt: { gt: new Date() } },
      select: { startAt: true, endAt: true },
    });
    const roomRules: AvailabilityRule[] = rules.map((r) => ({
      id: r.id, dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime, timezone: room.timezone,
      validFrom: r.validFrom ? new Date(r.validFrom) : null, validUntil: r.validUntil ? new Date(r.validUntil) : null,
      isActive: true, offerId: null, placeId: null, placeType: null,
    }));
    return future.filter((b) => !SlotPolicy.matchRule(roomRules, b.startAt, b.endAt, 'PARTNER_ROOM', undefined, '')).length;
  }

  async listBlocks(userId: string, roomId: string) {
    await this.requireRoom(userId, roomId);
    return this.prisma.roomBlockedPeriod.findMany({
      where: { roomId, endAt: { gt: new Date() } }, orderBy: { startAt: 'asc' },
    });
  }

  async addBlock(userId: string, roomId: string, dto: RoomBlockDto) {
    await this.requireRoom(userId, roomId);
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) throw new UnprocessableError('AVAILABILITY_TIME_INVALID');
    // Une fermeture ne doit pas écraser en silence une séance confirmée.
    const clash = await this.prisma.booking.count({
      where: { roomId, status: { in: ['CONFIRMED', 'IN_PROGRESS'] }, startAt: { lt: endAt }, endAt: { gt: startAt } },
    });
    if (clash > 0) throw new UnprocessableError('BLOCK_OVERLAPS_CONFIRMED_BOOKING');
    return this.prisma.roomBlockedPeriod.create({ data: { roomId, startAt, endAt, reason: dto.reason ?? null } });
  }

  async removeBlock(userId: string, roomId: string, blockId: string) {
    await this.requireRoom(userId, roomId);
    const { count } = await this.prisma.roomBlockedPeriod.deleteMany({ where: { id: blockId, roomId } });
    if (!count) throw new NotFoundError('RESOURCE_NOT_FOUND');
    return { ok: true };
  }

  // ------------------------------------------------------------------ photos

  async requestPhotoUpload(userId: string, roomId: string, dto: UploadRequestDto) {
    const room = await this.requireRoom(userId, roomId);
    return this.uploads.createTicket('ROOM_PHOTO', userId, room.id, dto);
  }

  async registerPhoto(userId: string, roomId: string, dto: RegisterRoomPhotoDto) {
    const room = await this.requireRoom(userId, roomId);
    if (room.status === 'REJECTED') throw new UnprocessableError('ROOM_NOT_EDITABLE');
    if (await this.prisma.roomPhoto.count({ where: { roomId } }) >= MAX_PHOTOS_PER_ROOM) {
      throw new UnprocessableError('ROOM_PHOTO_LIMIT');
    }
    const file = await this.uploads.consume('ROOM_PHOTO', userId, room.id, dto.uploadId);
    const last = await this.prisma.roomPhoto.findFirst({ where: { roomId }, orderBy: { position: 'desc' }, select: { position: true } });
    const photo = await this.prisma.roomPhoto.create({
      data: { roomId, storagePath: file.storagePath, mimeType: file.mimeType, sizeBytes: file.sizeBytes, position: (last?.position ?? -1) + 1 },
    });
    return { id: photo.id, position: photo.position, url: await this.uploads.readUrl(this.cfg.roomPhotosBucket, photo.storagePath) };
  }

  async removePhoto(userId: string, roomId: string, photoId: string) {
    await this.requireRoom(userId, roomId);
    const photo = await this.prisma.roomPhoto.findFirst({ where: { id: photoId, roomId } });
    if (!photo) throw new NotFoundError('RESOURCE_NOT_FOUND');
    await this.prisma.roomPhoto.delete({ where: { id: photo.id } });
    await this.uploads.remove(this.cfg.roomPhotosBucket, photo.storagePath);
    return { ok: true };
  }

  // ------------------------------------------------------------------ réservations confirmées

  /**
   * Séances confirmées des salles du Gestionnaire. Il n'a pas à les approuver une à une (spec 2.3) et ne reçoit que ce
   * dont il a besoin pour accueillir : horaire, salle, effectif et nom d'affichage du Tuteur — jamais le Bénéficiaire.
   */
  async reservations(userId: string, q: { roomId?: string; from?: string; to?: string; limit: number }) {
    const venue = await this.requireVenue(userId);
    const where: Prisma.BookingWhereInput = {
      room: { venueId: venue.id },
      ...(q.roomId ? { roomId: q.roomId } : {}),
      status: { in: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] },
      startAt: { gte: q.from ? new Date(q.from) : new Date(Date.now() - 86_400_000), ...(q.to ? { lt: new Date(q.to) } : {}) },
    };
    const rows = await this.prisma.booking.findMany({
      where, orderBy: { startAt: 'asc' }, take: q.limit,
      select: {
        id: true, roomId: true, startAt: true, endAt: true, status: true, participantsCount: true, offerTitle: true,
        room: { select: { name: true } },
        tutorProfile: { select: { displayName: true, user: { select: { firstName: true } } } },
      },
    });
    return rows.map((b) => ({
      id: b.id, roomId: b.roomId, roomName: b.room?.name ?? null, startAt: b.startAt, endAt: b.endAt, status: b.status,
      participantsCount: b.participantsCount, offerTitle: b.offerTitle,
      tutorName: b.tutorProfile.displayName ?? b.tutorProfile.user.firstName,
    }));
  }

  // ------------------------------------------------------------------ mapping

  private async toResponse(room: RoomRecord, bookable: boolean) {
    const [availabilities, photos] = await Promise.all([
      this.prisma.roomAvailability.findMany({ where: { roomId: room.id, isActive: true }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] }),
      Promise.all((room.photos ?? []).map(async (p) => ({
        id: p.id, position: p.position, url: await this.uploads.readUrl(this.cfg.roomPhotosBucket, p.storagePath),
      }))),
    ]);
    const missing = ['DRAFT', 'NEEDS_CORRECTION'].includes(room.status) ? missingRoomFields(room, availabilities.length) : [];
    return {
      id: room.id,
      venueId: room.venueId,
      name: room.name,
      description: room.description,
      addressLine: room.addressLine,
      city: room.city,
      latitude: room.latitude,
      longitude: room.longitude,
      accessInstructions: room.accessInstructions,
      zoneLabel: room.zoneLabel,
      capacity: room.capacity,
      equipment: room.equipment,
      accessibility: room.accessibility,
      welcomesMinors: room.welcomesMinors,
      pricePerHour: room.pricePerHour ? { amount: room.pricePerHour.toString(), currency: room.currency } : null,
      rules: room.rules,
      cancellationPolicy: room.cancellationPolicy,
      status: room.status,
      publication: room.publication,
      isActive: room.isActive,
      reviewNote: room.reviewNote,
      submittedAt: room.submittedAt,
      reviewedAt: room.reviewedAt,
      bookable,
      missingFields: missing,
      availabilities: availabilities.map(availabilityResponse),
      photos,
    };
  }
}

const availabilityResponse = (r: {
  id: string; dayOfWeek: number; startTime: string; endTime: string; validFrom: Date | null; validUntil: Date | null;
}) => ({
  id: r.id,
  dayOfWeek: r.dayOfWeek,
  startTime: r.startTime,
  endTime: r.endTime,
  validFrom: r.validFrom?.toISOString().slice(0, 10) ?? null,
  validUntil: r.validUntil?.toISOString().slice(0, 10) ?? null,
});

