import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AppConfig } from '../../../core/config/app.config';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RateLimitService } from '../../../common/rate-limit.service';
import { isUniversityCategory } from '../../catalog/domain/academic-scale';
import { normalizeSkillName } from '../../catalog/domain/degree-policy';
import { SearchService } from '../../search/search.service';
import { OllamaEmbeddingService } from '../embedding/ollama-embedding.service';
import { MatchingResult, MatchingSearchDto, MatchingSearchResponse } from './matching-search.dto';
import { NextSlotsService, OfferForSlots } from './next-slots.service';
import { PreselectionRepository } from './preselection.repository';
import { SemanticRankingRepository } from './semantic-ranking.repository';
import { Format, allowedFormats, minimumTutorRank } from './level-eligibility';
import { SourceSimilarity, TutorScoreInput, rankTutors } from './scoring';

const DEFAULT_LIMIT = 10;
/** Rate limit (spec §9) : chaque appel déclenche un embedding. */
const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 60;

const OBJECTIVE_LABELS = { REMEDIAL: 'remise à niveau', ONGOING: 'suivi régulier', EXCELLENCE: 'excellence' } as const;

export interface QueryTextParts {
  subject: string | null;
  level: string | null;
  studyProgram: string | null;
  need: string;
  objective: keyof typeof OBJECTIVE_LABELS | null;
  /** Filière choisie à l'étape 2 : mention (université, avec son Domaine mère) ou série (lycée). */
  track?: { kind: 'SERIE' | 'MENTION'; name: string; domain: string | null } | null;
}

/**
 * Texte de la requête (spec §6.3), champs vides omis ; `needDescription` est conservée telle quelle (aucune
 * reformulation). Le préfixe `task: search result | query:` est ajouté par OllamaEmbeddingService.embedQuery.
 */
export function buildQueryText(p: QueryTextParts): string {
  // Mention universitaire : le Domaine mère, retrouvé côté serveur, précède la mention et le cours saisi librement.
  const mention = p.track?.kind === 'MENTION' && p.track.domain ? p.track : null;
  return [
    mention ? `Domaine: ${mention.domain}. Mention: ${mention.name}. Cours Spécifique: ${p.subject ?? 'non précisé'}.` : '',
    !mention && p.subject ? `Matière : ${p.subject}.` : '',
    p.track?.kind === 'SERIE' ? `Série : ${p.track.name}.` : '',
    p.level ? `Niveau : ${p.level}.` : '',
    p.studyProgram ? `Filière : ${p.studyProgram}.` : '',
    `Besoin : ${p.need}`,
    p.objective ? `Objectif : ${OBJECTIVE_LABELS[p.objective]}.` : '',
  ].filter(Boolean).join(' ');
}

export type MatchingSearchResult =
  | MatchingSearchResponse
  | { mode: 'CLASSIC'; results: unknown; reason?: 'NO_TUTOR_FOR_LEVEL' | 'NO_TUTOR_FOR_FORMAT' };

/**
 * Orchestration de la recherche (spec §6.1) :
 *   validation → Phase 1 (présélection SQL) → Phase 2 (tri sémantique) → Phase 3 (disponibilités) → journal.
 * Le backend décide de l'éligibilité ; la recherche sémantique ne fait que CLASSER des tuteurs déjà admissibles.
 */
