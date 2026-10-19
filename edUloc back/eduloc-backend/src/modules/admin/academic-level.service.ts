import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { MIN_TUTOR_ACADEMIC_RANK, academicLevelNoteRequired } from '../catalog/domain/academic-scale';
import { enqueueTutorReindex } from '../matching/indexing/reindex-events';

/**
 * Niveau académique VALIDÉ d'un tuteur (exigences E3 et E6). Seul un admin le fixe ; seul ce niveau compte pour
 * l'éligibilité universitaire. Aucune validation automatique : ni depuis le diplôme déclaré, ni depuis un document.
 */
@Injectable()
export class AcademicLevelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Valide le niveau d'un tuteur dans la transaction de l'appelant (approbation du dossier, application d'une équivalence). */
  async validateInTx(
    tx: Prisma.TransactionClient,
    adminId: string,
    tutorProfileId: string,
    academicLevelId: string,
    note?: string | null,
  ) {
    const level = await tx.educationLevel.findUnique({
      where: { id: academicLevelId },
      select: { id: true, isActive: true, academicRank: true },
    });
    // Hors échelle (ex. « Formation pro »), inactif (ancien niveau « Master ») ou sous le Lycée/Bac : refusé.
    if (!level || !level.isActive || level.academicRank == null || level.academicRank < MIN_TUTOR_ACADEMIC_RANK) {
      throw new UnprocessableEntityException('ACADEMIC_LEVEL_INVALID');
    }
    const profile = await tx.tutorProfile.findUnique({
      where: { id: tutorProfileId },
      select: { highestDegree: true },
    });
    if (!profile) throw new NotFoundException('TUTOR_NOT_FOUND');
    const trimmed = note?.trim() || null;
    // E6 : expert professionnel validé Doctorat sans doctorat ⇒ justification obligatoire.
    if (academicLevelNoteRequired(level.academicRank, profile.highestDegree) && !trimmed) {
      throw new UnprocessableEntityException('ACADEMIC_LEVEL_NOTE_REQUIRED');
    }
    // Un tuteur approuvé avant l'indexation sémantique n'a pas encore de chunks (condition R6) : on s'en assure ici.
    await enqueueTutorReindex(tx, tutorProfileId);
    return tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: {
        academicLevelId: level.id,
        academicLevelValidatedById: adminId,
        academicLevelValidatedAt: new Date(),
        academicLevelNote: trimmed,
      },
      select: this.select,
    });
  }

  async set(adminId: string, tutorProfileId: string, academicLevelId: string, note?: string) {
    const result = await this.prisma.$transaction((tx) =>
      this.validateInTx(tx, adminId, tutorProfileId, academicLevelId, note),
    );
    await this.cache.bumpSearch();
    return result;
  }

  /** Retire la validation : le tuteur n'est plus éligible à l'université tant qu'un admin ne l'a pas revalidé. */
  async revoke(tutorProfileId: string) {
    const exists = await this.prisma.tutorProfile.findUnique({ where: { id: tutorProfileId }, select: { id: true } });
    if (!exists) throw new NotFoundException('TUTOR_NOT_FOUND');
    const result = await this.prisma.tutorProfile.update({
      where: { id: tutorProfileId },
      data: {
        academicLevelId: null,
        academicLevelValidatedById: null,
        academicLevelValidatedAt: null,
        academicLevelNote: null,
      },
      select: this.select,
    });
    await this.cache.bumpSearch();
    return result;
  }

  private readonly select = {
    id: true,
    highestDegree: true,
    academicLevelId: true,
    academicLevel: { select: { id: true, name: true, category: true, academicRank: true } },
    academicLevelValidatedById: true,
    academicLevelValidatedAt: true,
    academicLevelNote: true,
  } satisfies Prisma.TutorProfileSelect;
}
