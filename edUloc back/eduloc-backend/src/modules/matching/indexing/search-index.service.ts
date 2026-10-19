import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { Prisma } from '../../../generated/prisma/client';
import { AppConfig } from '../../../core/config/app.config';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { toPgVector } from '../embedding/embedding-format';
import { OllamaEmbeddingService } from '../embedding/ollama-embedding.service';
import { ChunkBuilderService, ExpectedChunk, TutorIndexSource } from './chunk-builder.service';

export interface ReindexResult {
  /** false : tuteur absent ou dossier non approuvé, rien n'a été indexé. */
  indexed: boolean;
  /** Chunks envoyés à Ollama (nouveaux ou modifiés). */
  embedded: number;
  /** Chunks inchangés, non recalculés (hash identique). */
  kept: number;
  /** Chunks supprimés (source disparue). */
  deleted: number;
}

const keyOf = (c: { sourceType: string; sourceId: string; chunkIndex: number }) =>
  `${c.sourceType}|${c.sourceId}|${c.chunkIndex}`;

/**
 * Indexation d'un tuteur dans `tutor_search_chunks` (spec §4). Opération IDEMPOTENTE : seuls les chunks nouveaux
 * ou modifiés (hash) sont envoyés à Ollama ; si Ollama est indisponible, rien n'est supprimé ni écrit et l'erreur
 * remonte pour que l'outbox réessaie.
 */
@Injectable()
export class SearchIndexService {
  private readonly logger = new Logger(SearchIndexService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: AppConfig,
    private readonly embeddings: OllamaEmbeddingService,
    private readonly chunkBuilder: ChunkBuilderService,
  ) {}

  /** sha256(embeddingModel + EMBEDDING_DIM + content) : le modèle ou la dimension changent ⇒ tout est recalculé. */
  contentHash(content: string): string {
    return createHash('sha256').update(`${this.cfg.embeddingModel}${this.cfg.embeddingDim}${content}`).digest('hex');
  }

  /** Données validées d'un tuteur approuvé (null sinon) : profil, matières, expériences, offres actives, documents approuvés. */
  async loadSource(tutorProfileId: string): Promise<TutorIndexSource | null> {
    const profile = await this.prisma.tutorProfile.findUnique({
      where: { id: tutorProfileId },
      include: {
        applications: { where: { status: 'APPROVED' }, select: { id: true }, take: 1 },
        subjects: { include: { subject: true, educationLevel: true } },
        experiences: true,
        offers: {
          where: { isActive: true, disabledByAdminAt: null },
          include: { subject: true, educationLevel: true },
        },
      },
    });
    if (!profile || profile.applications.length === 0) return null;

    const documents = await this.prisma.tutorDocument.findMany({
      where: {
        tutorApplication: { tutorProfileId, status: 'APPROVED' },
        status: 'APPROVED',
        type: { not: 'IDENTITY' },
        extractionStatus: 'DONE',
        extractedText: { not: null },
      },
      select: { id: true, type: true, fileName: true, extractedText: true },
      orderBy: { uploadedAt: 'asc' },
    });

    return {
      id: profile.id,
      highestDegree: profile.highestDegree,
      degreeTitle: profile.degreeTitle,
      fieldOfStudy: profile.fieldOfStudy,
      specialization: profile.specialization,
      degreeInstitution: profile.degreeInstitution,
      subjects: profile.subjects.map((t) => ({
        subjectId: t.subjectId,
        subjectName: t.subject.name,
        aliases: t.subject.aliases,
        levelName: t.educationLevel.name,
        competenceDescription: t.competenceDescription,
      })),
      experiences: profile.experiences.map((e) => ({
        id: e.id, type: e.type, title: e.title, organization: e.organization, period: e.period, description: e.description,
        audience: e.audience, subjectsTaught: e.subjectsTaught,
      })),
      // Offres de niveau universitaire ou sans niveau (spec §5.2).
      offers: profile.offers
        .filter((o) => !o.educationLevel || o.educationLevel.category === 'Université')
        .map((o) => ({ id: o.id, title: o.title, description: o.description, subjectId: o.subjectId, subjectName: o.subject.name })),
      documents: documents.map((d) => ({
        id: d.id, type: d.type as TutorIndexSource['documents'][number]['type'], fileName: d.fileName, extractedText: d.extractedText as string,
      })),
    };
  }

