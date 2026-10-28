/**
 * Tests d'intégration du lot 1 (fondations du matching) : base PostgreSQL RÉELLE, migrations appliquées.
 * À lancer séparément des tests unitaires :
 *
 *   TEST_DATABASE_URL=postgresql://eduloc:eduloc@localhost:5434/eduloc npm run test:int
 *
 * Ne jamais pointer vers la base Supabase. Chaque test crée ses propres données (suffixe unique) et les supprime.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import type { PrismaService } from '../../src/core/prisma/prisma.service';
import { OutboxWriter } from '../../src/infrastructure/outbox/outbox-writer';
import { AcademicLevelService } from '../../src/modules/admin/academic-level.service';
import { AdminService } from '../../src/modules/admin/admin.service';
import { DegreeEquivalencesService } from '../../src/modules/admin/degree-equivalences.service';
import { ACADEMIC_RANK, ACADEMIC_STEPS, academicRankOfLevel } from '../../src/modules/catalog/domain/academic-scale';
import { CATALOG_LEVELS } from '../../src/modules/catalog/domain/education-levels';
import { TutorApplicationsService } from '../../src/modules/tutors/tutor-applications.service';
import { TutorsService } from '../../src/modules/tutors/tutors.service';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL absent : tests d’intégration ignorés';

const run = randomUUID().slice(0, 8);
const pool = new pg.Pool({ connectionString: url, max: 4 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const db = prisma as unknown as PrismaService;
const cache = { bumpSearch: async () => undefined, invalidate: async () => undefined } as never;

const academicLevels = new AcademicLevelService(db, cache);
const equivalences = new DegreeEquivalencesService(db, academicLevels, cache);
const admin = new AdminService(db, new OutboxWriter(), cache, null as never, null as never, equivalences, academicLevels);
const applications = new TutorApplicationsService(db, null as never, null as never, new OutboxWriter(), null as never);
const tutors = new TutorsService(db);

const createdUsers: string[] = [];
const createdEquivalences: string[] = [];

async function levelId(category: string, name: string): Promise<string> {
  const level = await prisma.educationLevel.findUniqueOrThrow({ where: { name_category: { name, category } } });
  return level.id;
}

async function makeUser(isAdmin = false) {
  const user = await prisma.user.create({
    data: {
      firstName: 'Test', lastName: `Lot1-${run}`, email: `lot1-${run}-${randomUUID().slice(0, 6)}@example.mg`,
      password: 'x', status: 'ACTIVE', emailVerified: true, isAdmin,
    },
  });
  createdUsers.push(user.id);
  return user;
}

/** Tuteur avec un dossier PENDING, prêt à être approuvé. */
async function makeTutor(profile: { highestDegree?: string; degreeTitle?: string; degreeCountry?: string; fieldOfStudy?: string }) {
  const user = await makeUser();
  const tutor = await prisma.tutorProfile.create({ data: { userId: user.id, ...profile } });
  const application = await prisma.tutorApplication.create({
    data: { tutorProfileId: tutor.id, status: 'PENDING', submittedAt: new Date() },
  });
  return { user, tutor, application };
}

const rejects = (promise: Promise<unknown>, code: string) =>
  assert.rejects(promise, (e: Error) => {
    assert.equal(e.message, code);
    return true;
  });

