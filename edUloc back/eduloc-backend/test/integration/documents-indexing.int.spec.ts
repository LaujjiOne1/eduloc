/**
 * Lot 6 — justificatifs : extraction de texte (tâche de fond via l'outbox), revue admin, chunks DOCUMENT.
 * Base PostgreSQL réelle, stockage / OCR / embeddeur simulés.
 *
 *   TEST_DATABASE_URL=postgresql://eduloc:eduloc@localhost:5434/eduloc npm run test:int
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, describe, it } from 'node:test';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import type { AppConfig } from '../../src/core/config/app.config';
import type { PrismaService } from '../../src/core/prisma/prisma.service';
import { TUTOR_DOCUMENT_EXTRACT, TUTOR_SEARCH_REINDEX } from '../../src/infrastructure/outbox/outbox-event-types';
import { OutboxWriter } from '../../src/infrastructure/outbox/outbox-writer';
import type { StorageProvider } from '../../src/infrastructure/storage/storage-provider.port';
import { AcademicLevelService } from '../../src/modules/admin/academic-level.service';
import { AdminService } from '../../src/modules/admin/admin.service';
import { DegreeEquivalencesService } from '../../src/modules/admin/degree-equivalences.service';
import { ChunkBuilderService } from '../../src/modules/matching/indexing/chunk-builder.service';
import { DocumentTextService } from '../../src/modules/matching/indexing/document-text.service';
import { IndexingProcessor } from '../../src/modules/matching/indexing/indexing.processor';
import { enqueueDocumentExtraction } from '../../src/modules/matching/indexing/reindex-events';
import { SearchIndexService } from '../../src/modules/matching/indexing/search-index.service';
import { makeFakeEmbedder } from '../support/fake-embedder';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL absent : tests d’intégration ignorés';

const run = randomUUID().slice(0, 8);
const pool = new pg.Pool({ connectionString: url, max: 4 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const db = prisma as unknown as PrismaService;
const cache = { bumpSearch: async () => undefined, invalidate: async () => undefined } as never;
const cfg = { embeddingModel: 'test-model', embeddingDim: 768, tutorDocsBucket: 'tutor-docs' } as AppConfig;
const { embeddings } = makeFakeEmbedder();

/** Stockage simulé : le contenu d'un « fichier » est directement son texte JSON ({ text, pages }). */
const files = new Map<string, Buffer>();
const storage = {
  downloadObject: async (_bucket: string, path: string) => {
    const file = files.get(path);
    if (!file) throw new Error(`introuvable : ${path}`);
    return file;
  },
} as unknown as StorageProvider;
const fakeParser = async (file: Buffer) => {
  try {
    return JSON.parse(file.toString()) as { text: string; pages: number };
  } catch {
    throw new Error('Invalid PDF structure');
  }
};
const documents = new DocumentTextService(db, cfg, storage, undefined, fakeParser);
const index = new SearchIndexService(db, cfg, embeddings, new ChunkBuilderService());
const processor = new IndexingProcessor(db, embeddings, index, documents);
const academicLevels = new AcademicLevelService(db, cache);
const admin = new AdminService(db, new OutboxWriter(), cache, null as never, null as never, new DegreeEquivalencesService(db, academicLevels, cache), academicLevels);

const userIds: string[] = [];

async function makeTutor() {
  const user = await prisma.user.create({
    data: { firstName: 'Aina', lastName: `Rakoto${run}`, email: `doc-${run}-${randomUUID().slice(0, 6)}@example.mg`, password: 'x', status: 'ACTIVE', emailVerified: true },
  });
  userIds.push(user.id);
  const profile = await prisma.tutorProfile.create({ data: { userId: user.id, highestDegree: 'MASTER', degreeTitle: 'Master Informatique', isVisible: true } });
  const application = await prisma.tutorApplication.create({ data: { tutorProfileId: profile.id, status: 'APPROVED' } });
  return { user, profileId: profile.id, applicationId: application.id };
}

async function makeDoc(applicationId: string, type: 'CV' | 'DIPLOMA' | 'IDENTITY' | 'TRANSCRIPT', text: string | Buffer, status: 'PENDING' | 'APPROVED' = 'PENDING') {
  const storagePath = `applications/${applicationId}/${randomUUID()}.pdf`;
  files.set(storagePath, Buffer.isBuffer(text) ? text : Buffer.from(JSON.stringify({ text, pages: 1 })));
  return prisma.tutorDocument.create({
    data: { tutorApplicationId: applicationId, type, storagePath, mimeType: 'application/pdf', sizeBytes: 10, status, extractionStatus: type === 'IDENTITY' ? 'NONE' : 'PENDING' },
  });
}

const documentChunks = (profileId: string) =>
  prisma.tutorSearchChunk.findMany({ where: { tutorProfileId: profileId, sourceType: 'DOCUMENT' }, orderBy: [{ sourceId: 'asc' }, { chunkIndex: 'asc' }] });

