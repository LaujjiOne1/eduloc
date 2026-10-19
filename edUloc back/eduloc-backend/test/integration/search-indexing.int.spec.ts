/**
 * Lot 3 — indexation sémantique, base PostgreSQL réelle (pgvector) et embeddeur SIMULÉ (déterministe) :
 * on teste ici la logique d'indexation (hash, idempotence, suppression, outbox), pas le modèle.
 *
 *   TEST_DATABASE_URL=postgresql://eduloc:eduloc@localhost:5434/eduloc npm run test:int
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import type { AppConfig } from '../../src/core/config/app.config';
import type { PrismaService } from '../../src/core/prisma/prisma.service';
import { OutboxWriter } from '../../src/infrastructure/outbox/outbox-writer';
import { TUTOR_SEARCH_REINDEX } from '../../src/infrastructure/outbox/outbox-event-types';
import { AcademicLevelService } from '../../src/modules/admin/academic-level.service';
import { AdminService } from '../../src/modules/admin/admin.service';
import { DegreeEquivalencesService } from '../../src/modules/admin/degree-equivalences.service';
import type { OllamaEmbeddingService } from '../../src/modules/matching/embedding/ollama-embedding.service';
import { ChunkBuilderService } from '../../src/modules/matching/indexing/chunk-builder.service';
import { IndexingProcessor } from '../../src/modules/matching/indexing/indexing.processor';
import { enqueueTutorReindex } from '../../src/modules/matching/indexing/reindex-events';
import { SearchIndexService } from '../../src/modules/matching/indexing/search-index.service';
import { OffersService, TutorsService } from '../../src/modules/tutors/tutors.service';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL absent : tests d’intégration ignorés';

const run = randomUUID().slice(0, 8);
const pool = new pg.Pool({ connectionString: url, max: 4 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const db = prisma as unknown as PrismaService;
const cache = { bumpSearch: async () => undefined, invalidate: async () => undefined } as never;

/** Embeddeur simulé : vecteur déterministe de 768 valeurs dérivé du texte ; peut « tomber en panne ». */
const fake = {
  calls: [] as string[][],
  down: false,
  available: true,
  async embedTexts(texts: string[]) {
    if (this.down) throw new ServiceUnavailableException('MATCHING_UNAVAILABLE');
    this.calls.push(texts);
    return texts.map((t) => {
      const seed = createHash('sha256').update(t).digest();
      const v = Array.from({ length: 768 }, (_, i) => seed[i % 32] / 255 + (i % 5) / 10 + 0.01);
      const n = Math.hypot(...v);
      return v.map((x) => x / n);
    });
  },
  async isAvailable() { return this.available; },
};
const embeddings = fake as unknown as OllamaEmbeddingService;
const cfg = { embeddingModel: 'test-model', embeddingDim: 768 } as AppConfig;
const index = new SearchIndexService(db, cfg, embeddings, new ChunkBuilderService());
const processor = new IndexingProcessor(db, embeddings, index, null as never); // extraction de documents : non utilisée ici
const tutorsService = new TutorsService(db);
const offersService = new OffersService(db);
const academicLevels = new AcademicLevelService(db, cache);
const admin = new AdminService(db, new OutboxWriter(), cache, null as never, null as never, new DegreeEquivalencesService(db, academicLevels, cache), academicLevels);

const userIds: string[] = [];
const subjectIds: string[] = [];
const level = async (name: string, category = 'Université') =>
  (await prisma.educationLevel.findUniqueOrThrow({ where: { name_category: { name, category } } })).id;

interface World { userId: string; tutorId: string; subjectId: string; experienceId: string; offerId: string; applicationId: string }

