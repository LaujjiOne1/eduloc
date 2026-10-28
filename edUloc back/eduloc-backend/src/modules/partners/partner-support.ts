import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import { AppConfig } from '../../core/config/app.config';
import { RedisService } from '../../core/redis/redis.service';
import { CacheKeys } from '../../infrastructure/cache/cache.service';
import { STORAGE_PROVIDER, StorageProvider, extFromMime } from '../../infrastructure/storage/storage-provider.port';
import { NotFoundError, UnprocessableError } from '../../common/errors/domain-errors';

export type Tx = Prisma.TransactionClient;

export const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const DOCUMENT_LIMIT_BYTES = 10 * 1024 * 1024;
export const PHOTO_LIMIT_BYTES = 8 * 1024 * 1024;
export const MAX_PHOTOS_PER_ROOM = 10;

/** Journal des changements de statut (écran admin « historique », spec 11). */
export async function recordStatus(
  tx: Tx,
  event: {
    venueId: string; roomId?: string | null; scope: 'VENUE' | 'ROOM' | 'PUBLICATION' | 'SUBSCRIPTION';
    from?: string | null; to: string; actorUserId?: string | null; note?: string | null;
  },
): Promise<void> {
  await tx.partnerStatusEvent.create({
    data: {
      venueId: event.venueId,
      roomId: event.roomId ?? null,
      scope: event.scope,
      fromStatus: event.from ?? null,
      toStatus: event.to,
      actorUserId: event.actorUserId ?? null,
      note: event.note ?? null,
    },
  });
}

/** Les administrateurs actifs, destinataires des soumissions. */
export async function activeAdminIds(tx: Tx): Promise<string[]> {
  const admins = await tx.user.findMany({ where: { isAdmin: true, status: 'ACTIVE' }, select: { id: true } });
  return admins.map((a) => a.id);
}

interface UploadMetadata {
  userId: string;
  scope: 'VENUE_DOCUMENT' | 'ROOM_PHOTO';
  /** Identifiant de la structure (VENUE_DOCUMENT) ou de la salle (ROOM_PHOTO). */
  ownerId: string;
  bucket: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  fileName?: string;
}

/**
 * Envoi de fichiers en deux temps (URL signée, puis enregistrement), comme pour les justificatifs des tuteurs. Les
 * justificatifs de structure sont privés (lecture admin par URL signée courte) ; les photos de salle sont servies
 * par URL signée dans la fiche publique.
 */
@Injectable()
export class PartnerUploadsService {
  constructor(
    private readonly cfg: AppConfig,
    private readonly redis: RedisService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async createTicket(
    scope: UploadMetadata['scope'], userId: string, ownerId: string,
    input: { mimeType: string; sizeBytes: number; fileName?: string },
  ) {
    const isDoc = scope === 'VENUE_DOCUMENT';
    const allowed: readonly string[] = isDoc ? DOCUMENT_MIME_TYPES : PHOTO_MIME_TYPES;
    if (!allowed.includes(input.mimeType)) throw new UnprocessableError('MIME_TYPE_NOT_ALLOWED');
    if (input.sizeBytes > (isDoc ? DOCUMENT_LIMIT_BYTES : PHOTO_LIMIT_BYTES)) throw new UnprocessableError('FILE_TOO_LARGE');
    const fileId = randomUUID();
    const bucket = isDoc ? this.cfg.partnerDocsBucket : this.cfg.roomPhotosBucket;
    const storagePath = `${isDoc ? 'venues' : 'rooms'}/${ownerId}/${fileId}${extFromMime(input.mimeType)}`;
    const { signedUrl, token } = await this.storage.createSignedUploadUrl(bucket, storagePath);
    const uploadId = randomUUID();
    const metadata: UploadMetadata = { userId, scope, ownerId, bucket, storagePath, ...input };
    await this.redis.set(CacheKeys.upload(uploadId), JSON.stringify(metadata), 900);
    return { uploadId, signedUrl, token, expiresAt: new Date(Date.now() + 900_000) };
  }

  /** Consomme le ticket (usage unique) et vérifie le fichier réellement déposé. */
  async consume(scope: UploadMetadata['scope'], userId: string, ownerId: string, uploadId: string) {
    const raw = await this.redis.getDel(CacheKeys.upload(uploadId));
    if (!raw) throw new UnprocessableError('UPLOAD_EXPIRED');
    const meta = JSON.parse(raw) as UploadMetadata;
    if (meta.userId !== userId || meta.scope !== scope || meta.ownerId !== ownerId) {
      throw new UnprocessableError('UPLOAD_MISMATCH');
    }
    const stored = await this.storage.getObjectInfo(meta.bucket, meta.storagePath);
    if (!stored.exists) throw new UnprocessableError('UPLOAD_NOT_FOUND');
    const limit = scope === 'VENUE_DOCUMENT' ? DOCUMENT_LIMIT_BYTES : PHOTO_LIMIT_BYTES;
    if (stored.sizeBytes <= 0 || stored.sizeBytes > limit) {
      await this.storage.deleteObject(meta.bucket, meta.storagePath);
      throw new UnprocessableError('FILE_TOO_LARGE');
    }
    if (stored.mimeType && stored.mimeType !== meta.mimeType) {
      await this.storage.deleteObject(meta.bucket, meta.storagePath);
      throw new UnprocessableError('MIME_TYPE_MISMATCH');
    }
    return { ...meta, sizeBytes: stored.sizeBytes, mimeType: stored.mimeType || meta.mimeType };
  }

  readUrl(bucket: string, storagePath: string, seconds = 900): Promise<string> {
    return this.storage.createSignedReadUrl(bucket, storagePath, seconds);
  }

  async remove(bucket: string, storagePath: string): Promise<void> {
    await this.storage.deleteObject(bucket, storagePath).catch(() => undefined);
  }

  /** Utile aux services qui doivent échouer proprement si la structure / salle n'existe pas. */
  static requireFound<T>(value: T | null | undefined, code: string): T {
    if (value === null || value === undefined) throw new NotFoundError(code);
    return value;
  }
}