const CV_TEXT = [
  'EXPÉRIENCES', 'Développeur web chez ACME, 2020-2023.', 'Projet de chiffrement RSA à Fianarantsoa.',
  'FORMATION', 'Master Informatique, Université de Fianarantsoa, 2021.', 'COMPÉTENCES', 'Python, cryptographie, SQL.',
  'Email : aina@example.mg', 'Tél : 034 12 345 67',
].join('\n');

describe('lot 6 — justificatifs et chunks DOCUMENT (base réelle, OCR et embeddeur simulés)', { skip }, () => {
  before(async () => {
    await prisma.outboxEvent.deleteMany({ where: { eventType: { in: [TUTOR_SEARCH_REINDEX, TUTOR_DOCUMENT_EXTRACT] } } });
  });
  afterEach(async () => {
    await prisma.outboxEvent.deleteMany({ where: { eventType: { in: [TUTOR_SEARCH_REINDEX, TUTOR_DOCUMENT_EXTRACT] } } });
  });
  after(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
    await pool.end();
  });

  it('un CV approuvé produit des chunks DOCUMENT « Mentionné dans le CV », sans données personnelles', async () => {
    const t = await makeTutor();
    const cv = await makeDoc(t.applicationId, 'CV', CV_TEXT, 'APPROVED');
    await documents.extractDocument(cv.id);

    const doc = await prisma.tutorDocument.findUniqueOrThrow({ where: { id: cv.id } });
    assert.equal(doc.extractionStatus, 'DONE');
    assert.ok(doc.extractedText && !doc.extractedText.includes('@') && !doc.extractedText.includes('345 67'));
    assert.equal((doc.autoCheck as { indicative: boolean }).indicative, true);

    // L'extraction d'un document déjà approuvé demande la réindexation (outbox), jamais dans la requête.
    assert.equal(await prisma.outboxEvent.count({ where: { eventType: TUTOR_SEARCH_REINDEX, aggregateId: t.profileId } }), 1);
    await index.reindexTutor(t.profileId);
    const chunks = await documentChunks(t.profileId);
    assert.equal(chunks.length, 3, 'une section = un chunk (EXPÉRIENCES, FORMATION, COMPÉTENCES)');
    assert.ok(chunks.every((c) => c.label === 'Mentionné dans le CV' && c.sourceId === cv.id));
    assert.ok(chunks.every((c) => c.content.startsWith('title: CV — ')));
    assert.ok(!chunks.some((c) => /@|345 67/.test(c.content)));
  });

  it('un document IDENTITY n’est jamais extrait ni indexé, même forcé APPROVED avec un texte', async () => {
    const t = await makeTutor();
    const id = await makeDoc(t.applicationId, 'IDENTITY', 'Carte nationale d’identité de Aina Rakoto', 'APPROVED');
    await documents.extractDocument(id.id);
    assert.equal((await prisma.tutorDocument.findUniqueOrThrow({ where: { id: id.id } })).extractedText, null);
    assert.equal((await prisma.tutorDocument.findUniqueOrThrow({ where: { id: id.id } })).extractionStatus, 'NONE');

    await prisma.tutorDocument.update({ where: { id: id.id }, data: { extractionStatus: 'DONE', extractedText: 'Carte nationale d’identité de Aina Rakoto' } });
    await index.reindexTutor(t.profileId);
    assert.equal((await documentChunks(t.profileId)).length, 0);
  });

  it('un document non approuvé, rejeté, ou dont l’extraction a échoué n’est pas indexé', async () => {
    const t = await makeTutor();
    await makeDoc(t.applicationId, 'CV', CV_TEXT, 'PENDING').then((d) => documents.extractDocument(d.id));
    const rejected = await makeDoc(t.applicationId, 'TRANSCRIPT', CV_TEXT, 'APPROVED');
    await documents.extractDocument(rejected.id);
    await prisma.tutorDocument.update({ where: { id: rejected.id }, data: { status: 'REJECTED' } });
    const garbage = await makeDoc(t.applicationId, 'DIPLOMA', Buffer.from('pas un pdf'), 'APPROVED');
    await documents.extractDocument(garbage.id);
    assert.equal((await prisma.tutorDocument.findUniqueOrThrow({ where: { id: garbage.id } })).extractionStatus, 'FAILED');
    await index.reindexTutor(t.profileId);
    assert.equal((await documentChunks(t.profileId)).length, 0);
  });

  it('une erreur de stockage remonte pour que l’outbox réessaie ; un fichier inexploitable passe en FAILED sans réessai', async () => {
    const t = await makeTutor();
    const missing = await prisma.tutorDocument.create({
      data: { tutorApplicationId: t.applicationId, type: 'CV', storagePath: `absent/${randomUUID()}`, mimeType: 'application/pdf', sizeBytes: 1 },
    });
    await assert.rejects(documents.extractDocument(missing.id), /introuvable/);
    assert.equal((await prisma.tutorDocument.findUniqueOrThrow({ where: { id: missing.id } })).extractionStatus, 'NONE');

    const empty = await makeDoc(t.applicationId, 'CV', '  \n 1 \n');
    await assert.doesNotReject(documents.extractDocument(empty.id));
    assert.equal((await prisma.tutorDocument.findUniqueOrThrow({ where: { id: empty.id } })).extractionStatus, 'FAILED');
  });

  it('chaîne complète par l’outbox : upload → extraction → approbation → réindexation → chunks, puis rejet → chunks retirés', async () => {
    const t = await makeTutor();
    const cv = await makeDoc(t.applicationId, 'CV', CV_TEXT);
    await enqueueDocumentExtraction(prisma, cv.id);
    await processor.processPending(); // extraction (n'exige pas Ollama)
    assert.equal((await prisma.tutorDocument.findUniqueOrThrow({ where: { id: cv.id } })).extractionStatus, 'DONE');
    assert.equal((await documentChunks(t.profileId)).length, 0, 'pas encore approuvé : rien dans l’index');

    await admin.reviewDocument(cv.id, { status: 'APPROVED' }); // le CV n'exige pas de confirmation d'authenticité
    await processor.processPending(); // réindexation
    assert.equal((await documentChunks(t.profileId)).length, 3);

    await admin.reviewDocument(cv.id, { status: 'REJECTED', rejectionReason: 'Illisible' });
    await processor.processPending();
    assert.equal((await documentChunks(t.profileId)).length, 0, 'un document rejeté disparaît de l’index');
    const doc = await prisma.tutorDocument.findUniqueOrThrow({ where: { id: cv.id } });
    assert.equal(doc.status, 'REJECTED');
    assert.equal(doc.rejectionReason, 'Illisible');
  });

  it('approuver un diplôme exige la confirmation d’authenticité ; le chunk porte « Diplôme vérifié »', async () => {
    const t = await makeTutor();
    const diploma = await makeDoc(t.applicationId, 'DIPLOMA', `DIPLÔME DE MASTER\nDécerné à Aina RAKOTO${run}\nMaster en informatique, mention bien.`);
    await documents.extractDocument(diploma.id);
    const stored = await prisma.tutorDocument.findUniqueOrThrow({ where: { id: diploma.id } });
    assert.equal((stored.autoCheck as { detectedDegree: string }).detectedDegree, 'MASTER');
    assert.equal((stored.autoCheck as { holderNameFound: boolean }).holderNameFound, true);

    await assert.rejects(admin.reviewDocument(diploma.id, { status: 'APPROVED' }), (e: Error) => e.message === 'AUTHENTICITY_CONFIRMATION_REQUIRED');
    await assert.rejects(admin.reviewDocument(diploma.id, { status: 'APPROVED', confirmAuthenticity: false }), (e: Error) => e.message === 'AUTHENTICITY_CONFIRMATION_REQUIRED');
    assert.equal((await prisma.tutorDocument.findUniqueOrThrow({ where: { id: diploma.id } })).status, 'PENDING');

    await admin.reviewDocument(diploma.id, { status: 'APPROVED', confirmAuthenticity: true });
    await index.reindexTutor(t.profileId);
    const chunks = await documentChunks(t.profileId);
    assert.ok(chunks.length >= 1 && chunks.every((c) => c.label === 'Diplôme vérifié'));
    await assert.rejects(admin.reviewDocument(randomUUID(), { status: 'APPROVED' }), (e: Error) => e.message === 'DOCUMENT_NOT_FOUND');
  });

  it('la liste admin des dossiers montre le statut d’extraction, le pré-contrôle et le rappel d’attestation, jamais le texte', async () => {
    const t = await makeTutor();
    await prisma.tutorApplication.update({ where: { id: t.applicationId }, data: { status: 'PENDING' } });
    const diploma = await makeDoc(t.applicationId, 'DIPLOMA', 'DIPLÔME DE LICENCE en droit décerné à Jean DUPONT');
    await documents.extractDocument(diploma.id);
    const listing = await admin.tutorApplications('PENDING');
    const mine = listing.find((a) => a.id === t.applicationId)!;
    const doc = mine.documents.find((d) => d.id === diploma.id)!;
    assert.equal(doc.extractionStatus, 'DONE');
    assert.match(doc.approvalMeaning, /attester de son authenticité/);
    assert.ok((doc.autoCheck as { alerts: string[] }).alerts.length >= 1, 'incohérences signalées à l’admin');
    assert.ok(!('extractedText' in doc), 'le texte extrait n’est jamais renvoyé');
  });

  it('remplacer un document : l’ancien disparaît de l’index à la réindexation suivante', async () => {
    const t = await makeTutor();
    const old = await makeDoc(t.applicationId, 'CV', CV_TEXT, 'APPROVED');
    await documents.extractDocument(old.id);
    await index.reindexTutor(t.profileId);
    assert.equal((await documentChunks(t.profileId)).length, 3);
    await prisma.tutorDocument.delete({ where: { id: old.id } });
    const result = await index.reindexTutor(t.profileId);
    assert.equal(result.deleted, 3);
    assert.equal((await documentChunks(t.profileId)).length, 0);
  });
});