describe('lot 1 — fondations du matching (base réelle)', { skip }, () => {
  let adminUser: { id: string };

  before(async () => {
    adminUser = await makeUser(true);
  });

  after(async () => {
    await prisma.degreeEquivalence.deleteMany({ where: { id: { in: createdEquivalences } } });
    await prisma.degreeEquivalence.deleteMany({ where: { degreeTitle: { contains: run } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await prisma.$disconnect();
    await pool.end();
  });

  describe('migration', () => {
    it('active pgvector et PostGIS, et la fonction degree_rank donne les rangs de la spec', async () => {
      const ext = await prisma.$queryRaw<{ extname: string }[]>`SELECT extname FROM pg_extension WHERE extname IN ('vector', 'postgis')`;
      assert.deepEqual(ext.map((e) => e.extname).sort(), ['postgis', 'vector']);
      const ranks = await prisma.$queryRaw<{ r: number[] }[]>`
        SELECT ARRAY[degree_rank('BAC'), degree_rank('LICENCE'), degree_rank('MASTER'), degree_rank('DOCTORAT'),
                     degree_rank('OTHER'), degree_rank(NULL)] AS r`;
      // OTHER et NULL valent 0 : non admissibles tant qu'aucune équivalence n'est appliquée (spec §3.1).
      assert.deepEqual(ranks[0].r, [1, 2, 3, 4, 0, 0]);
    });

    it('accepte un vecteur de 768 dimensions et refuse toute autre dimension', async () => {
      const { tutor } = await makeTutor({});
      const vector768 = JSON.stringify(Array.from({ length: 768 }, (_, i) => (i % 7) / 10));
      await prisma.$executeRaw`
        INSERT INTO tutor_search_chunks (id, "tutorProfileId", "sourceType", "sourceId", label, content, "contentHash",
                                         embedding, "embeddingModel", "updatedAt")
        VALUES (${randomUUID()}, ${tutor.id}, 'PROFILE'::"SearchChunkSource", ${tutor.id}, 'Parcours académique', 'x', 'h',
                ${vector768}::vector, 'm', now())`;
      await assert.rejects(
        prisma.$executeRaw`
          INSERT INTO tutor_search_chunks (id, "tutorProfileId", "sourceType", "sourceId", "chunkIndex", label, content,
                                           "contentHash", embedding, "embeddingModel", "updatedAt")
          VALUES (${randomUUID()}, ${tutor.id}, 'PROFILE'::"SearchChunkSource", ${tutor.id}, 1, 'l', 'x', 'h',
                  ${JSON.stringify([0.1, 0.2])}::vector, 'm', now())`,
      );
    });
  });

  describe('échelle académique en base (E2)', () => {
    it('chaque niveau du catalogue porte le rang de academic-scale.ts, « Formation pro » reste hors échelle', async () => {
      for (const { category, names } of CATALOG_LEVELS) {
        for (const name of names) {
          const level = await prisma.educationLevel.findUniqueOrThrow({ where: { name_category: { name, category } } });
          assert.equal(level.academicRank, academicRankOfLevel(category, name), `${category} / ${name}`);
          assert.equal(level.isActive, true, name);
        }
      }
    });

    it('les 9 rangs existent, strictement croissants de Primaire à Doctorat', async () => {
      const rows = await prisma.educationLevel.findMany({ where: { academicRank: { not: null }, isActive: true } });
      const distinct = [...new Set(rows.map((r) => r.academicRank as number))].sort((a, b) => a - b);
      assert.deepEqual(distinct, ACADEMIC_STEPS.map((s) => ACADEMIC_RANK[s]));
      const byName = new Map(rows.map((r) => [r.name, r.academicRank as number]));
      const ladder = ['7ème', '3ème', 'Terminale', 'Licence 1', 'Licence 2', 'Licence 3', 'Master 1', 'Master 2', 'Doctorat 1'];
      for (let i = 1; i < ladder.length; i += 1) {
        assert.ok(byName.get(ladder[i])! > byName.get(ladder[i - 1])!, `${ladder[i]} > ${ladder[i - 1]}`);
      }
    });

    it('displayOrder n’est pas le rang : réordonner l’affichage ne change aucun rang', async () => {
      const before = await prisma.educationLevel.findUniqueOrThrow({ where: { name_category: { name: 'Licence 2', category: 'Université' } } });
      try {
        await prisma.educationLevel.update({ where: { id: before.id }, data: { displayOrder: 9999 } });
        const after = await prisma.educationLevel.findUniqueOrThrow({ where: { id: before.id } });
        assert.equal(after.academicRank, ACADEMIC_RANK.L2);
      } finally {
        await prisma.educationLevel.update({ where: { id: before.id }, data: { displayOrder: before.displayOrder } });
      }
    });

    it('l’ancien « Master », s’il existe (base migrée depuis l’ancien catalogue), garde le rang M1 mais est inactif ; Master 1/2 et Doctorat 1 à 3 sont actifs', async () => {
      const legacy = await prisma.educationLevel.findUnique({ where: { name_category: { name: 'Master', category: 'Université' } } });
      if (legacy) {
        assert.equal(legacy.academicRank, ACADEMIC_RANK.M1);
        assert.equal(legacy.isActive, false);
      }
      const catalog = await prisma.educationLevel.findMany({ where: { category: 'Université', isActive: true } });
      assert.ok(['Master 1', 'Master 2', 'Doctorat 1', 'Doctorat 2', 'Doctorat 3'].every((n) => catalog.some((l) => l.name === n)));
      // L'ancien « Doctorat » sans année est conservé (rang 9) mais n'est plus proposé.
      const legacyDoctorat = await prisma.educationLevel.findUnique({ where: { name_category: { name: 'Doctorat', category: 'Université' } } });
      if (legacyDoctorat) {
        assert.equal(legacyDoctorat.academicRank, ACADEMIC_RANK.DOCTORAT);
        assert.equal(legacyDoctorat.isActive, false);
      }
    });

    it('la base refuse un rang hors 1..9', async () => {
      const id = await levelId('Université', 'Licence 1');
      await assert.rejects(prisma.$executeRaw`UPDATE education_levels SET "academicRank" = 10 WHERE id = ${id}`);
    });
  });

  describe('niveau académique validé du tuteur (E3, E6)', () => {
    it('un tuteur qui prépare encore son diplôme est validé à son niveau en cours (L2, L3, M1)', async () => {
      const { tutor } = await makeTutor({ highestDegree: 'BAC' });
      for (const name of ['Licence 2', 'Licence 3', 'Master 1']) {
        const result = await academicLevels.set(adminUser.id, tutor.id, await levelId('Université', name));
        assert.equal(result.academicLevel?.name, name);
        assert.equal(result.academicLevelValidatedById, adminUser.id);
        assert.ok(result.academicLevelValidatedAt);
      }
    });

    it('refuse un niveau hors échelle, inactif ou sous le Lycée/Bac', async () => {
      const { tutor } = await makeTutor({ highestDegree: 'MASTER' });
      await rejects(academicLevels.set(adminUser.id, tutor.id, await levelId('Université', 'Formation pro')), 'ACADEMIC_LEVEL_INVALID');
      const legacy = await prisma.educationLevel.findUnique({ where: { name_category: { name: 'Master', category: 'Université' } } });
      if (legacy) await rejects(academicLevels.set(adminUser.id, tutor.id, legacy.id), 'ACADEMIC_LEVEL_INVALID');
      await rejects(academicLevels.set(adminUser.id, tutor.id, await levelId('Collège', '3ème')), 'ACADEMIC_LEVEL_INVALID');
      await rejects(academicLevels.set(adminUser.id, tutor.id, randomUUID()), 'ACADEMIC_LEVEL_INVALID');
      const after = await prisma.tutorProfile.findUniqueOrThrow({ where: { id: tutor.id } });
      assert.equal(after.academicLevelId, null);
    });

    it('expert professionnel : Doctorat sans doctorat exige un motif, jamais validé automatiquement', async () => {
      const { tutor } = await makeTutor({ highestDegree: 'MASTER' });
      const doctorat = await levelId('Université', 'Doctorat 1');
      await rejects(academicLevels.set(adminUser.id, tutor.id, doctorat), 'ACADEMIC_LEVEL_NOTE_REQUIRED');
      await rejects(academicLevels.set(adminUser.id, tutor.id, doctorat, '   '), 'ACADEMIC_LEVEL_NOTE_REQUIRED');
      assert.equal((await prisma.tutorProfile.findUniqueOrThrow({ where: { id: tutor.id } })).academicLevelId, null);

      const done = await academicLevels.set(adminUser.id, tutor.id, doctorat, '15 ans de cryptographie en entreprise');
      assert.equal(done.academicLevel?.name, 'Doctorat 1');
      assert.equal(done.academicLevelNote, '15 ans de cryptographie en entreprise');
    });

    it('un docteur n’a pas besoin de motif', async () => {
      const { tutor } = await makeTutor({ highestDegree: 'DOCTORAT' });
      const done = await academicLevels.set(adminUser.id, tutor.id, await levelId('Université', 'Doctorat 1'));
      assert.equal(done.academicLevel?.name, 'Doctorat 1');
      assert.equal(done.academicLevelNote, null);
    });

    it('la révocation retire le niveau, la date, l’auteur et le motif', async () => {
      const { tutor } = await makeTutor({ highestDegree: 'MASTER' });
      await academicLevels.set(adminUser.id, tutor.id, await levelId('Université', 'Master 2'), 'ok');
      const revoked = await academicLevels.revoke(tutor.id);
      assert.equal(revoked.academicLevelId, null);
      assert.equal(revoked.academicLevelValidatedAt, null);
      assert.equal(revoked.academicLevelValidatedById, null);
      assert.equal(revoked.academicLevelNote, null);
    });

    it('un tuteur fraîchement approuvé sans décision n’a AUCUN niveau validé', async () => {
      const { application, tutor } = await makeTutor({ highestDegree: 'MASTER' });
      await admin.approveApplication(adminUser.id, application.id);
      const after = await prisma.tutorProfile.findUniqueOrThrow({ where: { id: tutor.id } });
      assert.equal(after.isVisible, true);
      assert.equal(after.academicLevelId, null);
    });

    it('l’approbation fixe le niveau choisi par l’admin avec son motif', async () => {
      const { application, tutor } = await makeTutor({ highestDegree: 'BAC' });
      const l3 = await levelId('Université', 'Licence 3');
      await admin.approveApplication(adminUser.id, application.id, { academicLevelId: l3, academicLevelNote: 'Certificat de scolarité L3 vérifié' });
      const after = await prisma.tutorProfile.findUniqueOrThrow({ where: { id: tutor.id }, include: { academicLevel: true } });
      assert.equal(after.academicLevel?.name, 'Licence 3');
      assert.equal(after.academicLevelNote, 'Certificat de scolarité L3 vérifié');
      assert.equal(after.academicLevelValidatedById, adminUser.id);
    });

    it('une décision invalide annule toute l’approbation (même transaction)', async () => {
      const { application, tutor } = await makeTutor({ highestDegree: 'MASTER' });
      await rejects(
        admin.approveApplication(adminUser.id, application.id, { academicLevelId: await levelId('Université', 'Doctorat 1') }),
        'ACADEMIC_LEVEL_NOTE_REQUIRED',
      );
      const after = await prisma.tutorProfile.findUniqueOrThrow({ where: { id: tutor.id } });
      assert.equal(after.isVisible, false);
      assert.equal((await prisma.tutorApplication.findUniqueOrThrow({ where: { id: application.id } })).status, 'PENDING');
    });

    it('la base impose niveau ⇔ date de validation', async () => {
      const { tutor } = await makeTutor({});
      const id = await levelId('Université', 'Licence 1');
      await assert.rejects(prisma.$executeRaw`UPDATE tutor_profiles SET "academicLevelId" = ${id} WHERE id = ${tutor.id}`);
    });
  });

  describe('équivalences de diplômes (API admin)', () => {
    it('une équivalence validée est réutilisée pour un second tuteur au même diplôme', async () => {
      const title = `DUT Génie électrique ${run}`;
      const l2 = await levelId('Université', 'Licence 2');
      const first = await makeTutor({ highestDegree: 'OTHER', degreeTitle: title, degreeCountry: 'Madagascar', fieldOfStudy: '' });
      const second = await makeTutor({
        highestDegree: 'OTHER', degreeTitle: `  ${title.toLowerCase().replace('é', 'e')} `, degreeCountry: 'MADAGASCAR',
      });

      // Premier tuteur : rien n'existe, l'admin crée puis tranche l'équivalence, puis l'applique.
      assert.equal(await equivalences.lookup({ degreeTitle: title, country: 'Madagascar' }), null);
      const created = await equivalences.create(adminUser.id, { degreeTitle: title, country: 'Madagascar', status: 'PENDING' });
      createdEquivalences.push(created.id);
      assert.equal(created.status, 'PENDING');
      await rejects(equivalences.applyToApplication(adminUser.id, first.application.id, created.id), 'DEGREE_EQUIVALENCE_NOT_VALIDATED');

      const decided = await equivalences.decide(adminUser.id, created.id, {
        status: 'VALIDATED', equivalentDegree: 'LICENCE', equivalentLevelId: l2, notes: 'Bac+2, spécialité électricité',
      });
      assert.equal(decided.status, 'VALIDATED');
      assert.equal(decided.validatedById, adminUser.id);
      await equivalences.applyToApplication(adminUser.id, first.application.id, created.id);

      const a = await prisma.tutorProfile.findUniqueOrThrow({ where: { id: first.tutor.id }, include: { academicLevel: true } });
      assert.equal(a.highestDegree, 'LICENCE');
      assert.equal(a.degreeEquivalenceId, created.id);
      assert.equal(a.academicLevel?.name, 'Licence 2');

      // Second tuteur, même diplôme écrit autrement : l'équivalence existante est retrouvée, sans nouvelle décision.
      const found = await equivalences.lookup({ degreeTitle: second.tutor.degreeTitle!, country: second.tutor.degreeCountry! });
      assert.equal(found?.id, created.id);
      const listing = await admin.tutorApplications('PENDING');
      assert.equal(listing.find((x) => x.id === second.application.id)?.degreeEquivalenceSuggestion?.id, created.id);

      await admin.approveApplication(adminUser.id, second.application.id, { degreeEquivalenceId: found!.id });
      const b = await prisma.tutorProfile.findUniqueOrThrow({ where: { id: second.tutor.id }, include: { academicLevel: true } });
      assert.equal(b.highestDegree, 'LICENCE');
      assert.equal(b.degreeEquivalenceId, created.id);
      assert.equal(b.academicLevel?.name, 'Licence 2');
      assert.equal(b.isVisible, true);

      assert.equal(await prisma.degreeEquivalence.count({ where: { degreeTitle: { contains: run } } }), 1);
    });

    it('refuse un doublon (même diplôme, pays, spécialité, quelle que soit l’écriture)', async () => {
      const title = `Ingénieur informatique ${run}`;
      const created = await equivalences.create(adminUser.id, { degreeTitle: title, country: 'France', status: 'PENDING' });
      createdEquivalences.push(created.id);
      await assert.rejects(
        equivalences.create(adminUser.id, { degreeTitle: title.toUpperCase(), country: 'france', specialty: ' ', status: 'PENDING' }),
        (e: Error) => e.message === 'DEGREE_EQUIVALENCE_DUPLICATE',
      );
      // Une autre spécialité est une autre équivalence.
      const other = await equivalences.create(adminUser.id, { degreeTitle: title, country: 'France', specialty: 'Réseaux', status: 'REJECTED', notes: 'Non reconnu' });
      createdEquivalences.push(other.id);
      assert.equal(other.equivalentDegree, null);
    });

    it('une équivalence rejetée ne peut pas être appliquée', async () => {
      const { application } = await makeTutor({ highestDegree: 'OTHER', degreeTitle: `Titre étranger ${run}`, degreeCountry: 'Ailleurs' });
      const rejected = await equivalences.create(adminUser.id, { degreeTitle: `Titre étranger ${run}`, country: 'Ailleurs', status: 'REJECTED' });
      createdEquivalences.push(rejected.id);
      await rejects(equivalences.applyToApplication(adminUser.id, application.id, rejected.id), 'DEGREE_EQUIVALENCE_NOT_VALIDATED');
    });

    it('une équivalence ne s’applique qu’à un diplôme « autre »', async () => {
      const { application } = await makeTutor({ highestDegree: 'MASTER' });
      const eq = await equivalences.create(adminUser.id, {
        degreeTitle: `BTS ${run}`, country: 'France', status: 'VALIDATED', equivalentDegree: 'BAC',
        equivalentLevelId: await levelId('Lycée', 'Terminale'),
      });
      createdEquivalences.push(eq.id);
      await rejects(equivalences.applyToApplication(adminUser.id, application.id, eq.id), 'DEGREE_NOT_OTHER');
    });

    it('une décision VALIDATED sans niveau, ou avec un niveau hors échelle, est refusée (service et base)', async () => {
      await rejects(
        equivalences.create(adminUser.id, { degreeTitle: `Sans niveau ${run}`, country: 'X', status: 'VALIDATED', equivalentDegree: 'LICENCE' }),
        'DEGREE_EQUIVALENCE_INVALID',
      );
      await rejects(
        equivalences.create(adminUser.id, {
          degreeTitle: `Hors échelle ${run}`, country: 'X', status: 'VALIDATED', equivalentDegree: 'LICENCE',
          equivalentLevelId: await levelId('Université', 'Formation pro'),
        }),
        'ACADEMIC_LEVEL_INVALID',
      );
      await rejects(
        equivalences.create(adminUser.id, { degreeTitle: `Rejet avec niveau ${run}`, country: 'X', status: 'REJECTED', equivalentDegree: 'LICENCE' }),
        'DEGREE_EQUIVALENCE_INVALID',
      );
      await assert.rejects(prisma.$executeRaw`
        INSERT INTO degree_equivalences (id, "degreeTitle", country, status, "updatedAt")
        VALUES (${randomUUID()}, ${`Contrainte ${run}`}, 'X', 'VALIDATED'::"DegreeEquivalenceStatus", now())`);
    });

    it('la liste filtre par statut et par recherche', async () => {
      const validated = await equivalences.list({ status: 'VALIDATED', search: run, page: 1 });
      assert.ok(validated.length >= 1 && validated.every((e) => e.status === 'VALIDATED' && e.degreeTitle.includes(run)));
    });
  });

  describe('champs de profil du diplôme éditables par le tuteur', () => {
    it('le dossier enregistre intitulé, domaine, spécialisation, établissement et pays', async () => {
      const user = await makeUser();
      const subject = await prisma.subject.create({ data: { name: `Matière lot1 ${run}`, isVerified: true } });
      try {
        const terminale = await levelId('Lycée', 'Terminale');
        const draft = await applications.createDraft(user.id, {
          firstName: 'Aina', lastName: 'Rakoto', email: user.email, phone: '0340000000',
          highestDegree: 'OTHER', degreeTitle: ' DUT Génie électrique ', fieldOfStudy: 'Électricité',
          specialization: 'Automatismes', degreeInstitution: 'IUT Antsiranana', degreeCountry: 'Madagascar',
          experiences: [], subjects: [{ subjectId: subject.id, educationLevelId: terminale }],
          offers: [], places: [], availabilities: [],
        });
        assert.equal(draft.degreeTitle, 'DUT Génie électrique');
        assert.equal(draft.fieldOfStudy, 'Électricité');
        assert.equal(draft.specialization, 'Automatismes');
        assert.equal(draft.degreeInstitution, 'IUT Antsiranana');
        assert.equal(draft.degreeCountry, 'Madagascar');

        // Un niveau validé / une équivalence appliquée ne survivent pas à une modification du dossier.
        const profile = await prisma.tutorProfile.findUniqueOrThrow({ where: { userId: user.id } });
        await prisma.tutorProfile.update({
          where: { id: profile.id },
          data: { academicLevelId: await levelId('Université', 'Licence 3'), academicLevelValidatedAt: new Date() },
        });
        await applications.updateDraft(user.id, draft.id, {
          firstName: 'Aina', lastName: 'Rakoto', email: user.email, phone: '0340000000', highestDegree: 'BAC',
          experiences: [], subjects: [{ subjectId: subject.id, educationLevelId: terminale }],
          offers: [], places: [], availabilities: [],
        });
        const reset = await prisma.tutorProfile.findUniqueOrThrow({ where: { id: profile.id } });
        assert.equal(reset.academicLevelId, null);
        assert.equal(reset.academicLevelValidatedAt, null);
        assert.equal(reset.degreeTitle, null);
      } finally {
        await prisma.user.deleteMany({ where: { id: user.id } }); // cascade : profil et matières déclarées
        await prisma.subject.deleteMany({ where: { id: subject.id } });
      }
    });

    it('le profil tuteur (PATCH) les met à jour et expose le niveau validé en lecture seule', async () => {
      const { user, tutor } = await makeTutor({ highestDegree: 'MASTER' });
      await tutors.updateProfile(user.id, {
        degreeTitle: 'Master Informatique', fieldOfStudy: 'Informatique', specialization: 'Cryptographie',
        degreeInstitution: 'Université de Fianarantsoa', degreeCountry: 'Madagascar',
      });
      await academicLevels.set(adminUser.id, tutor.id, await levelId('Université', 'Master 2'), 'validé');
      const me = await tutors.myProfile(user.id);
      assert.equal(me.degreeTitle, 'Master Informatique');
      assert.equal(me.specialization, 'Cryptographie');
      assert.equal(me.degreeCountry, 'Madagascar');
      assert.equal(me.academicLevel?.name, 'Master 2');
      assert.ok(!('academicLevelNote' in me), 'le motif de la décision reste interne');
    });
  });
});
