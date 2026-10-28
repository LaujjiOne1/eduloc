import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfig } from '../../core/config/app.config';
import { OutboxWriter } from '../../infrastructure/outbox/outbox-writer';
import { NotFoundError, UnprocessableError } from '../../common/errors/domain-errors';
import { AdminReservationsQueryDto, RoomPublicationDecisionDto, RoomReviewDto, VenueReviewDto } from './dto';
import { PartnerLifecycle, RoomState, VenueState } from './domain/review-lifecycle';
import { bookableRoomWhere } from './domain/room-bookability';
import { PartnerUploadsService, Tx, recordStatus } from './partner-support';
import { effectiveSubscription } from './partner-subscription.service';

const VENUE_TARGET = {
  START_REVIEW: 'UNDER_REVIEW', APPROVE: 'APPROVED', REQUEST_CORRECTION: 'NEEDS_CORRECTION',
  SUSPEND: 'SUSPENDED', REINSTATE: 'APPROVED', REJECT: 'REJECTED', DISABLE: 'DISABLED',
} as const;
const ROOM_TARGET = {
  START_REVIEW: 'UNDER_REVIEW', APPROVE: 'APPROVED', REQUEST_CORRECTION: 'NEEDS_CORRECTION',
  SUSPEND: 'SUSPENDED', REINSTATE: 'APPROVED', REJECT: 'REJECTED',
} as const;
/** Décisions qui doivent expliquer au Gestionnaire ce qu'il doit faire ou pourquoi (motif conservé dans l'historique). */
const NOTE_REQUIRED = new Set(['REQUEST_CORRECTION', 'SUSPEND', 'REJECT', 'DISABLE']);

const REVIEW_TITLES: Record<string, { title: string; body: string }> = {
  UNDER_REVIEW: { title: 'Dossier en cours d’examen', body: 'Un administrateur examine votre dossier.' },
  APPROVED: { title: 'Dossier validé', body: 'Votre dossier a été validé.' },
  NEEDS_CORRECTION: { title: 'Corrections demandées', body: 'Des corrections sont demandées sur votre dossier.' },
  SUSPENDED: { title: 'Dossier suspendu', body: 'Votre dossier a été suspendu.' },
  REJECTED: { title: 'Dossier refusé', body: 'Votre dossier a été refusé. Corrigez-le puis soumettez-le à nouveau.' },
  DISABLED: { title: 'Dossier désactivé', body: 'Votre structure a été désactivée.' },
};

