import { Inject, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import type { Prisma } from '../../generated/prisma/client';
import { RateLimitService } from '../../common/rate-limit.service';
import { AppConfig } from '../../core/config/app.config';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { CacheKeys } from '../../infrastructure/cache/cache.service';
import { CV_IMPORT_PROCESS } from '../../infrastructure/outbox/outbox-event-types';
import { STORAGE_PROVIDER, StorageProvider, cvImportPath, extFromMime } from '../../infrastructure/storage/storage-provider.port';
import { cleanExtractedText } from '../matching/indexing/document-cleaning';
import { DOCX_MIME, DocumentExtractionError, DocumentTextService } from '../matching/indexing/document-text.service';
import { IndexingProcessor } from '../matching/indexing/indexing.processor';
import { CvExtractorService, CvImportError } from './cv-extractor.service';
import { prepareCv, textForSkills } from './cv-entries';
import { normalizeCv } from './cv-normalizer';
import type { CvPrefill } from './cv-schema';
import { SubjectMatcherService } from './subject-matcher.service';

export const CV_MIME_TYPES = ['application/pdf', DOCX_MIME, 'image/jpeg', 'image/png'] as const;
export const CV_MAX_BYTES = 10 * 1024 * 1024;
/** En dessous, le texte lu n'est pas un CV (page blanche, photo floue). */
const MIN_CV_CHARS = 80;
const UPLOAD_TTL_SECONDS = 900;
const IMPORTS_PER_HOUR = 6;

/** Étape affichée dans l'app pendant l'analyse. */
export type CvImportStage = 'READING' | 'ANALYZING' | 'MATCHING';

interface CvUploadMetadata {
  userId: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  fileName?: string;
}

/**
 * Import de CV pour pré-remplir le dossier tuteur :
 *   upload signé → tâche de fond (outbox) → lecture (texte natif / PaddleOCR) → LLM à schéma strict →
 *   validation et garde-fou anti-hallucination → rapprochement du catalogue (EmbeddingGemma) → proposition.
 * Le résultat n'est JAMAIS la vérité : l'application le montre, le tuteur corrige et confirme.
 */
@Injectable()
export class CvImportService {
  private readonly logger = new Logger(CvImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: AppConfig,
    private readonly redis: RedisService,
    private readonly rateLimit: RateLimitService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly documents: DocumentTextService,
    private readonly extractor: CvExtractorService,
    private readonly matcher: SubjectMatcherService,
    private readonly processor: IndexingProcessor,
  ) {
    processor.register(CV_IMPORT_PROCESS, (id) => this.process(id));
  }

  /** Étape 1 : URL signée pour envoyer le CV (PDF, Word, JPG ou PNG, 10 Mo maximum). */
  async requestUpload(userId: string, input: { mimeType: string; sizeBytes: number; fileName?: string }) {
    if (!(CV_MIME_TYPES as readonly string[]).includes(input.mimeType)) throw new UnprocessableEntityException('MIME_TYPE_NOT_ALLOWED');
    if (input.sizeBytes > CV_MAX_BYTES) throw new UnprocessableEntityException('FILE_TOO_LARGE');
    await this.rateLimit.consume(`rl:cv-import:${userId}`, IMPORTS_PER_HOUR, 3600);
    // Le fichier part à l'instant : le modèle se charge pendant l'envoi plutôt qu'après.
    void this.extractor.warmUp();

    const storagePath = cvImportPath(userId, randomUUID(), extFromMime(input.mimeType));
    const { signedUrl, token } = await this.storage.createSignedUploadUrl(this.cfg.tutorDocsBucket, storagePath);
    const uploadId = randomUUID();
    const metadata: CvUploadMetadata = { userId, storagePath, mimeType: input.mimeType, sizeBytes: input.sizeBytes, fileName: input.fileName };
    await this.redis.set(CacheKeys.upload(uploadId), JSON.stringify(metadata), UPLOAD_TTL_SECONDS);
    return { uploadId, signedUrl, token, expiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000) };
  }

  /** Étape 2 : le fichier est envoyé ; l'analyse part en tâche de fond, jamais dans la requête. */
  async create(userId: string, uploadId: string) {
    const raw = await this.redis.getDel(CacheKeys.upload(uploadId));
    if (!raw) throw new UnprocessableEntityException('UPLOAD_EXPIRED');
    const meta = JSON.parse(raw) as CvUploadMetadata;
    if (meta.userId !== userId) throw new UnprocessableEntityException('UPLOAD_MISMATCH');

    const stored = await this.storage.getObjectInfo(this.cfg.tutorDocsBucket, meta.storagePath);
    if (!stored.exists) throw new UnprocessableEntityException('UPLOAD_NOT_FOUND');
    if (stored.sizeBytes <= 0 || stored.sizeBytes > CV_MAX_BYTES) throw new UnprocessableEntityException('FILE_TOO_LARGE');

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.cvImport.create({
        data: {
          userId, fileName: meta.fileName ?? null, mimeType: meta.mimeType, sizeBytes: stored.sizeBytes, storagePath: meta.storagePath,
        },
      });
      await tx.outboxEvent.create({
        data: { aggregateType: 'CvImport', aggregateId: row.id, eventType: CV_IMPORT_PROCESS, recipientIds: [], payload: {} },
      });
      return row;
    });
    // Sans attendre le passage périodique (5 s) : l'analyse démarre tout de suite. Sans effet si un passage est en cours.
    void this.processor.tick();
    return this.toResponse(created);
  }

  async get(userId: string, id: string) {
    const row = await this.prisma.cvImport.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('CV_IMPORT_NOT_FOUND');
    return this.toResponse(row);
  }

  /**
   * Tâche CV_IMPORT_PROCESS. Un échec identifiable (CV illisible, modèle absent) passe en FAILED sans nouvelle
   * tentative — l'app propose la saisie manuelle ; une erreur de stockage remonte pour que l'outbox réessaie.
   */
  async process(importId: string): Promise<void> {
    const row = await this.prisma.cvImport.findUnique({ where: { id: importId } });
    if (!row || row.status === 'DONE' || row.status === 'FAILED') return;
    const started = Date.now();
    await this.prisma.cvImport.update({ where: { id: row.id }, data: { status: 'PROCESSING' } });

    let file: Buffer;
    try {
      file = await this.storage.downloadObject(this.cfg.tutorDocsBucket, row.storagePath);
    } catch (err) {
      await this.prisma.cvImport.update({ where: { id: row.id }, data: { status: 'PENDING' } });
      throw err;
    }

    try {
      // Même fichier déjà analysé par ce tuteur : texte (donc OCR) et numéros de ligne du modèle sont réutilisés.
      const fileHash = createHash('sha256').update(file).digest('hex');
      const previous = await this.prisma.cvImport.findFirst({
        where: {
          userId: row.userId, fileHash, status: 'DONE', model: this.extractor.model, extractedText: { not: null }, id: { not: row.id },
        },
        orderBy: { createdAt: 'desc' },
        select: { extractedText: true, ocrEngine: true, llmEntries: true },
      });

      let text: string;
      let engine: string | null;
      if (previous?.extractedText) {
        text = previous.extractedText;
        engine = previous.ocrEngine;
        this.logger.log(`Import de CV ${row.id} : fichier déjà analysé, texte réutilisé.`);
      } else {
        await this.setStage(row.id, 'READING', fileHash);
        const read = await this.documents.extractTextDetailed(file, row.mimeType);
        text = cleanExtractedText(read.text);
        engine = read.engine;
      }
      if (text.replace(/\s/g, '').length < MIN_CV_CHARS) throw new CvImportError('UNREADABLE', 'Texte extrait vide ou trop court.');

      await this.setStage(row.id, 'ANALYZING', fileHash);
      const { raw, entries } = await this.extractor.extract(text, previous?.llmEntries ?? undefined);
      await this.setStage(row.id, 'MATCHING', fileHash);
      const prefill = await this.enrich(normalizeCv(raw, text), text);
      await this.prisma.cvImport.update({
        where: { id: row.id },
        data: {
          status: 'DONE', stage: null, fileHash, extractedText: text, result: prefill as unknown as Prisma.InputJsonValue, errorCode: null,
          llmEntries: entries as unknown as Prisma.InputJsonValue,
          ocrEngine: engine, model: this.extractor.model, durationMs: Date.now() - started,
        },
      });
    } catch (err) {
      const code = err instanceof CvImportError ? err.code : err instanceof DocumentExtractionError ? 'UNREADABLE' : null;
      if (!code) {
        await this.prisma.cvImport.update({ where: { id: row.id }, data: { status: 'PENDING' } });
        throw err;
      }
      this.logger.warn(`Import de CV ${row.id} impossible (${code}) : ${(err as Error).message}`);
      await this.prisma.cvImport.update({
        where: { id: row.id }, data: { status: 'FAILED', errorCode: code, durationMs: Date.now() - started },
      });
    }
  }

  private setStage(id: string, stage: CvImportStage, fileHash: string) {
    return this.prisma.cvImport.update({ where: { id }, data: { stage, fileHash } });
  }

  /**
   * Matières, compétences et domaine par le catalogue, après la lecture du CV : mots du catalogue d'abord, puis
   * EmbeddingGemma pour les synonymes. Jamais bloquant : un échec laisse la proposition telle quelle.
   */
  private async enrich(prefill: CvPrefill, text: string): Promise<CvPrefill> {
    const [experiences, skills, education] = await Promise.all([
      this.matcher.fillSubjects(prefill.experiences).catch(() => prefill.experiences),
      this.matcher.skillsFromText(textForSkills(prepareCv(text))).catch((): CvPrefill['skills'] => []),
      this.matcher.normalizeFields(prefill.education).catch(() => prefill.education),
    ]);
    return { ...prefill, experiences, skills, education };
  }

  private toResponse(row: { id: string; status: string; stage: string | null; errorCode: string | null; result: unknown; fileName: string | null; createdAt: Date }) {
    return {
      id: row.id,
      status: row.status,
      stage: row.status === 'PROCESSING' ? row.stage : null,
      fileName: row.fileName,
      errorCode: row.errorCode,
      result: row.status === 'DONE' ? (row.result as CvPrefill) : null,
      createdAt: row.createdAt,
    };
  }
}
