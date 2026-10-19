import {
  ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { EQUIVALENT_DEGREES, MIN_TUTOR_ACADEMIC_RANK } from '../catalog/domain/academic-scale';
import { normalizeSkillName } from '../catalog/domain/degree-policy';
import { enqueueTutorReindex } from '../matching/indexing/reindex-events';
import { AcademicLevelService } from './academic-level.service';

export interface DegreeKey {
  degreeTitle: string;
  country: string;
  specialty?: string | null;
}

export interface EquivalenceDecision {
  status: 'PENDING' | 'VALIDATED' | 'REJECTED';
  equivalentDegree?: string | null;
  equivalentLevelId?: string | null;
  notes?: string | null;
}

/**
 * Clé de comparaison d'un diplôme déclaré : minuscules, sans accents ni ponctuation. Deux tuteurs qui écrivent
 * « DUT Génie électrique » et « dut genie electrique » au même pays partagent la même équivalence.
 */
export const equivalenceKey = (k: DegreeKey): string =>
  [k.degreeTitle, k.country, k.specialty ?? ''].map(normalizeSkillName).join('|');

/**
 * Équivalences de diplômes hors catégories principales (spec §3.2 et §13, décision 2). Aucune équivalence n'est
 * codée en dur : chaque décision est prise par un admin, conservée, puis réutilisée. Une équivalence validée
 * alimente `TutorProfile.academicLevelId` (exigence E9).
 */
@Injectable()
export class DegreeEquivalencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly academicLevels: AcademicLevelService,
    private readonly cache: CacheService,
  ) {}

  list(q: { status?: string; search?: string; page: number }) {
    return this.prisma.degreeEquivalence.findMany({
      where: {
        ...(q.status ? { status: q.status as never } : {}),
        ...(q.search
          ? {
              OR: [
                { degreeTitle: { contains: q.search, mode: 'insensitive' } },
                { country: { contains: q.search, mode: 'insensitive' } },
                { specialty: { contains: q.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { equivalentLevel: { select: { id: true, name: true, category: true, academicRank: true } } },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      skip: (q.page - 1) * 50,
      take: 50,
    });
  }

  /** Étape 1 de la revue d'un diplôme OTHER : l'écran admin cherche l'équivalence correspondante. */
  async lookup(key: DegreeKey, db: Pick<PrismaService, 'degreeEquivalence'> = this.prisma) {
    return (await this.matchAll(db, [key])).get(equivalenceKey(key)) ?? null;
  }

  /** Une seule lecture de la table (administrable, donc petite) pour rapprocher plusieurs diplômes. */
  async matchAll(db: Pick<PrismaService, 'degreeEquivalence'>, keys: DegreeKey[]) {
    const wanted = new Set(keys.map(equivalenceKey));
    const rows = await db.degreeEquivalence.findMany({
      include: { equivalentLevel: { select: { id: true, name: true, category: true, academicRank: true } } },
      take: 5000,
    });
    const found = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const k = equivalenceKey(row);
      if (wanted.has(k)) found.set(k, row);
    }
    return found;
  }

  /** Étape 3 : l'admin crée l'équivalence absente (PENDING) ou la crée déjà tranchée. */
  async create(adminId: string, dto: DegreeKey & EquivalenceDecision) {
    const degreeTitle = dto.degreeTitle.trim();
    const country = dto.country.trim();
    const specialty = dto.specialty?.trim() ?? '';
    if (await this.lookup({ degreeTitle, country, specialty })) {
      throw new ConflictException('DEGREE_EQUIVALENCE_DUPLICATE');
    }
    const decision = await this.checkDecision(this.prisma, dto);
    return this.prisma.degreeEquivalence.create({
      data: {
        degreeTitle, country, specialty, ...decision,
        validatedById: dto.status === 'PENDING' ? null : adminId,
        validatedAt: dto.status === 'PENDING' ? null : new Date(),
      },
    });
  }

  /** Tranche une équivalence : VALIDATED avec un niveau, ou REJECTED. */
  async decide(adminId: string, id: string, dto: EquivalenceDecision) {
    const existing = await this.prisma.degreeEquivalence.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('DEGREE_EQUIVALENCE_NOT_FOUND');
    const decision = await this.checkDecision(this.prisma, dto);
    return this.prisma.degreeEquivalence.update({
      where: { id },
      data: {
        ...decision,
        validatedById: dto.status === 'PENDING' ? null : adminId,
        validatedAt: dto.status === 'PENDING' ? null : new Date(),
      },
    });
  }

  /**
   * Étape 2/3 : applique une équivalence VALIDATED au dossier d'un tuteur. `highestDegree` reçoit
   * `equivalentDegree` (valeur effective des flux existants) et le niveau académique est alimenté par
   * `equivalentLevelId`, au nom de l'admin qui applique.
   */
  async applyToApplication(adminId: string, applicationId: string, degreeEquivalenceId: string) {
    const application = await this.prisma.tutorApplication.findUnique({
      where: { id: applicationId },
      select: { tutorProfileId: true },
    });
    if (!application) throw new NotFoundException('APPLICATION_NOT_FOUND');
    const result = await this.prisma.$transaction((tx) =>
      this.applyInTx(tx, adminId, application.tutorProfileId, degreeEquivalenceId),
    );
    await this.cache.bumpSearch();
    return result;
  }

  async applyInTx(
    tx: Prisma.TransactionClient,
    adminId: string,
    tutorProfileId: string,
    degreeEquivalenceId: string,
  ) {
    const equivalence = await tx.degreeEquivalence.findUnique({ where: { id: degreeEquivalenceId } });
    if (!equivalence) throw new NotFoundException('DEGREE_EQUIVALENCE_NOT_FOUND');
    if (equivalence.status !== 'VALIDATED' || !equivalence.equivalentDegree || !equivalence.equivalentLevelId) {
      throw new UnprocessableEntityException('DEGREE_EQUIVALENCE_NOT_VALIDATED');
    }
    const profile = await tx.tutorProfile.findUnique({
      where: { id: tutorProfileId },
      select: { highestDegree: true, degreeEquivalenceId: true },
    });
    if (!profile) throw new NotFoundException('TUTOR_NOT_FOUND');
    // Une équivalence ne sert qu'aux diplômes OTHER (ou à corriger une équivalence déjà appliquée).
    if (profile.highestDegree !== 'OTHER' && !profile.degreeEquivalenceId) {
      throw new UnprocessableEntityException('DEGREE_NOT_OTHER');
    }
    await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { highestDegree: equivalence.equivalentDegree, degreeEquivalenceId: equivalence.id },
    });
    const tutor = await this.academicLevels.validateInTx(
      tx, adminId, tutorProfileId, equivalence.equivalentLevelId,
      `Équivalence appliquée : ${equivalence.degreeTitle} (${equivalence.country})`,
    );
    await enqueueTutorReindex(tx, tutorProfileId);
    return { tutorProfileId, degreeEquivalenceId: equivalence.id, tutor };
  }

  /** Cohérence d'une décision ; renvoie les colonnes à écrire (null hors VALIDATED). */
  private async checkDecision(db: Pick<PrismaService, 'educationLevel'>, d: EquivalenceDecision) {
    const notes = d.notes?.trim() || null;
    if (d.status !== 'VALIDATED') {
      if (d.equivalentDegree || d.equivalentLevelId) throw new UnprocessableEntityException('DEGREE_EQUIVALENCE_INVALID');
      return { status: d.status, equivalentDegree: null, equivalentLevelId: null, notes };
    }
    if (!d.equivalentDegree || !(EQUIVALENT_DEGREES as readonly string[]).includes(d.equivalentDegree) || !d.equivalentLevelId) {
      throw new UnprocessableEntityException('DEGREE_EQUIVALENCE_INVALID');
    }
    const level = await db.educationLevel.findUnique({
      where: { id: d.equivalentLevelId },
      select: { isActive: true, academicRank: true },
    });
    if (!level || !level.isActive || level.academicRank == null || level.academicRank < MIN_TUTOR_ACADEMIC_RANK) {
      throw new UnprocessableEntityException('ACADEMIC_LEVEL_INVALID');
    }
    return {
      status: d.status,
      equivalentDegree: d.equivalentDegree,
      equivalentLevelId: d.equivalentLevelId,
      notes,
    };
  }
}