@Injectable()
export class MatchingSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: AppConfig,
    private readonly rateLimit: RateLimitService,
    private readonly embeddings: OllamaEmbeddingService,
    private readonly preselection: PreselectionRepository,
    private readonly ranking: SemanticRankingRepository,
    private readonly slots: NextSlotsService,
    private readonly classicSearch: SearchService,
  ) {}

  async search(requesterId: string, dto: MatchingSearchDto): Promise<MatchingSearchResult> {
    await this.rateLimit.consume(`rl:matching:${requesterId}`, RATE_LIMIT, RATE_WINDOW_SECONDS);

    if (!dto.subjectId && !dto.subjectText) throw new UnprocessableEntityException('MATCHING_SUBJECT_REQUIRED');
    // Le bénéficiaire doit appartenir au Demandeur connecté et ne pas être archivé.
    const beneficiary = await this.prisma.beneficiary.findFirst({
      where: { id: dto.beneficiaryId, requesterId, archivedAt: null },
      include: { educationLevel: true },
    });
    if (!beneficiary) throw new NotFoundException('BENEFICIARY_NOT_FOUND');
    const level = beneficiary.educationLevel;
    if (!level) throw new UnprocessableEntityException('BENEFICIARY_LEVEL_REQUIRED');

    const subject = dto.subjectId
      ? await this.prisma.subject.findFirst({ where: { id: dto.subjectId, isActive: true, isVerified: true } })
      : null;
    if (dto.subjectId && !subject) throw new UnprocessableEntityException('UNKNOWN_SUBJECT');

    const track = dto.trackId
      ? await this.prisma.academicTrack.findFirst({ where: { id: dto.trackId, isActive: true } })
      : null;
    if (dto.trackId && !track) throw new UnprocessableEntityException('UNKNOWN_TRACK');

    const format = dto.format ?? (beneficiary.preferredFormat as Format | null) ?? null;
    const limit = dto.limit ?? DEFAULT_LIMIT;

    // Niveau non universitaire : recherche classique existante (règles déterministes), sans Phase 2.
    if (!isUniversityCategory(level.category)) {
      return this.classic({ subjectId: subject?.id ?? null, subjectText: dto.subjectText, levelId: level.id, trackId: track?.id, format, limit });
    }

    // Les embeddings sont nécessaires : Ollama arrêté ⇒ 503 MATCHING_UNAVAILABLE (le reste de l'API fonctionne).
    await this.embeddings.assertAvailable();
    const started = Date.now();
    const base = {
      requesterId, beneficiaryId: beneficiary.id, educationLevelId: level.id, subjectId: subject?.id ?? null,
      subjectText: dto.subjectText ?? null, needDescription: dto.needDescription,
      objective: dto.objective ?? beneficiary.objective ?? null, format,
    };

    // --- Phase 1 : présélection déterministe -------------------------------------------------------------------
    // Une demande hors échelle (« Formation pro ») n'a aucun tuteur éligible : rang inconnu, rien n'est deviné.
    let candidateIds: string[] = [];
    let reason: MatchingSearchResponse['reason'];
    if (level.academicRank !== null) {
      const sameRank = await this.prisma.educationLevel.findMany({
        where: { category: level.category, academicRank: level.academicRank },
        select: { id: true },
      });
      const params = {
        minTutorRank: minimumTutorRank(level.academicRank),
        levelIds: sameRank.map((l) => l.id),
        formats: allowedFormats(format),
        embeddingModel: this.cfg.embeddingModel,
        requesterId,
      };
      candidateIds = await this.preselection.findCandidateIds(params);
      if (candidateIds.length === 0) {
        // Ne pas assouplir automatiquement : on dit seulement si un autre format aurait donné des tuteurs.
        const anyFormat = format && format !== 'BOTH'
          ? await this.preselection.findCandidateIds({ ...params, formats: allowedFormats(null) })
          : [];
        reason = anyFormat.length > 0 ? 'NO_TUTOR_FOR_FORMAT' : 'NO_TUTOR_FOR_LEVEL';
      }
    } else {
      reason = 'NO_TUTOR_FOR_LEVEL';
    }
    if (candidateIds.length === 0) {
      return this.finish(base, [], 0, started, reason);
    }

    // --- Phase 2 : tri sémantique ------------------------------------------------------------------------------
    const queryText = buildQueryText({
      subject: subject?.name ?? dto.subjectText ?? null,
      level: level.name,
      studyProgram: beneficiary.studyProgram,
      need: dto.needDescription,
      objective: base.objective,
      track,
    });
    const queryVector = await this.embeddings.embedQuery(queryText);
    const [similarities, declaring, profiles] = await Promise.all([
      this.ranking.bestSimilarities(queryVector, candidateIds, this.cfg.embeddingModel),
      subject ? this.ranking.tutorsDeclaringSubject(candidateIds, subject.id) : Promise.resolve(new Set<string>()),
      this.prisma.tutorProfile.findMany({
        where: { id: { in: candidateIds } },
        select: {
          id: true, displayName: true, profilePhoto: true, rating: true, reviewsCount: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const simsByTutor = new Map<string, SourceSimilarity[]>();
    for (const row of similarities) {
      simsByTutor.set(row.tutorProfileId, [...(simsByTutor.get(row.tutorProfileId) ?? []), row]);
    }
    const inputs: TutorScoreInput[] = candidateIds.flatMap((id) => {
      const profile = profileById.get(id);
      if (!profile) return [];
      return [{
        tutorProfileId: id,
        sims: simsByTutor.get(id) ?? [],
        declaresRequestedSubject: declaring.has(id),
        rating: profile.rating,
        reviewsCount: profile.reviewsCount,
      }];
    });
    const ranked = rankTutors(inputs, limit, this.cfg.matchingScoring);

    // Offres compatibles avec la demande (niveau, format) des seuls tuteurs retenus.
    const topIds = ranked.map((r) => r.tutorProfileId);
    const sameRankIds = (await this.prisma.educationLevel.findMany({
      where: { category: level.category, academicRank: level.academicRank! }, select: { id: true },
    })).map((l) => l.id);
    const offers = await this.prisma.offer.findMany({
      where: {
        tutorProfileId: { in: topIds }, isActive: true, disabledByAdminAt: null,
        OR: [{ educationLevelId: { in: sameRankIds } }, { educationLevelId: null }],
        format: { in: allowedFormats(format) },
      },
      orderBy: [{ price: 'asc' }, { id: 'asc' }],
    });
    const offersByTutor = new Map<string, typeof offers>();
    for (const o of offers) offersByTutor.set(o.tutorProfileId, [...(offersByTutor.get(o.tutorProfileId) ?? []), o]);

    // --- Phase 3 : disponibilités réelles du top K ---------------------------------------------------------------
    const slotInput = new Map<string, OfferForSlots[]>(topIds.map((id) => [
      id,
      (offersByTutor.get(id) ?? []).map((o) => ({ id: o.id, format: o.format, durationMinutes: o.durationMinutes })),
    ]));
    const nextSlots = await this.slots.nextSlots(slotInput);

    const results: MatchingResult[] = ranked.map((r) => {
      const profile = profileById.get(r.tutorProfileId)!;
      const slotsOfTutor = nextSlots.get(r.tutorProfileId) ?? [];
      return {
        tutorProfileId: r.tutorProfileId,
        displayName: profile.displayName?.trim() || `${profile.user.firstName} ${profile.user.lastName}`.trim(),
        profilePhoto: profile.profilePhoto,
        rating: profile.rating,
        reviewsCount: profile.reviewsCount,
        matchReasons: r.matchReasons,
        offers: (offersByTutor.get(r.tutorProfileId) ?? []).map((o) => ({
          id: o.id, title: o.title, price: o.price.toString(), currency: o.currency, format: o.format,
        })),
        nextSlots: slotsOfTutor,
        hasNearSlot: slotsOfTutor.length > 0,
      };
    });
    return this.finish(base, results, candidateIds.length, started, undefined, ranked);
  }

  /** Journal MatchingSearch (calibrage) puis réponse. Les scores restent internes : jamais dans la réponse. */
  private async finish(
    base: {
      requesterId: string; beneficiaryId: string; educationLevelId: string; subjectId: string | null;
      subjectText: string | null; needDescription: string; objective: 'REMEDIAL' | 'ONGOING' | 'EXCELLENCE' | null; format: Format | null;
    },
    results: MatchingResult[],
    candidateCount: number,
    started: number,
    reason?: MatchingSearchResponse['reason'],
    ranked: { tutorProfileId: string; finalScore: number; bestSim: number; bestSource: string }[] = [],
  ): Promise<MatchingSearchResponse> {
    const journal = await this.prisma.matchingSearch.create({
      data: {
        ...base,
        candidateCount,
        results: ranked.map((r, i) => ({
          tutorProfileId: r.tutorProfileId, rank: i + 1, finalScore: r.finalScore, bestSim: r.bestSim, bestSource: r.bestSource,
        })),
        embeddingModel: this.cfg.embeddingModel,
        durationMs: Date.now() - started,
      },
      select: { id: true },
    });
    return { searchId: journal.id, results, ...(reason ? { reason } : {}) };
  }

  /**
   * Niveau non universitaire : recherche déterministe existante (matière du catalogue + niveau), sans Phase 2.
   * Sans coordonnées (le matching n'en prend pas en V1), seules les offres EN LIGNE peuvent ressortir : une demande
   * « présentiel » seul renvoie donc `NO_TUTOR_FOR_FORMAT` plutôt qu'une liste vide sans explication.
   */
  private async classic(p: { subjectId: string | null; subjectText?: string; levelId: string; trackId?: string; format: Format | null; limit: number }) {
    let subjectId = p.subjectId;
    if (!subjectId && p.subjectText) {
      const key = normalizeSkillName(p.subjectText);
      const subjects = await this.prisma.subject.findMany({ where: { isActive: true, isVerified: true }, select: { id: true, name: true } });
      // Égalité d'abord (casse, accents, ponctuation ignorés), puis « commence par / contient » (ex. « maths » → « Mathématiques »).
      const named = subjects.map((s) => ({ id: s.id, name: normalizeSkillName(s.name) }));
      subjectId = (
        named.find((s) => s.name === key) ??
        named.find((s) => key.length >= 3 && s.name.startsWith(key)) ??
        named.find((s) => key.length >= 4 && s.name.includes(key))
      )?.id ?? null;
    }
    if (!subjectId) return { mode: 'CLASSIC' as const, results: [], reason: 'NO_TUTOR_FOR_LEVEL' as const };
    const results = await this.classicSearch.searchOffers({
      subjectId, levelId: p.levelId, trackId: p.trackId, lat: null, lng: null, format: p.format ?? 'BOTH', radiusM: 10_000, limit: p.limit,
    });
    const empty = Array.isArray(results) && results.length === 0;
    const reason = empty ? (p.format === 'IN_PERSON' ? ('NO_TUTOR_FOR_FORMAT' as const) : ('NO_TUTOR_FOR_LEVEL' as const)) : undefined;
    return { mode: 'CLASSIC' as const, results, ...(reason ? { reason } : {}) };
  }
}