async function makeWorld(approved = true): Promise<World> {
  const user = await prisma.user.create({
    data: { firstName: 'T', lastName: `Idx-${run}`, email: `idx-${run}-${randomUUID().slice(0, 6)}@example.mg`, password: 'x', status: 'ACTIVE', emailVerified: true },
  });
  userIds.push(user.id);
  const subject = await prisma.subject.create({ data: { name: `Algèbre ${randomUUID().slice(0, 6)}`, aliases: ['Algèbre 1'], isVerified: true } });
  subjectIds.push(subject.id);
  const tutor = await prisma.tutorProfile.create({
    data: { userId: user.id, highestDegree: 'MASTER', degreeTitle: 'Master Informatique', fieldOfStudy: 'Informatique', isVisible: approved },
  });
  const application = await prisma.tutorApplication.create({ data: { tutorProfileId: tutor.id, status: approved ? 'APPROVED' : 'PENDING' } });
  await prisma.tutorSubject.create({ data: { tutorProfileId: tutor.id, subjectId: subject.id, educationLevelId: await level('Licence 2'), competenceDescription: 'diagonalisation' } });
  const experience = await prisma.tutorExperience.create({
    data: { tutorProfileId: tutor.id, type: 'ACADEMIC', title: 'Projet RSA', organization: 'Université', period: '2024', description: 'chiffrement asymétrique' },
  });
  const offer = await prisma.offer.create({
    data: { tutorProfileId: tutor.id, subjectId: subject.id, educationLevelId: await level('Licence 2'), title: 'Algèbre L2', description: 'Réduction des endomorphismes', price: 20000 },
  });
  return { userId: user.id, tutorId: tutor.id, subjectId: subject.id, experienceId: experience.id, offerId: offer.id, applicationId: application.id };
}

const chunkRows = (tutorId: string) =>
  prisma.$queryRaw<{ sourceType: string; label: string; model: string; dims: number; subjectId: string | null }[]>`
    SELECT "sourceType"::text AS "sourceType", label, "embeddingModel" AS model, vector_dims(embedding) AS dims, "subjectId"
    FROM tutor_search_chunks WHERE "tutorProfileId" = ${tutorId} ORDER BY "sourceType", "chunkIndex"`;

