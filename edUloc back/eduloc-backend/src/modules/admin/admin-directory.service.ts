import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfig } from '../../core/config/app.config';
import { STORAGE_PROVIDER, StorageProvider } from '../../infrastructure/storage/storage-provider.port';

const PAGE_SIZE = 50;

/** Lectures du back-office : justificatifs, offres et réservations (aucune écriture ici). */
@Injectable()
export class AdminDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: AppConfig,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /**
   * Lien de lecture court d'un justificatif de tuteur. L'administrateur ne peut attester de l'authenticité d'un
   * diplôme (revue d'un document) qu'après l'avoir ouvert : ce lien n'est jamais renvoyé dans la liste des dossiers.
   */
  async documentUrl(documentId: string) {
    const doc = await this.prisma.tutorDocument.findUnique({
      where: { id: documentId },
      select: { storagePath: true, mimeType: true, fileName: true },
    });
    if (!doc) throw new NotFoundException('DOCUMENT_NOT_FOUND');
    const url = await this.storage.createSignedReadUrl(this.cfg.tutorDocsBucket, doc.storagePath, 600);
    return { url, mimeType: doc.mimeType, fileName: doc.fileName, expiresInSeconds: 600 };
  }

  /** Offres de tous les tuteurs, pour la modération (retrait / rétablissement). */
  async offers(q: { search?: string; state?: string; page: number }) {
    const search = q.search?.trim();
    const rows = await this.prisma.offer.findMany({
      where: {
        ...(q.state === 'ACTIVE' ? { isActive: true, disabledByAdminAt: null } : {}),
        ...(q.state === 'DISABLED_BY_ADMIN' ? { disabledByAdminAt: { not: null } } : {}),
        ...(q.state === 'INACTIVE' ? { isActive: false, disabledByAdminAt: null } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { subject: { name: { contains: search, mode: 'insensitive' } } },
                { tutorProfile: { displayName: { contains: search, mode: 'insensitive' } } },
                { tutorProfile: { user: { email: { contains: search, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      select: {
        id: true, title: true, price: true, currency: true, durationMinutes: true, format: true,
        isActive: true, disabledByAdminAt: true, createdAt: true,
        subject: { select: { name: true } },
        educationLevel: { select: { name: true } },
        tutorProfile: {
          select: {
            id: true, displayName: true, suspendedAt: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    return rows.map((o) => ({ ...o, price: o.price.toString() }));
  }

  /** Réservations avec les noms nécessaires pour reconnaître une séance (lecture seule : l'admin n'en change pas le statut). */
  async bookings(q: { status?: string; page: number }) {
    const rows = await this.prisma.booking.findMany({
      where: q.status ? { status: q.status as never } : {},
      select: {
        id: true, status: true, startAt: true, endAt: true, teachingMode: true, offerTitle: true,
        price: true, serviceFee: true, travelFee: true, roomFee: true, totalAmount: true, currency: true,
        locationLabel: true, createdAt: true,
        requester: { select: { id: true, firstName: true, lastName: true, email: true } },
        beneficiary: { select: { firstName: true } },
        tutorProfile: { select: { id: true, displayName: true, user: { select: { firstName: true, lastName: true } } } },
        room: { select: { id: true, name: true, venue: { select: { name: true } } } },
        _count: { select: { conflicts: { where: { status: 'OPEN' } } } },
      },
      orderBy: { startAt: 'desc' },
      skip: (q.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    return rows.map(({ _count, ...b }) => ({
      ...b,
      price: b.price.toString(),
      serviceFee: b.serviceFee.toString(),
      travelFee: b.travelFee.toString(),
      roomFee: b.roomFee?.toString() ?? null,
      totalAmount: b.totalAmount.toString(),
      openConflicts: _count.conflicts,
    }));
  }
}
