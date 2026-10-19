import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { UNIVERSITY_CATEGORY } from '../../catalog/domain/academic-scale';
import type { Format } from './level-eligibility';

export interface PreselectionParams {
  /** Rang minimal du niveau académique VALIDÉ du tuteur (minimumTutorRank). */
  minTutorRank: number;
  /** Ids du niveau demandé et de ses équivalents de même rang (ex. « Master » historique ↔ « Master 1 »). */
  levelIds: string[];
  formats: Format[];
  embeddingModel: string;
  /** Un demandeur qui est aussi tuteur ne se propose pas lui-même. */
  requesterId: string;
}

/**
 * Phase 1 — présélection déterministe en SQL (spec §6.2 + exigences E1 à E8). Aucune IA : tout ce qui rend un
 * tuteur admissible est décidé ici, avant le moindre calcul de similarité.
 *
 *  R1  profil visible et non suspendu             R4  a déclaré le niveau demandé (au moins une matière)
 *  R2  compte actif                               R5  au moins une offre active compatible (niveau, format)
 *  R3' (E8, remplace R3) niveau académique VALIDÉ du tuteur, dans le bloc universitaire, de rang suffisant
 *  R6  est indexé avec le modèle courant          (R7, géolocalisation, optionnelle en V1 : non appliquée)
 *
 * SQL brut uniquement via Prisma.sql, paramètres liés.
 */
@Injectable()
export class PreselectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCandidateIds(p: PreselectionParams): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT tp.id
      FROM tutor_profiles tp
      JOIN users u ON u.id = tp."userId"
      JOIN education_levels tl ON tl.id = tp."academicLevelId"
      WHERE tp."isVisible" = true
        AND tp."suspendedAt" IS NULL
        AND u.status = 'ACTIVE' AND u."deletedAt" IS NULL
        AND tp."userId" <> ${p.requesterId}
        AND tp."academicLevelValidatedAt" IS NOT NULL
        AND tl.category = ${UNIVERSITY_CATEGORY}
        AND tl."academicRank" >= ${p.minTutorRank}
        AND EXISTS (SELECT 1 FROM tutor_subjects ts
                    WHERE ts."tutorProfileId" = tp.id AND ts."educationLevelId" = ANY(${p.levelIds}::text[]))
        AND EXISTS (SELECT 1 FROM offers o
                    WHERE o."tutorProfileId" = tp.id AND o."isActive" AND o."disabledByAdminAt" IS NULL
                      AND (o."educationLevelId" = ANY(${p.levelIds}::text[]) OR o."educationLevelId" IS NULL)
                      AND o.format = ANY(${p.formats}::"TeachingFormat"[]))
        AND EXISTS (SELECT 1 FROM tutor_search_chunks c
                    WHERE c."tutorProfileId" = tp.id AND c."embeddingModel" = ${p.embeddingModel}
                      AND c.embedding IS NOT NULL)
      ORDER BY tp.id`);
    return rows.map((r) => r.id);
  }
}
