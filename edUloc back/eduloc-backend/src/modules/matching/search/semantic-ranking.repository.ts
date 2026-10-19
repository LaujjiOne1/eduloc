import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { toPgVector } from '../embedding/embedding-format';
import type { SourceType } from './scoring';

export interface BestSimilarityRow {
  tutorProfileId: string;
  sourceType: SourceType;
  label: string;
  sim: number;
}

/**
 * Phase 2 — similarités par chunk, RESTREINTES aux candidats de la Phase 1 (scan exact, sans index ANN en V1).
 * Le vecteur est passé en `'[...]'::vector` (JSON.stringify), jamais concaténé dans le SQL.
 */
@Injectable()
export class SemanticRankingRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Meilleure similarité cosinus (1 − distance) de chaque candidat pour chaque type de source. */
  async bestSimilarities(queryVector: number[], candidateIds: string[], embeddingModel: string): Promise<BestSimilarityRow[]> {
    if (!candidateIds.length) return [];
    const rows = await this.prisma.$queryRaw<(Omit<BestSimilarityRow, 'sim'> & { sim: number | string })[]>(Prisma.sql`
      WITH scored AS (
        SELECT c."tutorProfileId", c."sourceType"::text AS "sourceType", c.label,
               1 - (c.embedding <=> ${toPgVector(queryVector)}::vector) AS sim
        FROM tutor_search_chunks c
        WHERE c."tutorProfileId" = ANY(${candidateIds}::text[])
          AND c."embeddingModel" = ${embeddingModel}
          AND c.embedding IS NOT NULL
      )
      SELECT DISTINCT ON ("tutorProfileId", "sourceType") "tutorProfileId", "sourceType", label, sim
      FROM scored
      ORDER BY "tutorProfileId", "sourceType", sim DESC`);
    return rows.map((r) => ({ ...r, sim: Number(r.sim) }));
  }

  /** Candidats ayant au moins un chunk (SUBJECT ou OFFER) rattaché à la matière demandée : bonus « matière déclarée ». */
  async tutorsDeclaringSubject(candidateIds: string[], subjectId: string): Promise<Set<string>> {
    if (!candidateIds.length) return new Set();
    const rows = await this.prisma.$queryRaw<{ tutorProfileId: string }[]>(Prisma.sql`
      SELECT DISTINCT "tutorProfileId" FROM tutor_search_chunks
      WHERE "tutorProfileId" = ANY(${candidateIds}::text[]) AND "subjectId" = ${subjectId}
        AND "sourceType" IN ('SUBJECT'::"SearchChunkSource", 'OFFER'::"SearchChunkSource")`);
    return new Set(rows.map((r) => r.tutorProfileId));
  }
}
