import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfig } from '../../core/config/app.config';
import { OutboxWriter } from '../../infrastructure/outbox/outbox-writer';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors/domain-errors';
import { RegisterVenueDocumentDto, UpdateVenueDto, UploadRequestDto, VenueDto } from './dto';
import { PartnerLifecycle, VenueState } from './domain/review-lifecycle';
import { PartnerUploadsService, Tx, activeAdminIds, recordStatus } from './partner-support';
import { bookableRoomWhere } from './domain/room-bookability';
import { effectiveSubscription } from './partner-subscription.service';

const venueInclude = {
  documents: { orderBy: { uploadedAt: 'desc' as const } },
  rooms: { orderBy: { createdAt: 'asc' as const } },
  subscriptions: { orderBy: { createdAt: 'desc' as const }, take: 1, include: { plan: true } },
  statusEvents: { orderBy: { createdAt: 'desc' as const }, take: 30 },
};

@Injectable()
export class PartnerVenueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: AppConfig,
    private readonly outbox: OutboxWriter,
    private readonly uploads: PartnerUploadsService,
  ) {}

  private async requireVenue(userId: string) {
    const venue = await this.prisma.partnerVenue.findUnique({ where: { managerId: userId } });
    if (!venue) throw new NotFoundError('VENUE_NOT_FOUND');
    return venue;
  }

  /** Tableau de bord du Gestionnaire : structure, pièces, souscription, état de chaque salle et historique. */
  async get(userId: string) {
    await this.requireVenue(userId);
    const venue = await this.prisma.partnerVenue.findUniqueOrThrow({
      where: { managerId: userId },
      include: venueInclude,
    });
    const now = new Date();
    const bookableIds = new Set(
      (await this.prisma.room.findMany({
        where: { venueId: venue.id, ...bookableRoomWhere(now) },
        select: { id: true },
      })).map((r) => r.id),
    );
    const subscription = effectiveSubscription(venue.subscriptions[0] ?? null, now);
    return {
      id: venue.id,
      name: venue.name,
      type: venue.type,
      description: venue.description,
      legalName: venue.legalName,
      registrationNumber: venue.registrationNumber,
      // Visibles du seul Gestionnaire (et de l'administration) : jamais dans une API publique.
      nif: venue.nif,
      stat: venue.stat,
      contactPhone: venue.contactPhone,
      contactEmail: venue.contactEmail,
      status: venue.status,
      reviewNote: venue.reviewNote,
      submittedAt: venue.submittedAt,
      reviewedAt: venue.reviewedAt,
      documents: venue.documents.map((d) => ({
        id: d.id, type: d.type, fileName: d.fileName, mimeType: d.mimeType, sizeBytes: d.sizeBytes, uploadedAt: d.uploadedAt,
      })),
      subscription,
      rooms: venue.rooms.map((r) => ({
        id: r.id, name: r.name, status: r.status, publication: r.publication, isActive: r.isActive,
        reviewNote: r.reviewNote, bookable: bookableIds.has(r.id),
      })),
      history: venue.statusEvents.map((e) => ({
        id: e.id, scope: e.scope, roomId: e.roomId, from: e.fromStatus, to: e.toStatus, note: e.note, at: e.createdAt,
      })),
    };
  }

  async create(userId: string, dto: VenueDto) {
    const existing = await this.prisma.partnerVenue.findUnique({ where: { managerId: userId }, select: { id: true } });
    if (existing) throw new ConflictError('VENUE_ALREADY_EXISTS');
    await this.prisma.$transaction(async (tx) => {
      const venue = await tx.partnerVenue.create({ data: { managerId: userId, ...dto } });
      await recordStatus(tx, { venueId: venue.id, scope: 'VENUE', to: 'DRAFT', actorUserId: userId });
    });
    return this.get(userId);
  }

  async update(userId: string, dto: UpdateVenueDto) {
    const venue = await this.requireVenue(userId);
    const state = venue.status as VenueState;
    if (PartnerLifecycle.isVenueEditable(state)) {
      await this.prisma.partnerVenue.update({ where: { id: venue.id }, data: dto });
    } else if (state === 'APPROVED') {
      // Une structure validée ne change ni d'identité ni de pièces sans nouvel examen : seuls les contacts évoluent.
      const { contactPhone, contactEmail, description, ...locked } = dto;
      if (Object.values(locked).some((v) => v !== undefined)) throw new UnprocessableError('VENUE_FIELDS_LOCKED');
      await this.prisma.partnerVenue.update({ where: { id: venue.id }, data: { contactPhone, contactEmail, description } });
    } else {
      throw new UnprocessableError('VENUE_NOT_EDITABLE');
    }
    return this.get(userId);
  }

  /** Soumission du dossier de structure : identité, contact et au moins un justificatif (spec 8.2 étapes 4-5). */
  async submit(userId: string) {
    const venue = await this.requireVenue(userId);
    PartnerLifecycle.assertVenue(venue.status as VenueState, 'SUBMITTED', 'MANAGER');
    if (!venue.contactPhone && !venue.contactEmail) throw new UnprocessableError('VENUE_CONTACT_REQUIRED');
    const documents = await this.prisma.venueDocument.count({ where: { venueId: venue.id } });
    if (documents < 1) throw new UnprocessableError('VENUE_DOCUMENT_REQUIRED');

    await this.prisma.$transaction(async (tx: Tx) => {
      const { count } = await tx.partnerVenue.updateMany({
        where: { id: venue.id, status: venue.status },
        data: { status: 'SUBMITTED', submittedAt: new Date(), reviewNote: null },
      });
      if (count !== 1) throw new ConflictError('BOOKING_STATE_CHANGED');
      await recordStatus(tx, { venueId: venue.id, scope: 'VENUE', from: venue.status, to: 'SUBMITTED', actorUserId: userId });
      await this.outbox.write(tx, {
        aggregateType: 'partnerVenue',
        aggregateId: venue.id,
        eventType: 'partner.venue.submitted',
        recipientIds: await activeAdminIds(tx),
        payload: { venueId: venue.id },
        pushTitle: 'Nouvelle structure partenaire',
        pushBody: 'Une structure a soumis son dossier.',
      });
    });
    return this.get(userId);
  }

  // ------------------------------------------------------------------ justificatifs

  async requestDocumentUpload(userId: string, dto: UploadRequestDto) {
    const venue = await this.requireEditableVenue(userId);
    return this.uploads.createTicket('VENUE_DOCUMENT', userId, venue.id, dto);
  }

  async registerDocument(userId: string, dto: RegisterVenueDocumentDto) {
    const venue = await this.requireEditableVenue(userId);
    const file = await this.uploads.consume('VENUE_DOCUMENT', userId, venue.id, dto.uploadId);
    const previous = await this.prisma.venueDocument.findMany({
      where: { venueId: venue.id, type: dto.type }, select: { id: true, storagePath: true },
    });
    const created = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.venueDocument.create({
        data: {
          venueId: venue.id, type: dto.type, storagePath: file.storagePath, mimeType: file.mimeType,
          sizeBytes: file.sizeBytes, fileName: file.fileName ?? null,
        },
      });
      // Une pièce par type : la nouvelle remplace l'ancienne.
      if (previous.length) await tx.venueDocument.deleteMany({ where: { id: { in: previous.map((p) => p.id) } } });
      return doc;
    });
    await Promise.all(previous.map((p) => this.uploads.remove(this.cfg.partnerDocsBucket, p.storagePath)));
    return { id: created.id, type: created.type, fileName: created.fileName, mimeType: created.mimeType, sizeBytes: created.sizeBytes };
  }

  async removeDocument(userId: string, documentId: string) {
    const venue = await this.requireEditableVenue(userId);
    const doc = await this.prisma.venueDocument.findFirst({ where: { id: documentId, venueId: venue.id } });
    if (!doc) throw new NotFoundError('DOCUMENT_NOT_FOUND');
    await this.prisma.venueDocument.delete({ where: { id: doc.id } });
    await this.uploads.remove(this.cfg.partnerDocsBucket, doc.storagePath);
    return { ok: true };
  }

  private async requireEditableVenue(userId: string) {
    const venue = await this.requireVenue(userId);
    if (!PartnerLifecycle.isVenueEditable(venue.status as VenueState)) throw new UnprocessableError('VENUE_NOT_EDITABLE');
    return venue;
  }
}
