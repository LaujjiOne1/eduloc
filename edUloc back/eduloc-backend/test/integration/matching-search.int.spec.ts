/**
 * Lots 4 et 5 — recherche de matching sur une base PostgreSQL RÉELLE (pgvector) avec un embeddeur SIMULÉ :
 * deux textes de même « topic-xxx » ont une similarité PARFAITE (1,0), ce qui permet de prouver que l'éligibilité
 * (SQL, avant tout calcul sémantique) ne dépend jamais de la similarité.
 *
 *   TEST_DATABASE_URL=postgresql://eduloc:eduloc@localhost:5434/eduloc npm run test:int
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import type { AppConfig } from '../../src/core/config/app.config';
import type { PrismaService } from '../../src/core/prisma/prisma.service';
import type { RateLimitService } from '../../src/common/rate-limit.service';
import type { SearchService } from '../../src/modules/search/search.service';
import { ACADEMIC_RANK } from '../../src/modules/catalog/domain/academic-scale';
import { ChunkBuilderService } from '../../src/modules/matching/indexing/chunk-builder.service';
import { SearchIndexService } from '../../src/modules/matching/indexing/search-index.service';
import { DEFAULT_SCORING } from '../../src/modules/matching/search/scoring';
import { MatchingSearchService } from '../../src/modules/matching/search/matching-search.service';
import { NextSlotsService } from '../../src/modules/matching/search/next-slots.service';
import { PreselectionRepository } from '../../src/modules/matching/search/preselection.repository';
import { SemanticRankingRepository } from '../../src/modules/matching/search/semantic-ranking.repository';
import { makeFakeEmbedder } from '../support/fake-embedder';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL absent : tests d’intégration ignorés';

const run = randomUUID().slice(0, 8);
const pool = new pg.Pool({ connectionString: url, max: 4 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const db = prisma as unknown as PrismaService;
const MODEL = 'test-model';
const cfg = { embeddingModel: MODEL, embeddingDim: 768, bookingMinNoticeHours: 2, matchingScoring: DEFAULT_SCORING } as AppConfig;
const { fake, embeddings } = makeFakeEmbedder();
const index = new SearchIndexService(db, cfg, embeddings, new ChunkBuilderService());
const classicCalls: unknown[] = [];
const classic = { searchOffers: async (p: unknown) => { classicCalls.push(p); return []; } } as unknown as SearchService;
const service = new MatchingSearchService(
  db, cfg, { consume: async () => undefined } as unknown as RateLimitService, embeddings,
  new PreselectionRepository(db), new SemanticRankingRepository(db), new NextSlotsService(db, cfg), classic,
);

const U = 'Université';
const REQUEST_LEVELS = ['Licence 1', 'Licence 2', 'Licence 3', 'Master 1', 'Master 2', 'Doctorat'] as const;
const userIds: string[] = [];
const subjectIds: string[] = [];
const levelIdCache = new Map<string, string>();

async function levelId(name: string, category = U): Promise<string> {
  const key = `${category}|${name}`;
  if (!levelIdCache.has(key)) {
    levelIdCache.set(key, (await prisma.educationLevel.findUniqueOrThrow({ where: { name_category: { name, category } } })).id);
  }
  return levelIdCache.get(key)!;
}

const newSubject = async (name: string) => {
  const subject = await prisma.subject.create({ data: { name: `${name} ${run}-${randomUUID().slice(0, 4)}`, isVerified: true } });
  subjectIds.push(subject.id);
  return subject;
};

const newUser = async (status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE', deletedAt: Date | null = null) => {
  const user = await prisma.user.create({
    data: { firstName: 'T', lastName: `M-${run}`, email: `m-${run}-${randomUUID().slice(0, 6)}@example.mg`, password: 'x', status, emailVerified: true, deletedAt },
  });
  userIds.push(user.id);
  return user;
};

interface TutorOptions {
  name: string;
  /** Niveau académique VALIDÉ ; null = jamais validé. */
  validated?: { level: string; category?: string; note?: string } | null;
  highestDegree?: string;
  topic?: string;
  subjectId: string;
  declaredLevels?: readonly string[];
  offerFormat?: 'ONLINE' | 'IN_PERSON' | 'BOTH';
  offerActive?: boolean;
  offerDisabledByAdmin?: boolean;
  visible?: boolean;
  suspended?: boolean;
  userStatus?: 'ACTIVE' | 'SUSPENDED';
  userDeleted?: boolean;
  indexed?: boolean | 'other-model';
  userId?: string;
  rating?: number;
  reviewsCount?: number;
}