  async reindexTutor(tutorProfileId: string): Promise<ReindexResult> {
    const source = await this.loadSource(tutorProfileId);
    if (!source) return { indexed: false, embedded: 0, kept: 0, deleted: 0 };

    const expected = this.chunkBuilder.build(source);
    const existing = await this.prisma.tutorSearchChunk.findMany({
      where: { tutorProfileId },
      select: { id: true, sourceType: true, sourceId: true, chunkIndex: true, contentHash: true, embeddingModel: true },
    });
    // `embedding` est une colonne Unsupported : lecture par SQL brut.
    const withoutVector = new Set(
      (await this.prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM tutor_search_chunks WHERE "tutorProfileId" = ${tutorProfileId} AND embedding IS NULL`,
      )).map((r) => r.id),
    );
    const existingByKey = new Map(existing.map((c) => [keyOf(c), c]));

    const toEmbed: ExpectedChunk[] = expected.filter((chunk) => {
      const current = existingByKey.get(keyOf(chunk));
      return (
        !current ||
        current.contentHash !== this.contentHash(chunk.content) ||
        current.embeddingModel !== this.cfg.embeddingModel ||
        withoutVector.has(current.id)
      );
    });

    // Ollama d'abord : s'il échoue, aucune écriture ni suppression (les anciens chunks restent utilisables).
    const vectors = toEmbed.length ? await this.embeddings.embedTexts(toEmbed.map((c) => c.content)) : [];

    const expectedKeys = new Set(expected.map(keyOf));
    const stale = existing.filter((c) => !expectedKeys.has(keyOf(c)));

    await this.prisma.$transaction(async (tx) => {
      for (const [i, chunk] of toEmbed.entries()) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO tutor_search_chunks
            (id, "tutorProfileId", "sourceType", "sourceId", "chunkIndex", label, content, "contentHash", "subjectId",
             embedding, "embeddingModel", "embeddedAt", "updatedAt")
          VALUES
            (${randomUUID()}, ${tutorProfileId}, ${chunk.sourceType}::"SearchChunkSource", ${chunk.sourceId}, ${chunk.chunkIndex},
             ${chunk.label}, ${chunk.content}, ${this.contentHash(chunk.content)}, ${chunk.subjectId},
             ${toPgVector(vectors[i])}::vector, ${this.cfg.embeddingModel}, now(), now())
          ON CONFLICT ("tutorProfileId", "sourceType", "sourceId", "chunkIndex") DO UPDATE SET
            label = EXCLUDED.label, content = EXCLUDED.content, "contentHash" = EXCLUDED."contentHash",
            "subjectId" = EXCLUDED."subjectId", embedding = EXCLUDED.embedding,
            "embeddingModel" = EXCLUDED."embeddingModel", "embeddedAt" = EXCLUDED."embeddedAt", "updatedAt" = now()`);
      }
      if (stale.length) {
        await tx.tutorSearchChunk.deleteMany({ where: { id: { in: stale.map((c) => c.id) } } });
      }
      await tx.tutorProfile.update({ where: { id: tutorProfileId }, data: { searchIndexedAt: new Date() } });
    });

    const result = { indexed: true, embedded: toEmbed.length, kept: expected.length - toEmbed.length, deleted: stale.length };
    this.logger.log(`Tuteur ${tutorProfileId} indexé : ${result.embedded} calculé(s), ${result.kept} inchangé(s), ${result.deleted} supprimé(s).`);
    return result;
  }
}