@Injectable()
export class PartnerAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: AppConfig,
    private readonly outbox: OutboxWriter,
    private readonly uploads: PartnerUploadsService,
  ) {}

  // ------------------------------------------------------------------ structures

  async listVenues(status: string | undefined, limit: number) {
    const venues = await this.prisma.partnerVenue.findMany({
      where: status ? { status: status as never } : {},
      orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
      include: {
        manager: { select: { firstName: true, lastName: true, email: true } },
        _count: { select: { rooms: true, documents: true } },
      },
    });
    return venues.map((v) => ({
      id: v.id, name: v.name, type: v.type, status: v.status, submittedAt: v.submittedAt,
      manager: v.manager, roomsCount: v._count.rooms, documentsCount: v._count.documents,
    }));
  }

  async venueDetail(venueId: string) {
    const venue = await this.prisma.partnerVenue.findUnique({
      where: { id: venueId },
      include: {
        manager: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        documents: { orderBy: { uploadedAt: 'desc' } },
        rooms: { orderBy: { createdAt: 'asc' } },
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 1, include: { plan: true } },
        statusEvents: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!venue) throw new NotFoundError('VENUE_NOT_FOUND');
    const documents = await Promise.all(venue.documents.map(async (d) => ({
      id: d.id, type: d.type, fileName: d.fileName, mimeType: d.mimeType, sizeBytes: d.sizeBytes, uploadedAt: d.uploadedAt,
      // Justificatif privé : URL signée courte, réservée à l'administrateur.
      url: await this.uploads.readUrl(this.cfg.partnerDocsBucket, d.storagePath, 600),
    })));
    return {
      id: venue.id, name: venue.name, type: venue.type, description: venue.description, legalName: venue.legalName,
      registrationNumber: venue.registrationNumber, nif: venue.nif, stat: venue.stat, contactPhone: venue.contactPhone, contactEmail: venue.contactEmail,
      status: venue.status, reviewNote: venue.reviewNote, submittedAt: venue.submittedAt, reviewedAt: venue.reviewedAt,
      manager: venue.manager, documents,
      subscription: effectiveSubscription(venue.subscriptions[0] ?? null, new Date()),
      rooms: venue.rooms.map((r) => ({ id: r.id, name: r.name, status: r.status, publication: r.publication, isActive: r.isActive })),
      history: venue.statusEvents.map((e) => ({
        id: e.id, scope: e.scope, roomId: e.roomId, from: e.fromStatus, to: e.toStatus, actorUserId: e.actorUserId, note: e.note, at: e.createdAt,
      })),
    };
  }

  async reviewVenue(adminId: string, venueId: string, dto: VenueReviewDto) {
    const target: VenueState = VENUE_TARGET[dto.decision];
    if (NOTE_REQUIRED.has(dto.decision) && !dto.note?.trim()) throw new UnprocessableError('REVIEW_NOTE_REQUIRED');
    await this.prisma.$transaction(async (tx: Tx) => {
      const venue = await tx.partnerVenue.findUnique({ where: { id: venueId } });
      if (!venue) throw new NotFoundError('VENUE_NOT_FOUND');
      const from = venue.status as VenueState;
      if (dto.decision === 'REINSTATE' && from !== 'SUSPENDED' && from !== 'DISABLED') throw new UnprocessableError('VENUE_NOT_SUSPENDED');
      PartnerLifecycle.assertVenue(from, target, 'ADMIN');
      // « Partenaire vérifié » : le NIF et le STAT sont facultatifs jusque-là, obligatoires pour la vérification complète.
      if (dto.decision === 'APPROVE' && (!venue.nif?.trim() || !venue.stat?.trim())) throw new UnprocessableError('VENUE_NIF_STAT_REQUIRED');
      await tx.partnerVenue.update({
        where: { id: venueId },
        data: { status: target, reviewedAt: new Date(), reviewedById: adminId, reviewNote: dto.note?.trim() || null },
      });
      await recordStatus(tx, { venueId, scope: 'VENUE', from, to: target, actorUserId: adminId, note: dto.note });
      await this.notifyManager(tx, venue.managerId, 'partner.venue.reviewed', 'venue', venueId, target, dto.note, { venueId });
    });
    return this.venueDetail(venueId);
  }

  // ------------------------------------------------------------------ salles

  async listRooms(status: string | undefined, limit: number) {
    const rooms = await this.prisma.room.findMany({
      where: status ? { status: status as never } : {},
      orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
      include: { venue: { select: { id: true, name: true, status: true } } },
    });
    return rooms.map((r) => ({
      id: r.id, name: r.name, status: r.status, publication: r.publication, isActive: r.isActive, submittedAt: r.submittedAt,
      venue: r.venue,
    }));
  }

  /** Détail complet d'une salle, adresse exacte comprise : consultation réservée à l'administration. */
  async roomDetail(roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        venue: { select: { id: true, name: true, status: true, managerId: true } },
        photos: { orderBy: { position: 'asc' } },
        availabilities: { where: { isActive: true }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        statusEvents: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!room) throw new NotFoundError('ROOM_NOT_FOUND');
    const [photos, upcoming, bookable] = await Promise.all([
      Promise.all(room.photos.map(async (p) => ({
        id: p.id, position: p.position, url: await this.uploads.readUrl(this.cfg.roomPhotosBucket, p.storagePath, 600),
      }))),
      this.prisma.booking.count({ where: { roomId, status: { in: ['CONFIRMED', 'IN_PROGRESS'] }, endAt: { gt: new Date() } } }),
      this.prisma.room.count({ where: { id: roomId, ...bookableRoomWhere() } }),
    ]);
    return {
      id: room.id, venue: room.venue, name: room.name, description: room.description,
      addressLine: room.addressLine, city: room.city, latitude: room.latitude, longitude: room.longitude,
      accessInstructions: room.accessInstructions, zoneLabel: room.zoneLabel, capacity: room.capacity,
      equipment: room.equipment, accessibility: room.accessibility, welcomesMinors: room.welcomesMinors,
      pricePerHour: room.pricePerHour ? { amount: room.pricePerHour.toString(), currency: room.currency } : null,
      rules: room.rules, cancellationPolicy: room.cancellationPolicy,
      status: room.status, publication: room.publication, isActive: room.isActive, reviewNote: room.reviewNote,
      submittedAt: room.submittedAt, reviewedAt: room.reviewedAt, bookable, upcomingConfirmedBookings: upcoming,
      availabilities: room.availabilities.map((a) => ({ id: a.id, dayOfWeek: a.dayOfWeek, startTime: a.startTime, endTime: a.endTime })),
      photos,
      history: room.statusEvents.map((e) => ({
        id: e.id, scope: e.scope, from: e.fromStatus, to: e.toStatus, actorUserId: e.actorUserId, note: e.note, at: e.createdAt,
      })),
    };
  }

  /**
   * Décision sur UNE salle : approuver une salle n'approuve aucune autre (spec 10.2). Suspendre ou rejeter une salle
   * publiée la dépublie dans la même transaction (contrainte SQL rooms_published_requires_approval).
   */
  async reviewRoom(adminId: string, roomId: string, dto: RoomReviewDto) {
    const target: RoomState = ROOM_TARGET[dto.decision];
    if (NOTE_REQUIRED.has(dto.decision) && !dto.note?.trim()) throw new UnprocessableError('REVIEW_NOTE_REQUIRED');
    await this.prisma.$transaction(async (tx: Tx) => {
      const room = await tx.room.findUnique({ where: { id: roomId }, include: { venue: true } });
      if (!room) throw new NotFoundError('ROOM_NOT_FOUND');
      const from = room.status as RoomState;
      if (dto.decision === 'REINSTATE' && from !== 'SUSPENDED') throw new UnprocessableError('ROOM_NOT_SUSPENDED');
      PartnerLifecycle.assertRoom(from, target, 'ADMIN');
      if (target === 'APPROVED' && room.venue.status !== 'APPROVED') throw new UnprocessableError('VENUE_NOT_APPROVED');

      let publication = room.publication;
      let publicationNote: string | undefined;
      if (target !== 'APPROVED' && publication === 'PUBLISHED') {
        publication = 'UNPUBLISHED_BY_ADMIN';
        publicationNote = `Dépubliée automatiquement (${target})`;
      } else if (dto.decision === 'REINSTATE' && publication === 'UNPUBLISHED_BY_ADMIN') {
        // Après une suspension, le Gestionnaire republie lui-même : rien ne redevient public sans son geste.
        publication = 'UNPUBLISHED';
      }
      await tx.room.update({
        where: { id: roomId },
        data: {
          status: target, publication, reviewedAt: new Date(), reviewedById: adminId, reviewNote: dto.note?.trim() || null,
        },
      });
      await recordStatus(tx, { venueId: room.venueId, roomId, scope: 'ROOM', from, to: target, actorUserId: adminId, note: dto.note });
      if (publication !== room.publication) {
        await recordStatus(tx, { venueId: room.venueId, roomId, scope: 'PUBLICATION', from: room.publication, to: publication, actorUserId: adminId, note: publicationNote });
      }
      await this.notifyManager(tx, room.venue.managerId, 'partner.room.reviewed', 'room', roomId, target, dto.note, { roomId, venueId: room.venueId });
    });
    return this.roomDetail(roomId);
  }

  /** Retrait / rétablissement de la publication par l'administration (UNPUBLISHED_BY_ADMIN). */
  async decidePublication(adminId: string, roomId: string, dto: RoomPublicationDecisionDto) {
    await this.prisma.$transaction(async (tx: Tx) => {
      const room = await tx.room.findUnique({ where: { id: roomId }, include: { venue: true } });
      if (!room) throw new NotFoundError('ROOM_NOT_FOUND');
      if (dto.action === 'UNPUBLISH') {
        if (!dto.note?.trim()) throw new UnprocessableError('REVIEW_NOTE_REQUIRED');
        if (room.publication === 'UNPUBLISHED_BY_ADMIN') return;
        await tx.room.update({ where: { id: roomId }, data: { publication: 'UNPUBLISHED_BY_ADMIN' } });
        await recordStatus(tx, { venueId: room.venueId, roomId, scope: 'PUBLICATION', from: room.publication, to: 'UNPUBLISHED_BY_ADMIN', actorUserId: adminId, note: dto.note });
        await this.notifyManager(tx, room.venue.managerId, 'partner.room.reviewed', 'room', roomId, 'UNPUBLISHED_BY_ADMIN', dto.note, { roomId, venueId: room.venueId });
      } else {
        if (room.publication !== 'UNPUBLISHED_BY_ADMIN') throw new UnprocessableError('ROOM_NOT_UNPUBLISHED_BY_ADMIN');
        await tx.room.update({ where: { id: roomId }, data: { publication: 'UNPUBLISHED' } });
        await recordStatus(tx, { venueId: room.venueId, roomId, scope: 'PUBLICATION', from: 'UNPUBLISHED_BY_ADMIN', to: 'UNPUBLISHED', actorUserId: adminId, note: dto.note });
      }
    });
    return this.roomDetail(roomId);
  }

  // ------------------------------------------------------------------ réservations et conflits

  /** Réservations de salle (toutes salles) avec le nombre de conflits d'acceptation ouverts. */
  async reservations(q: AdminReservationsQueryDto) {
    const statuses = q.status?.split(',').map((s) => s.trim()).filter(Boolean);
    const where: Prisma.BookingWhereInput = {
      roomId: q.roomId ?? { not: null },
      ...(statuses?.length ? { status: { in: statuses as never[] } } : {}),
    };
    const rows = await this.prisma.booking.findMany({
      where, orderBy: { startAt: 'desc' }, take: q.limit,
      select: {
        id: true, status: true, startAt: true, endAt: true, participantsCount: true, createdAt: true,
        room: { select: { id: true, name: true, venue: { select: { id: true, name: true } } } },
        tutorProfile: { select: { id: true, displayName: true } },
        conflicts: { where: { status: 'OPEN' }, select: { id: true, type: true, details: true } },
      },
    });
    return rows.map((b) => ({ ...b, openConflicts: b.conflicts }));
  }

  private async notifyManager(
    tx: Tx, managerId: string, eventType: string, aggregateType: string, aggregateId: string,
    status: string, note: string | undefined, payload: Prisma.InputJsonObject,
  ) {
    const text = REVIEW_TITLES[status] ?? { title: 'Mise à jour de votre dossier', body: 'Le statut de votre dossier a changé.' };
    await this.outbox.write(tx, {
      aggregateType, aggregateId, eventType, recipientIds: [managerId],
      payload: { ...payload, status },
      pushTitle: text.title,
      pushBody: note?.trim() ? `${text.body} ${note.trim()}`.slice(0, 240) : text.body,
    });
  }
}