async function makeTutor(o: TutorOptions) {
  const user = o.userId ? { id: o.userId } : await newUser(o.userStatus ?? 'ACTIVE', o.userDeleted ? new Date() : null);
  const marker = `topic-${o.topic ?? 'matrix'}`;
  const validated = o.validated === undefined ? null : o.validated;
  const profile = await prisma.tutorProfile.create({
    data: {
      userId: user.id, displayName: o.name, highestDegree: o.highestDegree ?? 'MASTER', specialization: marker,
      isVisible: o.visible ?? true, suspendedAt: o.suspended ? new Date() : null,
      rating: o.rating ?? 0, reviewsCount: o.reviewsCount ?? 0,
      ...(validated
        ? {
            academicLevelId: await levelId(validated.level, validated.category ?? U),
            academicLevelValidatedAt: new Date(), academicLevelNote: validated.note ?? null,
          }
        : {}),
    },
  });
  await prisma.tutorApplication.create({ data: { tutorProfileId: profile.id, status: 'APPROVED' } });
  for (const level of o.declaredLevels ?? REQUEST_LEVELS) {
    await prisma.tutorSubject.create({
      data: { tutorProfileId: profile.id, subjectId: o.subjectId, educationLevelId: await levelId(level), competenceDescription: marker },
    });
  }
  await prisma.tutorExperience.create({
    data: { tutorProfileId: profile.id, type: 'ACADEMIC', title: `Projet ${marker}`, organization: 'Université', period: '2024', description: marker },
  });
  await prisma.offer.create({
    data: {
      tutorProfileId: profile.id, subjectId: o.subjectId, educationLevelId: null, title: `Cours ${marker}`, description: marker,
      price: 20000, format: o.offerFormat ?? 'BOTH', isActive: o.offerActive ?? true,
      disabledByAdminAt: o.offerDisabledByAdmin ? new Date() : null,
    },
  });
  if (o.indexed !== false) {
    const indexer = o.indexed === 'other-model'
      ? new SearchIndexService(db, { ...cfg, embeddingModel: 'other-model' } as AppConfig, embeddings, new ChunkBuilderService())
      : index;
    await indexer.reindexTutor(profile.id);
  }
  return { id: profile.id, userId: user.id, name: o.name };
}

async function makeRequester(levelName: string | null, extra: { archived?: boolean; category?: string; format?: 'ONLINE' | 'IN_PERSON' | 'BOTH' } = {}) {
  const user = await newUser();
  const beneficiary = await prisma.beneficiary.create({
    data: {
      requesterId: user.id, firstName: 'B', relationship: 'SELF', studyProgram: 'Licence Informatique',
      educationLevelId: levelName ? await levelId(levelName, extra.category ?? U) : null,
      archivedAt: extra.archived ? new Date() : null, preferredFormat: extra.format ?? null,
    },
  });
  return { userId: user.id, beneficiaryId: beneficiary.id };
}

