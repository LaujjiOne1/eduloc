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

  /** Meilleure similarité cosinus (1 − distance) de chaque candidat pour chaque type de source, plancher absolu `minSimilarity` appliqué. */
  async bestSimilarities(
    queryVector: number[], candidateIds: string[], embeddingModel: string, minSimilarity = 0,
  ): Promise<BestSimilarityRow[]> {
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
      , kept AS (
        -- Plancher absolu : un tuteur dont la MEILLEURE source reste sous le seuil est écarté en entier.
        SELECT "tutorProfileId" FROM scored GROUP BY "tutorProfileId" HAVING MAX(sim) >= ${minSimilarity}
      )
      SELECT DISTINCT ON (s."tutorProfileId", s."sourceType") s."tutorProfileId", s."sourceType", s.label, s.sim
      FROM scored s JOIN kept k ON k."tutorProfileId" = s."tutorProfileId"
      ORDER BY s."tutorProfileId", s."sourceType", s.sim DESC`);
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