describe('lot 3 — indexation sémantique (base réelle, embeddeur simulé)', { skip }, () => {
  before(async () => {
    // Le test ne doit traiter que ses propres événements : on écarte ceux laissés par d'autres suites.
    await prisma.outboxEvent.deleteMany({ where: { eventType: TUTOR_SEARCH_REINDEX } });
  });
  beforeEach(() => {
    fake.calls = [];
    fake.down = false;
    fake.available = true;
  });
  after(async () => {
    await prisma.outboxEvent.deleteMany({ where: { eventType: TUTOR_SEARCH_REINDEX } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.subject.deleteMany({ where: { id: { in: subjectIds } } });
    await prisma.$disconnect();
    await pool.end();
  });

  it('indexe les quatre sources avec des vecteurs de 768 dimensions et le modèle courant', async () => {
    const w = await makeWorld();
    // Offre de niveau lycée, offre inactive, offre désactivée par l'admin : jamais indexées.
    const common = { tutorProfileId: w.tutorId, subjectId: w.subjectId, description: 'd', price: 1 };
    await prisma.offer.create({ data: { ...common, title: 'Lycée', educationLevelId: await level('Terminale', 'Lycée') } });
    await prisma.offer.create({ data: { ...common, title: 'Inactive', isActive: false } });
    await prisma.offer.create({ data: { ...common, title: 'Retirée', disabledByAdminAt: new Date() } });
    await prisma.offer.create({ data: { ...common, title: 'Sans niveau', educationLevelId: null } });

    const result = await index.reindexTutor(w.tutorId);
    assert.deepEqual(result, { indexed: true, embedded: 5, kept: 0, deleted: 0 });
    const rows = await chunkRows(w.tutorId);
    assert.deepEqual(rows.map((r) => r.sourceType).sort(), ['EXPERIENCE', 'OFFER', 'OFFER', 'PROFILE', 'SUBJECT']);
    assert.ok(rows.every((r) => r.dims === 768 && r.model === 'test-model'));
    assert.ok(rows.filter((r) => r.sourceType === 'OFFER').every((r) => r.subjectId === w.subjectId));
    assert.deepEqual(rows.filter((r) => r.sourceType === 'OFFER').map((r) => r.label).sort(), ['Offre : Algèbre L2', 'Offre : Sans niveau']);
    assert.ok((await prisma.tutorProfile.findUniqueOrThrow({ where: { id: w.tutorId } })).searchIndexedAt);
  });

  it('est idempotent : un second passage ne recalcule rien (hash respecté)', async () => {
    const w = await makeWorld();
    await index.reindexTutor(w.tutorId);
    fake.calls = [];
    const again = await index.reindexTutor(w.tutorId);
    assert.deepEqual(again, { indexed: true, embedded: 0, kept: 4, deleted: 0 });
    assert.equal(fake.calls.length, 0, 'Ollama n’est pas appelé');
    assert.equal((await chunkRows(w.tutorId)).length, 4);
  });

  it('ne recalcule que les chunks modifiés', async () => {
    const w = await makeWorld();
    await index.reindexTutor(w.tutorId);
    fake.calls = [];
    await prisma.tutorExperience.update({ where: { id: w.experienceId }, data: { description: 'cryptographie à clé publique' } });
    const result = await index.reindexTutor(w.tutorId);
    assert.deepEqual(result, { indexed: true, embedded: 1, kept: 3, deleted: 0 });
    assert.equal(fake.calls.flat().length, 1);
    assert.match(fake.calls[0][0], /^title: Projet RSA \| text: Expérience académique\./);
  });

  it('envoie à Ollama des textes déjà préfixés « title: … | text: … » (le découpage en lots de 16 relève du client)', async () => {
    const w = await makeWorld();
    for (let i = 0; i < 20; i += 1) {
      await prisma.tutorExperience.create({ data: { tutorProfileId: w.tutorId, type: 'PROFESSIONAL', title: `Poste ${i}`, organization: 'O', period: '2020', description: `mission ${i}` } });
    }
    await index.reindexTutor(w.tutorId);
    assert.equal(fake.calls.length, 1, 'un seul appel au client, qui découpe lui-même en lots');
    assert.equal(fake.calls[0].length, 24);
    assert.ok(fake.calls.flat().every((t) => t.startsWith('title: ') && t.includes(' | text: ')));
  });

  it('supprime les chunks dont la source a disparu', async () => {
    const w = await makeWorld();
    await index.reindexTutor(w.tutorId);
    await prisma.tutorExperience.delete({ where: { id: w.experienceId } });
    await prisma.offer.update({ where: { id: w.offerId }, data: { isActive: false } });
    const result = await index.reindexTutor(w.tutorId);
    assert.equal(result.deleted, 2);
    assert.deepEqual((await chunkRows(w.tutorId)).map((r) => r.sourceType).sort(), ['PROFILE', 'SUBJECT']);
  });

  it('Ollama indisponible : rien n’est supprimé ni écrit, l’erreur remonte pour que l’outbox réessaie', async () => {
    const w = await makeWorld();
    await index.reindexTutor(w.tutorId);
    const before = await chunkRows(w.tutorId);
    await prisma.tutorExperience.update({ where: { id: w.experienceId }, data: { description: 'nouveau texte' } });
    await prisma.offer.update({ where: { id: w.offerId }, data: { isActive: false } }); // aurait supprimé un chunk
    fake.down = true;
    await assert.rejects(index.reindexTutor(w.tutorId), (e: Error) => e.message === 'MATCHING_UNAVAILABLE');
    assert.deepEqual(await chunkRows(w.tutorId), before, 'anciens chunks conservés');
  });

  it('un changement de modèle recalcule tout (le hash inclut le modèle)', async () => {
    const w = await makeWorld();
    await index.reindexTutor(w.tutorId);
    const other = new SearchIndexService(db, { embeddingModel: 'autre-modele', embeddingDim: 768 } as AppConfig, embeddings, new ChunkBuilderService());
    const result = await other.reindexTutor(w.tutorId);
    assert.deepEqual(result, { indexed: true, embedded: 4, kept: 0, deleted: 0 });
    assert.ok((await chunkRows(w.tutorId)).every((r) => r.model === 'autre-modele'));
  });

  it('n’indexe pas un tuteur dont le dossier n’est pas approuvé, ni un tuteur inconnu', async () => {
    const w = await makeWorld(false);
    assert.deepEqual(await index.reindexTutor(w.tutorId), { indexed: false, embedded: 0, kept: 0, deleted: 0 });
    assert.equal((await chunkRows(w.tutorId)).length, 0);
    assert.equal((await index.reindexTutor(randomUUID())).indexed, false);
  });

  it('un tuteur suspendu garde ses chunks (la Phase 1 l’exclut)', async () => {
    const w = await makeWorld();
    await index.reindexTutor(w.tutorId);
    await prisma.tutorProfile.update({ where: { id: w.tutorId }, data: { isVisible: false, suspendedAt: new Date() } });
    assert.equal((await chunkRows(w.tutorId)).length, 4);
  });

  it('la suppression du compte supprime les chunks en cascade', async () => {
    const w = await makeWorld();
    await index.reindexTutor(w.tutorId);
    await prisma.user.delete({ where: { id: w.userId } });
    assert.equal((await chunkRows(w.tutorId)).length, 0);
  });

  describe('outbox TUTOR_SEARCH_REINDEX', () => {
    const pending = (tutorId: string) =>
      prisma.outboxEvent.findMany({ where: { eventType: TUTOR_SEARCH_REINDEX, aggregateId: tutorId }, orderBy: { createdAt: 'asc' } });

    it('un événement en attente par tuteur : les doublons ne s’empilent pas', async () => {
      const w = await makeWorld();
      await prisma.$transaction(async (tx) => {
        await enqueueTutorReindex(tx, w.tutorId);
        await enqueueTutorReindex(tx, w.tutorId);
      });
      const events = await pending(w.tutorId);
      assert.equal(events.length, 1);
      assert.equal(events[0].aggregateType, 'TutorProfile');
    });

    it('est écrit dans la transaction métier : profil, matière, offre, approbation', async () => {
      const w = await makeWorld(false);
      await prisma.outboxEvent.deleteMany({ where: { aggregateId: w.tutorId } });
      await tutorsService.updateProfile(w.userId, { specialization: 'cryptographie' });
      assert.equal((await pending(w.tutorId)).length, 1);

      await prisma.outboxEvent.deleteMany({ where: { aggregateId: w.tutorId } });
      await offersService.setActive(w.userId, w.offerId, false);
      assert.equal((await pending(w.tutorId)).length, 1);

      await prisma.outboxEvent.deleteMany({ where: { aggregateId: w.tutorId } });
      const application = await prisma.tutorApplication.update({ where: { id: w.applicationId }, data: { status: 'PENDING' } });
      const adminUser = await prisma.user.create({ data: { firstName: 'A', lastName: 'Idx', email: `adm-${run}@example.mg`, password: 'x', status: 'ACTIVE', isAdmin: true } });
      userIds.push(adminUser.id);
      await admin.approveApplication(adminUser.id, application.id);
      assert.equal((await pending(w.tutorId)).length, 1);

      // Modération d'une offre par l'admin : son chunk doit disparaître.
      await prisma.outboxEvent.deleteMany({ where: { aggregateId: w.tutorId } });
      await admin.moderateOffer(w.offerId, 'disable');
      assert.equal((await pending(w.tutorId)).length, 1);
    });

    it('fusionne plusieurs événements d’un même tuteur en UN traitement et les marque tous traités', async () => {
      const w = await makeWorld();
      await prisma.outboxEvent.deleteMany({ where: { eventType: TUTOR_SEARCH_REINDEX } });
      await prisma.outboxEvent.createMany({
        data: [0, 1, 2].map(() => ({ aggregateType: 'TutorProfile', aggregateId: w.tutorId, eventType: TUTOR_SEARCH_REINDEX, recipientIds: [], payload: {} })),
      });
      await processor.processPending();
      const events = await pending(w.tutorId);
      assert.equal(events.length, 3);
      assert.ok(events.every((e) => e.processedAt), 'tous traités');
      assert.equal(fake.calls.length, 1, 'une seule passe d’embedding pour trois événements');
      assert.equal((await chunkRows(w.tutorId)).length, 4);
    });

    it('Ollama indisponible : les événements ne sont pas consommés et restent en attente', async () => {
      const w = await makeWorld();
      await enqueueTutorReindex(prisma, w.tutorId);
      fake.available = false;
      await processor.processPending();
      const [event] = await pending(w.tutorId);
      assert.equal(event.processedAt, null);
      assert.equal(event.attempts, 0);
      assert.equal(event.lockedUntil, null);
      // Ollama revient : l'événement est alors traité.
      fake.available = true;
      await processor.processPending();
      assert.ok((await pending(w.tutorId))[0].processedAt);
    });

    it('panne en cours de traitement : événement replanifié avec backoff, sans abandon', async () => {
      const w = await makeWorld();
      await enqueueTutorReindex(prisma, w.tutorId);
      fake.down = true;
      await processor.processPending();
      const [event] = await pending(w.tutorId);
      assert.equal(event.processedAt, null);
      assert.match(event.lastError ?? '', /MATCHING_UNAVAILABLE/);
      assert.ok(event.lockedUntil && event.lockedUntil.getTime() > Date.now());
      assert.equal(event.attempts, 0, 'une indisponibilité ne consomme pas de tentative');
    });
  });
});