async function removeUsers(ids: string[]) {
  if (!ids.length) return;
  await prisma.matchingSearch.deleteMany({ where: { requesterId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

const need = (topic = 'matrix') => `Je cherche de l'aide : topic-${topic} pour mon cours de la semaine.`;
const names = (r: { results: { displayName: string }[] }) => r.results.map((x) => x.displayName).sort();
const asSearch = (r: unknown) => r as Awaited<ReturnType<MatchingSearchService['search']>> & { results: { displayName: string; tutorProfileId: string; matchReasons: string[]; nextSlots: unknown[]; hasNearSlot: boolean; offers: unknown[] }[]; searchId: string; reason?: string };

describe('lots 4-5 — recherche de matching (base réelle, embeddeur simulé)', { skip }, () => {
  before(async () => {
    await prisma.outboxEvent.deleteMany({ where: { eventType: 'TUTOR_SEARCH_REINDEX' } });
  });
  // La matière n'est pas un filtre dur : tout tuteur éligible du même niveau compte comme candidat. Chaque test
  // nettoie donc les tuteurs qu'il a créés (les suites à données partagées nettoient dans leur propre `after`).
  let mark = 0;
  beforeEach(() => {
    mark = userIds.length;
    fake.down = false;
    fake.available = true;
    classicCalls.length = 0;
  });
  afterEach(async () => {
    await removeUsers(userIds.splice(mark));
  });
  after(async () => {
    await prisma.matchingSearch.deleteMany({ where: { requesterId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.subject.deleteMany({ where: { id: { in: subjectIds } } });
    await prisma.educationLevel.deleteMany({ where: { name: `Master-legacy-${run}` } });
    await prisma.$disconnect();
    await pool.end();
  });

  describe('filtre hiérarchique de niveau — matrice complète (E5, E6, E7, E12)', () => {
    /** Table de la spec, en toutes lettres : niveau de la demande → tuteurs éligibles. */
    const EXPECTED: Record<(typeof REQUEST_LEVELS)[number], string[]> = {
      'Licence 1': ['L2', 'L3', 'M1', 'M2', 'DOCTORAT', 'EXPERT'],
      'Licence 2': ['L3', 'M1', 'M2', 'DOCTORAT', 'EXPERT'],
      'Licence 3': ['M1', 'M2', 'DOCTORAT', 'EXPERT'],
      'Master 1': ['M2', 'DOCTORAT', 'EXPERT'],
      'Master 2': ['DOCTORAT', 'EXPERT'],
      Doctorat: ['DOCTORAT', 'EXPERT'],
    };
    let subjectId: string;
    let start = 0;
    after(async () => {
      await removeUsers(userIds.splice(start));
    });

    before(async () => {
      start = userIds.length;
      subjectId = (await newSubject('Matrice')).id;
      const tutors: [string, { level: string; category?: string; note?: string } | null, string?][] = [
        ['LYCEE_BAC', { level: 'Terminale', category: 'Lycée' }],
        ['L1', { level: 'Licence 1' }], ['L2', { level: 'Licence 2' }], ['L3', { level: 'Licence 3' }],
        ['M1', { level: 'Master 1' }], ['M2', { level: 'Master 2' }], ['DOCTORAT', { level: 'Doctorat' }, 'DOCTORAT'],
        // Expert professionnel validé (E6) : sans doctorat, validé au niveau Doctorat avec justification.
        ['EXPERT', { level: 'Doctorat', note: '15 ans de recherche appliquée, validé par l’équipe' }, 'MASTER'],
        // Jamais validé : n'est jamais éligible à l'université, même avec un master et une similarité parfaite.
        ['SANS_NIVEAU', null, 'DOCTORAT'],
      ];
      for (const [name, validated, degree] of tutors) {
        await makeTutor({ name: `${name}-${run}`, validated, highestDegree: degree ?? 'MASTER', subjectId });
      }
    });

    for (const level of REQUEST_LEVELS) {
      it(`demande ${level} : seuls ${EXPECTED[level].join(', ')} apparaissent (similarité parfaite pour tous)`, async () => {
        const { userId, beneficiaryId } = await makeRequester(level);
        const res = asSearch(await service.search(userId, { beneficiaryId, subjectId, needDescription: need(), limit: 20 }));
        const mine = names(res).filter((n) => n.endsWith(`-${run}`)).map((n) => n.replace(`-${run}`, ''));
        assert.deepEqual(mine, [...EXPECTED[level]].sort());
        assert.ok(!mine.includes('SANS_NIVEAU'), 'un tuteur sans niveau validé n’est jamais éligible');
        assert.ok(!mine.includes('LYCEE_BAC'));
      });
    }

    it('aucun tuteur de rang ≤ demande n’apparaît, y compris dans le journal de la recherche', async () => {
      const { userId, beneficiaryId } = await makeRequester('Licence 3');
      const res = asSearch(await service.search(userId, { beneficiaryId, subjectId, needDescription: need(), limit: 20 }));
      const journal = await prisma.matchingSearch.findUniqueOrThrow({ where: { id: res.searchId } });
      const ids = (journal.results as { tutorProfileId: string }[]).map((r) => r.tutorProfileId);
      const rows = await prisma.tutorProfile.findMany({ where: { id: { in: ids } }, include: { academicLevel: true } });
      assert.ok(rows.length > 0);
      for (const row of rows) assert.ok((row.academicLevel?.academicRank ?? 0) > ACADEMIC_RANK.L3, row.displayName ?? '');
    });
  });

  describe('règles R1, R2, R4, R5, R6 : chacune exclut le tuteur concerné, même à similarité parfaite', () => {
    it('exclut suspendu, invisible, compte suspendu, compte supprimé, niveau non déclaré, sans offre active, offre retirée, format incompatible, non indexé, mauvais modèle', async () => {
      const subjectId = (await newSubject('Regles')).id;
      const ok = { subjectId, validated: { level: 'Master 1' }, topic: 'regles' };
      await makeTutor({ ...ok, name: 'OK' });
      await makeTutor({ ...ok, name: 'SUSPENDU', visible: false, suspended: true });
      await makeTutor({ ...ok, name: 'INVISIBLE', visible: false });
      await makeTutor({ ...ok, name: 'COMPTE_SUSPENDU', userStatus: 'SUSPENDED' });
      await makeTutor({ ...ok, name: 'COMPTE_SUPPRIME', userDeleted: true });
      await makeTutor({ ...ok, name: 'AUTRE_NIVEAU', declaredLevels: ['Licence 1', 'Licence 3'] });
      await makeTutor({ ...ok, name: 'OFFRE_INACTIVE', offerActive: false });
      await makeTutor({ ...ok, name: 'OFFRE_RETIREE', offerDisabledByAdmin: true });
      await makeTutor({ ...ok, name: 'PRESENTIEL_SEUL', offerFormat: 'IN_PERSON' });
      await makeTutor({ ...ok, name: 'NON_INDEXE', indexed: false });
      await makeTutor({ ...ok, name: 'ANCIEN_MODELE', indexed: 'other-model' });

      const { userId, beneficiaryId } = await makeRequester('Licence 2');
      const res = asSearch(await service.search(userId, { beneficiaryId, subjectId, needDescription: need('regles'), format: 'ONLINE', limit: 20 }));
      assert.deepEqual(names(res), ['OK']);
    });

    it('un demandeur qui est aussi tuteur ne se propose pas lui-même', async () => {
      const subjectId = (await newSubject('Soi')).id;
      const { userId, beneficiaryId } = await makeRequester('Licence 1');
      await makeTutor({ subjectId, name: 'MOI', validated: { level: 'Master 1' }, userId, topic: 'soi' });
      await makeTutor({ subjectId, name: 'AUTRE', validated: { level: 'Master 1' }, topic: 'soi' });
      const res = asSearch(await service.search(userId, { beneficiaryId, subjectId, needDescription: need('soi'), limit: 20 }));
      assert.deepEqual(names(res), ['AUTRE']);
    });

    it('une offre sans niveau rend le tuteur admissible ; une offre pour un autre niveau, non', async () => {
      const subjectId = (await newSubject('Offre')).id;
      const t = await makeTutor({ subjectId, name: 'AUTRE_NIVEAU_OFFRE', validated: { level: 'Master 1' }, topic: 'offre' });
      await prisma.offer.updateMany({ where: { tutorProfileId: t.id }, data: { educationLevelId: await levelId('Licence 3') } });
      await makeTutor({ subjectId, name: 'SANS_NIVEAU_OFFRE', validated: { level: 'Master 1' }, topic: 'offre' });
      const { userId, beneficiaryId } = await makeRequester('Licence 2');
      const res = asSearch(await service.search(userId, { beneficiaryId, subjectId, needDescription: need('offre'), limit: 20 }));
      assert.deepEqual(names(res), ['SANS_NIVEAU_OFFRE']);
    });

    it('l’ancien niveau « Master » (même rang que Master 1) reste utilisable pour R4/R5', async () => {
      const subjectId = (await newSubject('Legacy')).id;
      const legacy = await prisma.educationLevel.create({
        data: { name: `Master-legacy-${run}`, category: U, displayOrder: 999, isActive: false, requiredDegree: 'MASTER', academicRank: ACADEMIC_RANK.M1 },
      });
      const t = await makeTutor({ subjectId, name: 'HISTORIQUE', validated: { level: 'Master 2' }, topic: 'legacy', declaredLevels: [] });
      await prisma.tutorSubject.create({ data: { tutorProfileId: t.id, subjectId, educationLevelId: legacy.id, competenceDescription: 'topic-legacy' } });
      const { userId, beneficiaryId } = await makeRequester('Master 1');
      const res = asSearch(await service.search(userId, { beneficiaryId, subjectId, needDescription: need('legacy'), limit: 20 }));
      assert.deepEqual(names(res), ['HISTORIQUE']);
    });
  });

  describe('réponses vides et validation', () => {
    it('raisons : NO_TUTOR_FOR_LEVEL, puis NO_TUTOR_FOR_FORMAT quand un autre format aurait donné des tuteurs', async () => {
      const subjectId = (await newSubject('Raisons')).id;
      const { userId, beneficiaryId } = await makeRequester('Master 2', { format: 'ONLINE' });
      // Aucun tuteur de niveau suffisant pour Master 2 (rang 9 requis) sur ce sujet.
      await makeTutor({ subjectId, name: 'TROP_BAS', validated: { level: 'Master 2' }, topic: 'raisons' });
      const none = asSearch(await service.search(userId, { beneficiaryId, subjectId, needDescription: need('raisons') }));
      assert.deepEqual(none.results, []);
      assert.equal(none.reason, 'NO_TUTOR_FOR_LEVEL');

      // Un docteur existe mais ne donne que des cours en présentiel : le format est en cause, pas le niveau.
      await makeTutor({ subjectId, name: 'DOC_PRESENTIEL', validated: { level: 'Doctorat' }, highestDegree: 'DOCTORAT', offerFormat: 'IN_PERSON', topic: 'raisons' });
      const format = asSearch(await service.search(userId, { beneficiaryId, subjectId, needDescription: need('raisons') }));
      assert.deepEqual(format.results, []);
      assert.equal(format.reason, 'NO_TUTOR_FOR_FORMAT');
      const journal = await prisma.matchingSearch.findUniqueOrThrow({ where: { id: format.searchId } });
      assert.equal(journal.candidateCount, 0);
    });

    it('« Formation pro » (hors échelle) n’a aucun tuteur éligible', async () => {
      const subjectId = (await newSubject('Pro')).id;
      await makeTutor({ subjectId, name: 'DOC', validated: { level: 'Doctorat' }, highestDegree: 'DOCTORAT', topic: 'pro' });
      const { userId, beneficiaryId } = await makeRequester('Formation pro');
      const res = asSearch(await service.search(userId, { beneficiaryId, subjectId, needDescription: need('pro') }));
      assert.deepEqual(res.results, []);
      assert.equal(res.reason, 'NO_TUTOR_FOR_LEVEL');
    });

    it('bénéficiaire d’un autre demandeur, archivé, ou inconnu ⇒ 404 ; sans matière ⇒ 422 ; sans niveau ⇒ 422 ; matière inconnue ⇒ 422', async () => {
      const subjectId = (await newSubject('Valid')).id;
      const owner = await makeRequester('Licence 2');
      const other = await makeRequester('Licence 2');
      const archived = await makeRequester('Licence 2', { archived: true });
      const noLevel = await makeRequester(null);
      const expectCode = (p: Promise<unknown>, code: string) => assert.rejects(p, (e: Error) => e.message === code);
      await expectCode(service.search(other.userId, { beneficiaryId: owner.beneficiaryId, subjectId, needDescription: need() }), 'BENEFICIARY_NOT_FOUND');
      await expectCode(service.search(archived.userId, { beneficiaryId: archived.beneficiaryId, subjectId, needDescription: need() }), 'BENEFICIARY_NOT_FOUND');
      await expectCode(service.search(owner.userId, { beneficiaryId: randomUUID(), subjectId, needDescription: need() }), 'BENEFICIARY_NOT_FOUND');
      await expectCode(service.search(owner.userId, { beneficiaryId: owner.beneficiaryId, needDescription: need() }), 'MATCHING_SUBJECT_REQUIRED');
      await expectCode(service.search(noLevel.userId, { beneficiaryId: noLevel.beneficiaryId, subjectId, needDescription: need() }), 'BENEFICIARY_LEVEL_REQUIRED');
      await expectCode(service.search(owner.userId, { beneficiaryId: owner.beneficiaryId, subjectId: randomUUID(), needDescription: need() }), 'UNKNOWN_SUBJECT');
    });

    it('Ollama arrêté ⇒ 503 MATCHING_UNAVAILABLE pour l’université ; le niveau non universitaire n’en dépend pas', async () => {
      const subjectId = (await newSubject('Panne')).id;
      const uni = await makeRequester('Licence 2');
      const school = await makeRequester('Terminale', { category: 'Lycée' });
      fake.available = false;
      await assert.rejects(
        service.search(uni.userId, { beneficiaryId: uni.beneficiaryId, subjectId, needDescription: need() }),
        (e: Error & { getStatus?: () => number }) => e.message === 'MATCHING_UNAVAILABLE' && e.getStatus?.() === 503,
      );
      const classicRes = await service.search(school.userId, { beneficiaryId: school.beneficiaryId, subjectId, needDescription: need() });
      assert.equal((classicRes as { mode?: string }).mode, 'CLASSIC');
      assert.equal(classicCalls.length, 1);
      assert.equal((classicCalls[0] as { levelId: string }).levelId, await levelId('Terminale', 'Lycée'));
    });
  });

  describe('Phase 2 — tri sémantique et réponse (spec §6.4, §6.6)', () => {
    it('classe par pertinence, filtre relativement, explique par des libellés, ne montre ni score ni contenu', async () => {
      const subjectId = (await newSubject('Tri')).id;
      const pertinent = await makeTutor({ subjectId, name: 'PERTINENT', validated: { level: 'Master 1' }, topic: 'fourier' });
      await makeTutor({ subjectId, name: 'HORS_SUJET', validated: { level: 'Master 1' }, topic: 'cuisine' });
      // Un document approuvé : son texte est indexé mais ne doit JAMAIS apparaître dans la réponse.
      const app = await prisma.tutorApplication.findFirstOrThrow({ where: { tutorProfileId: pertinent.id } });
      await prisma.tutorDocument.create({
        data: {
          tutorApplicationId: app.id, type: 'DIPLOMA', storagePath: `x/${randomUUID()}`, mimeType: 'application/pdf', sizeBytes: 1,
          status: 'APPROVED', extractionStatus: 'DONE', extractedText: 'DIPLÔME\nCONFIDENTIEL-SECRET-4242 topic-fourier',
        },
      });
      await index.reindexTutor(pertinent.id);
      assert.ok((await prisma.tutorSearchChunk.count({ where: { tutorProfileId: pertinent.id, sourceType: 'DOCUMENT' } })) > 0);

      const { userId, beneficiaryId } = await makeRequester('Licence 2');
      const res = asSearch(await service.search(userId, { beneficiaryId, subjectId, needDescription: need('fourier') }));
      assert.deepEqual(res.results.map((r) => r.displayName), ['PERTINENT']);
      const [first] = res.results;
      assert.ok(first.matchReasons.length >= 1 && first.matchReasons.length <= 2);
      assert.ok(first.matchReasons.every((r) => /^(Matière|Offre|Expérience|Parcours|Diplôme vérifié)/.test(r)), first.matchReasons.join('|'));
      const json = JSON.stringify(res);
      assert.ok(!json.includes('CONFIDENTIEL') && !json.includes('SECRET-4242'), 'aucun contenu de document dans la réponse');
      assert.ok(!/finalScore|bestSim|bestSource|embedding|contentHash/.test(json), 'aucun score interne dans la réponse');
      assert.deepEqual(Object.keys(first).sort(), ['displayName', 'hasNearSlot', 'matchReasons', 'nextSlots', 'offers', 'profilePhoto', 'rating', 'reviewsCount', 'tutorProfileId']);
      assert.deepEqual(Object.keys(first.offers[0] as object).sort(), ['currency', 'format', 'id', 'price', 'title']);
    });

    it('classement final : la position du demandeur ne fait que réordonner (proximité), jamais filtrer', async () => {
      const subjectId = (await newSubject('Proximite')).id;
      // Deux tuteurs identiques pour le modèle sémantique ; seul le lieu de présentiel les distingue.
      const far = await makeTutor({ subjectId, name: 'A_LOIN', validated: { level: 'Master 1' }, topic: 'proximite', offerFormat: 'IN_PERSON' });
      const near = await makeTutor({ subjectId, name: 'Z_PROCHE', validated: { level: 'Master 1' }, topic: 'proximite', offerFormat: 'IN_PERSON' });
      const REQUESTER = { lat: -18.9, lng: 47.5 };
      await prisma.place.create({ data: { tutorProfileId: far.id, label: 'Loin', type: 'PUBLIC_PLACE', latitude: REQUESTER.lat + 0.18, longitude: REQUESTER.lng } });
      await prisma.place.create({ data: { tutorProfileId: near.id, label: 'Proche', type: 'PUBLIC_PLACE', latitude: REQUESTER.lat + 0.009, longitude: REQUESTER.lng } });

      const { userId, beneficiaryId } = await makeRequester('Licence 2', { format: 'IN_PERSON' });
      const without = asSearch(await service.search(userId, { beneficiaryId, subjectId, needDescription: need('proximite') }));
      assert.deepEqual(names(without), ['A_LOIN', 'Z_PROCHE'], 'sans position : les deux tuteurs sont proposés');
      assert.ok(without.results.every((r) => !('distanceMeters' in r)), 'contrat inchangé sans position');

      const withPosition = asSearch(await service.search(userId, {
        beneficiaryId, subjectId, needDescription: need('proximite'), latitude: REQUESTER.lat, longitude: REQUESTER.lng, radiusM: 30_000,
      })) as unknown as { results: { displayName: string; distanceMeters: number | null }[] };
      assert.deepEqual(withPosition.results.map((r) => r.displayName), ['Z_PROCHE', 'A_LOIN'], 'le tuteur proche passe devant');
      assert.equal(withPosition.results[0].distanceMeters, 1_000, '≈ 1 km, arrondi au 500 m supérieur');
      assert.ok((withPosition.results[1].distanceMeters ?? 0) >= 20_000);
      assert.equal(withPosition.results.length, 2, 'la distance ne retire personne');
    });

    it('budget maximum : une offre plus chère n’est pas proposée, un tuteur sans offre dans le budget non plus', async () => {
      const subjectId = (await newSubject('Budget')).id;
      await makeTutor({ subjectId, name: 'BUDGET_TUTOR', validated: { level: 'Master 1' }, topic: 'budget' });
      const { userId, beneficiaryId } = await makeRequester('Licence 2');
      const search = async () => asSearch(await service.search(userId, { beneficiaryId, subjectId, needDescription: need('budget') }));

      assert.deepEqual(names(await search()), ['BUDGET_TUTOR'], 'sans budget : proposé');
      await prisma.beneficiary.update({ where: { id: beneficiaryId }, data: { maxBudget: 10_000 } });
      assert.deepEqual((await search()).results, [], 'offre à 20 000 Ar > budget de 10 000 Ar');
      await prisma.beneficiary.update({ where: { id: beneficiaryId }, data: { maxBudget: 25_000 } });
      const within = await search();
      assert.deepEqual(names(within), ['BUDGET_TUTOR']);
      assert.equal((within.results[0].offers as { price: string }[])[0].price, '20000');
    });

    it('la requête est préfixée et enrichie (matière, niveau, filière, objectif)', async () => {
      const subjectId = (await newSubject('Requete')).id;
      const { userId, beneficiaryId } = await makeRequester('Licence 2');
      await makeTutor({ subjectId, name: 'T', validated: { level: 'Master 1' }, topic: 'requete' });
      fake.queries.length = 0;
      await service.search(userId, { beneficiaryId, subjectId, needDescription: need('requete'), objective: 'REMEDIAL' });
      assert.match(fake.queries[0], /^task: search result \| query: Matière : Requete .*\. Niveau : Licence 2\. Filière : Licence Informatique\. Besoin : .* Objectif : remise à niveau\.$/);
    });

    it('le bonus « matière déclarée » départage deux tuteurs à similarité égale', async () => {
      const wanted = await newSubject('Voulue');
      const other = await newSubject('Autre');
      await makeTutor({ subjectId: other.id, name: 'AUTRE_MATIERE', validated: { level: 'Master 1' }, topic: 'bonus' });
      await makeTutor({ subjectId: wanted.id, name: 'BONNE_MATIERE', validated: { level: 'Master 1' }, topic: 'bonus' });
      const { userId, beneficiaryId } = await makeRequester('Licence 2');
      const res = asSearch(await service.search(userId, { beneficiaryId, subjectId: wanted.id, needDescription: need('bonus') }));
      assert.deepEqual(res.results.map((r) => r.displayName), ['BONNE_MATIERE', 'AUTRE_MATIERE']);
    });

    it('respecte limit, journalise la recherche et renvoie son identifiant', async () => {
      const subjectId = (await newSubject('Journal')).id;
      for (const n of ['A', 'B', 'C']) await makeTutor({ subjectId, name: `J${n}`, validated: { level: 'Master 1' }, topic: 'journal' });
      const { userId, beneficiaryId } = await makeRequester('Licence 2', { format: 'ONLINE' });
      const res = asSearch(await service.search(userId, { beneficiaryId, subjectId, needDescription: need('journal'), limit: 2 }));
      assert.equal(res.results.length, 2);
      const journal = await prisma.matchingSearch.findUniqueOrThrow({ where: { id: res.searchId } });
      assert.equal(journal.requesterId, userId);
      assert.equal(journal.beneficiaryId, beneficiaryId);
      assert.equal(journal.educationLevelId, await levelId('Licence 2'));
      assert.equal(journal.format, 'ONLINE', 'format par défaut = préférence du bénéficiaire');
      assert.equal(journal.embeddingModel, MODEL);
      assert.equal(journal.candidateCount, 3);
      assert.ok(journal.durationMs !== null && journal.durationMs >= 0);
      const stored = journal.results as { tutorProfileId: string; rank: number; finalScore: number; bestSim: number; bestSource: string }[];
      assert.deepEqual(stored.map((r) => r.rank), [1, 2]);
      assert.ok(stored.every((r) => r.finalScore > 0.9 && Math.abs(r.bestSim - 1) < 1e-6));
    });

    it('une réservation créée depuis une recherche porte son matchingSearchId (relation en base)', async () => {
      const subjectId = (await newSubject('Conversion')).id;
      const { userId, beneficiaryId } = await makeRequester('Licence 2');
      const t = await makeTutor({ subjectId, name: 'CONV', validated: { level: 'Master 1' }, topic: 'conv' });
      const res = asSearch(await service.search(userId, { beneficiaryId, subjectId, needDescription: need('conv') }));
      const offer = await prisma.offer.findFirstOrThrow({ where: { tutorProfileId: t.id } });
      const booking = await prisma.booking.create({
        data: {
          requesterId: userId, beneficiaryId, tutorProfileId: t.id, offerId: offer.id, startAt: new Date('2030-01-01T10:00:00Z'),
          endAt: new Date('2030-01-01T11:00:00Z'), teachingMode: 'ONLINE', price: 1, offerTitle: 'x', matchingSearchId: res.searchId,
        },
      });
      assert.equal((await prisma.matchingSearch.findUniqueOrThrow({ where: { id: res.searchId }, include: { bookings: true } })).bookings[0].id, booking.id);
      await prisma.booking.delete({ where: { id: booking.id } });
    });
  });

  describe('Phase 3 — disponibilités du top K (lot 5)', () => {
    // Lundi 19 octobre 2026, 06:00 UTC = 09:00 à Madagascar (UTC+3). Préavis de 2 h ⇒ premier départ possible : 08:00 UTC.
    const NOW = new Date('2026-10-19T06:00:00.000Z');
    const slotsService = new NextSlotsService(db, cfg);
    let tutorId: string;
    let offerId: string;
    let start = 0;
    const iso = (d: string) => `2026-10-${d}Z`;
    after(async () => {
      await removeUsers(userIds.splice(start));
    });

    before(async () => {
      start = userIds.length;
      const subjectId = (await newSubject('Creneaux')).id;
      const t = await makeTutor({ subjectId, name: 'CRENEAUX', validated: { level: 'Master 1' }, topic: 'slots' });
      tutorId = t.id;
      offerId = (await prisma.offer.findFirstOrThrow({ where: { tutorProfileId: t.id } })).id;
      // Tous les jours 08:00-20:00 heure de Madagascar, en ligne ou non (lieu non précisé).
      for (let day = 0; day < 7; day += 1) {
        await prisma.availability.create({ data: { tutorProfileId: t.id, dayOfWeek: day, startTime: '08:00', endTime: '20:00', timezone: 'Indian/Antananarivo' } });
      }
    });

    const slots = async (now = NOW) =>
      (await slotsService.nextSlots(new Map([[tutorId, [{ id: offerId, format: 'BOTH' as const, durationMinutes: 60 }]]]), now)).get(tutorId)!;

    it('propose les 3 prochains créneaux libres, alignés sur :00/:30, après le préavis', async () => {
      const result = await slots();
      assert.deepEqual(result.map((s) => s.startAt), ['2026-10-19T08:00:00.000Z', '2026-10-19T09:00:00.000Z', '2026-10-19T10:00:00.000Z']);
      assert.deepEqual(result.map((s) => s.endAt), ['2026-10-19T09:00:00.000Z', '2026-10-19T10:00:00.000Z', '2026-10-19T11:00:00.000Z']);
    });

    it('respecte le fuseau du tuteur : rien avant 08:00 locale (05:00 UTC), rien après 20:00 locale (17:00 UTC)', async () => {
      const early = await slots(new Date('2026-10-19T00:00:00.000Z'));
      assert.equal(early[0].startAt, '2026-10-19T05:00:00.000Z');
      const late = await slots(new Date('2026-10-19T16:00:00.000Z')); // 19:00 locale : préavis ⇒ plus rien aujourd'hui
      assert.equal(late[0].startAt, '2026-10-20T05:00:00.000Z');
    });

    it('retire les périodes bloquées et les réservations PENDING / CONFIRMED / IN_PROGRESS, pas les refusées ni annulées', async () => {
      const { userId, beneficiaryId } = await makeRequester('Licence 2');
      const blocked = await prisma.blockedPeriod.create({ data: { tutorProfileId: tutorId, startAt: new Date(iso('19T08:00:00.000')), endAt: new Date(iso('19T09:30:00.000')) } });
      const mkBooking = (status: 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'REFUSED' | 'CANCELLED', start: string, end: string) =>
        prisma.booking.create({
          data: {
            requesterId: userId, beneficiaryId, tutorProfileId: tutorId, offerId, startAt: new Date(iso(start)), endAt: new Date(iso(end)),
            teachingMode: 'ONLINE', price: 1, offerTitle: 'x', status,
          },
        });
      // Bloqué 08:00-09:30 UTC ⇒ premier créneau à 09:30.
      assert.equal((await slots())[0].startAt, '2026-10-19T09:30:00.000Z');
      // PENDING 10:30-11:30 : exclu comme CONFIRMED (spec §6.5), contrairement à la recherche classique.
      const pending = await mkBooking('PENDING', '19T10:30:00.000', '19T11:30:00.000');
      const refused = await mkBooking('REFUSED', '19T09:30:00.000', '19T10:30:00.000');
      const cancelled = await mkBooking('CANCELLED', '19T09:30:00.000', '19T10:30:00.000');
      let result = (await slots()).map((s) => s.startAt);
      assert.deepEqual(result, ['2026-10-19T09:30:00.000Z', '2026-10-19T11:30:00.000Z', '2026-10-19T12:30:00.000Z']);
      await prisma.booking.update({ where: { id: pending.id }, data: { status: 'IN_PROGRESS' } });
      assert.deepEqual((await slots()).map((s) => s.startAt), result, 'IN_PROGRESS bloque aussi');
      await prisma.booking.update({ where: { id: pending.id }, data: { status: 'CONFIRMED' } });
      assert.deepEqual((await slots()).map((s) => s.startAt), result, 'CONFIRMED bloque aussi');
      await prisma.booking.update({ where: { id: pending.id }, data: { status: 'CANCELLED' } });
      result = (await slots()).map((s) => s.startAt);
      assert.deepEqual(result, ['2026-10-19T09:30:00.000Z', '2026-10-19T10:30:00.000Z', '2026-10-19T11:30:00.000Z'], 'une réservation annulée libère le créneau');
      await prisma.booking.deleteMany({ where: { id: { in: [pending.id, refused.id, cancelled.id] } } });
      await prisma.blockedPeriod.delete({ where: { id: blocked.id } });
    });

    it('ignore une règle désactivée ; la fenêtre est de 14 jours', async () => {
      const far = await slots(new Date('2026-10-19T06:00:00.000Z'));
      assert.ok(far.every((s) => new Date(s.startAt).getTime() < NOW.getTime() + 14 * 86_400_000));
      await prisma.availability.updateMany({ where: { tutorProfileId: tutorId }, data: { isActive: false } });
      assert.deepEqual(await slots(), []);
      await prisma.availability.updateMany({ where: { tutorProfileId: tutorId }, data: { isActive: true } });
    });

    it('une plage ponctuelle (validFrom = validUntil) ne produit des créneaux que ce jour-là', async () => {
      const subjectId = (await newSubject('Ponctuel')).id;
      const t = await makeTutor({ subjectId, name: 'PONCTUEL', validated: { level: 'Master 1' }, topic: 'ponctuel' });
      const o = await prisma.offer.findFirstOrThrow({ where: { tutorProfileId: t.id } });
      const day = new Date('2026-10-22T00:00:00.000Z'); // jeudi
      await prisma.availability.create({
        data: { tutorProfileId: t.id, dayOfWeek: 4, startTime: '14:00', endTime: '16:00', timezone: 'Indian/Antananarivo', validFrom: day, validUntil: day },
      });
      const result = (await slotsService.nextSlots(new Map([[t.id, [{ id: o.id, format: 'BOTH' as const, durationMinutes: 60 }]]]), NOW)).get(t.id)!;
      assert.deepEqual(result.map((s) => s.startAt), ['2026-10-22T11:00:00.000Z', '2026-10-22T12:00:00.000Z']);
    });

    it('un tuteur sans créneau reste listé avec nextSlots: [] et hasNearSlot: false', async () => {
      const subjectId = (await newSubject('SansCreneau')).id;
      await makeTutor({ subjectId, name: 'SANS_CRENEAU', validated: { level: 'Master 1' }, topic: 'sanscreneau' });
      const { userId, beneficiaryId } = await makeRequester('Licence 2');
      const res = asSearch(await service.search(userId, { beneficiaryId, subjectId, needDescription: need('sanscreneau') }));
      assert.deepEqual(res.results.map((r) => r.displayName), ['SANS_CRENEAU']);
      assert.deepEqual(res.results[0].nextSlots, []);
      assert.equal(res.results[0].hasNearSlot, false);
    });

    it('la recherche renvoie les créneaux du top K, cohérents avec les offres compatibles', async () => {
      const subjectId = (await newSubject('Cohérence')).id;
      const t = await makeTutor({ subjectId, name: 'AVEC_CRENEAUX', validated: { level: 'Master 1' }, topic: 'coherence' });
      for (let day = 0; day < 7; day += 1) {
        await prisma.availability.create({ data: { tutorProfileId: t.id, dayOfWeek: day, startTime: '00:00', endTime: '23:59', timezone: 'Indian/Antananarivo' } });
      }
      const { userId, beneficiaryId } = await makeRequester('Licence 2');
      const res = asSearch(await service.search(userId, { beneficiaryId, subjectId, needDescription: need('coherence') }));
      assert.equal(res.results[0].nextSlots.length, 3);
      assert.equal(res.results[0].hasNearSlot, true);
    });
  });
});
