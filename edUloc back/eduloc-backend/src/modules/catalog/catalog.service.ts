import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RateLimitService } from '../../common/rate-limit.service';
import { CacheKeys, CacheService } from '../../infrastructure/cache/cache.service';
import { canTeachLevel, normalizeSkillName, subjectCoversCategory } from './domain/degree-policy';
import { trackKindOfLevel } from './domain/education-levels';

const SUGGESTION_LIMIT = 8;

type SubjectRow = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  levelCategories: string[];
  trackCodes: string[];
  isVerified: boolean;
};

const toDto = (s: SubjectRow) => ({
  id: s.id,
  name: s.name,
  category: s.category,
  description: s.description,
  levelCategories: s.levelCategories,
  trackCodes: s.trackCodes,
  isVerified: s.isVerified,
});

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly rateLimit: RateLimitService,
  ) {}

  /** Catalogue public : uniquement les compétences vérifiées. */
  subjects() {
    return this.cache.wrap(
      CacheKeys.subjects(),
      86_400,
      async () =>
        (await this.prisma.subject.findMany({ where: { isActive: true, isVerified: true }, orderBy: { name: 'asc' } })).map(toDto),
      { cacheEmpty: false },
    );
  }

  /** Niveaux actifs, avec le type de filière à choisir ensuite (`trackKind` : SERIE, MENTION ou null). */
  levels() {
    return this.cache.wrap(
      CacheKeys.levels(),
      86_400,
      async () =>
        (await this.prisma.educationLevel.findMany({ where: { isActive: true }, orderBy: { displayOrder: 'asc' } })).map(
          (level) => ({ ...level, trackKind: trackKindOfLevel(level.category, level.name) }),
        ),
      { cacheEmpty: false },
    );
  }

  /**
   * Étape 2 de l'entonnoir : séries du lycée (SERIE) ou mentions universitaires (MENTION, avec leur Domaine mère).
   * Sans `kind`, les deux.
   */
  tracks(kind?: 'SERIE' | 'MENTION', levelName?: string) {
    return this.cache.wrap(
      CacheKeys.tracks(),
      86_400,
      async () =>
        (await this.prisma.academicTrack.findMany({ where: { isActive: true }, orderBy: [{ kind: 'asc' }, { displayOrder: 'asc' }] })).map(
          (t) => ({ id: t.id, kind: t.kind, code: t.code, name: t.name, domain: t.domain, programme: t.programme, levelName: t.levelName }),
        ),
      { cacheEmpty: false },
    ).then((tracks) =>
      tracks.filter((t) => (!kind || t.kind === kind) && (!levelName || t.levelName === levelName)),
    );
  }

  /**
   * Autocomplétion de l'étape « Qu'enseignez-vous ? » : compétences existantes (plus celles que
   * l'appelant a ajoutées lui-même), limitées aux niveaux que son diplôme l'autorise à enseigner.
   * Sans diplôme transmis, on applique le plafond le plus prudent (Bac).
   */
  async suggest(userId: string, query: { q?: string; degree?: string }) {
    const [verified, own, levels] = await Promise.all([
      this.subjects() as Promise<SubjectRow[]>,
      this.prisma.subject.findMany({ where: { isActive: true, isVerified: false, createdById: userId } }),
      this.levels() as Promise<{ category: string; requiredDegree: string }[]>,
    ]);
    const teachable = [...new Set(levels.filter((l) => canTeachLevel(query.degree, l.requiredDegree)).map((l) => l.category))];
    const q = normalizeSkillName(query.q ?? '');

    const scored: { subject: SubjectRow; score: number }[] = [];
    for (const subject of [...verified, ...own.map(toDto)]) {
      if (!teachable.some((category) => subjectCoversCategory(subject.levelCategories, category))) continue;
      if (!q) {
        scored.push({ subject, score: 0 });
        continue;
      }
      const name = normalizeSkillName(subject.name);
      const score = name.startsWith(q)
        ? 0
        : name.split(' ').some((word) => word.startsWith(q))
          ? 1
          : name.includes(q)
            ? 2
            : normalizeSkillName(`${subject.category ?? ''} ${subject.description ?? ''}`).includes(q)
              ? 3
              : -1;
      if (score >= 0) scored.push({ subject, score });
    }
    scored.sort((a, b) => a.score - b.score || a.subject.name.localeCompare(b.subject.name, 'fr'));
    return scored.slice(0, SUGGESTION_LIMIT).map((s) => toDto(s.subject));
  }

  /**
   * Création libre : « Ajouter "Algorithmique quantique" comme nouvelle compétence ».
   * Idempotente : un nom déjà connu (casse, accents, ponctuation ignorés) renvoie la compétence existante.
   * Une compétence créée n'est visible que de son auteur jusqu'à l'approbation de son dossier.
   */
  async createSubject(userId: string, dto: { name: string; category?: string }) {
    await this.rateLimit.consume(`rl:subject-create:${userId}`, 20, 3600);
    const key = normalizeSkillName(dto.name);
    if (key.length < 2) throw new UnprocessableEntityException('INVALID_SUBJECT_NAME');

    const findExisting = async () => {
      const all = await this.prisma.subject.findMany({ where: { isActive: true } });
      return all.find((s) => normalizeSkillName(s.name) === key);
    };
    const existing = await findExisting();
    if (existing) return { subject: toDto(existing), created: false };

    const name = dto.name.charAt(0).toLocaleUpperCase('fr') + dto.name.slice(1);
    try {
      const subject = await this.prisma.subject.create({
        data: { name, category: dto.category?.trim() || null, isVerified: false, createdById: userId },
      });
      return { subject: toDto(subject), created: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const raced = await findExisting();
        if (raced) return { subject: toDto(raced), created: false };
      }
      throw e;
    }
  }
}
