/**
 * Suspension et levée de suspension d'un tuteur : base PostgreSQL RÉELLE, migrations appliquées. À lancer avec :
 *
 *   TEST_DATABASE_URL=postgresql://eduloc:eduloc@localhost:5433/eduloc_scratch npm run test:int
 *
 * Ne jamais pointer vers la base Supabase. Chaque exécution crée ses données (suffixe unique) et les supprime.
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

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL absent : tests d’intégration ignorés';

const run = randomUUID().slice(0, 8);
const pool = new pg.Pool({ connectionString: url, max: 4 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const db = prisma as unknown as PrismaService;
const cache = { bumpSearch: async () => undefined, invalidate: async () => undefined } as never;
const academicLevels = new AcademicLevelService(db, cache);
const admin = new AdminService(
  db, new OutboxWriter(), cache, null as never, null as never, new DegreeEquivalencesService(db, academicLevels, cache), academicLevels,
);

const createdUsers: string[] = [];
const createdSubjects: string[] = [];

const makeUser = async (isAdmin = false) => {
  const user = await prisma.user.create({
    data: {
      firstName: 'Test', lastName: `Susp-${run}`, email: `susp-${run}-${randomUUID().slice(0, 6)}@example.mg`,
      password: 'x', status: 'ACTIVE', emailVerified: true, isAdmin,
    },
  });
  createdUsers.push(user.id);
  return user;
};

const code = (promise: Promise<unknown>) =>
  promise.then(() => 'OK', (e: { message?: string }) => e.message ?? 'ERR');

describe('suspension d’un tuteur (base réelle)', { skip }, () => {
  let adminId: string;
  let profileId: string;
  let bookingId: string;

  before(async () => {
    adminId = (await makeUser(true)).id;
    const tutor = await makeUser();
    const profile = await prisma.tutorProfile.create({ data: { userId: tutor.id, displayName: `Tuteur ${run}`, isVisible: true } });
    profileId = profile.id;
    await prisma.tutorApplication.create({ data: { tutorProfileId: profileId, status: 'APPROVED', submittedAt: new Date() } });
    const subject = await prisma.subject.create({ data: { name: `Matière ${run}` } });
    createdSubjects.push(subject.id);
    const offer = await prisma.offer.create({
      data: { tutorProfileId: profileId, subjectId: subject.id, title: 'Cours', description: 'd', price: 10000 },
    });
    const requester = await makeUser();
    const beneficiary = await prisma.beneficiary.create({ data: { requesterId: requester.id, firstName: 'Élève', relationship: 'SELF' } });
    const booking = await prisma.booking.create({
      data: {
        requesterId: requester.id, beneficiaryId: beneficiary.id, tutorProfileId: profileId, offerId: offer.id,
        startAt: new Date(Date.now() + 2 * 86_400_000), endAt: new Date(Date.now() + 2 * 86_400_000 + 3_600_000),
        status: 'CONFIRMED', teachingMode: 'ONLINE', price: 10000, offerTitle: 'Cours',
      },
    });
    bookingId = booking.id;
  });

  after(async () => {
    await prisma.booking.deleteMany({ where: { tutorProfileId: profileId } });
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await prisma.subject.deleteMany({ where: { id: { in: createdSubjects } } });
    await prisma.$disconnect();
    await pool.end();
  });

  it('lever une suspension absente est refusé', async () => {
    assert.equal(await code(admin.reinstateTutor(adminId, profileId)), 'TUTOR_NOT_SUSPENDED');
  });

  it('suspendre masque le profil et signale la séance à venir ; lever rétablit et classe ce conflit', async () => {
    const suspended = await admin.suspendTutor(adminId, profileId, 'Plainte');
    assert.equal(suspended.affectedBookings, 1);
    let tutor = await prisma.tutorProfile.findUniqueOrThrow({ where: { id: profileId } });
    assert.equal(tutor.isVisible, false);
    assert.notEqual(tutor.suspendedAt, null);
    assert.equal(await prisma.conflict.count({ where: { bookingId, type: 'TUTOR_SUSPENDED', status: 'OPEN' } }), 1);

    const result = await admin.reinstateTutor(adminId, profileId, 'Plainte infondée');
    assert.deepEqual(result, { ok: true, dismissedConflicts: 1 });
    tutor = await prisma.tutorProfile.findUniqueOrThrow({ where: { id: profileId } });
    assert.equal(tutor.isVisible, true);
    assert.equal(tutor.suspendedAt, null);
    const conflict = await prisma.conflict.findFirstOrThrow({ where: { bookingId, type: 'TUTOR_SUSPENDED' } });
    assert.equal(conflict.status, 'DISMISSED');
    assert.equal(conflict.resolvedById, adminId);
    assert.equal(conflict.resolution, 'Suspension levée : Plainte infondée');
    // Un conflit d'un autre type n'est pas touché par la levée.
    assert.equal(await prisma.conflict.count({ where: { bookingId, type: { not: 'TUTOR_SUSPENDED' } } }), 0);
  });

  it('la détection planifiée ne recrée pas le conflit une fois la suspension levée', async () => {
    await admin.detectConflicts();
    assert.equal(await prisma.conflict.count({ where: { bookingId, type: 'TUTOR_SUSPENDED', status: 'OPEN' } }), 0);
  });

  it('refuse un tuteur sans dossier approuvé et un tuteur inconnu', async () => {
    const tutor = await makeUser();
    const profile = await prisma.tutorProfile.create({ data: { userId: tutor.id, isVisible: false, suspendedAt: new Date() } });
    assert.equal(await code(admin.reinstateTutor(adminId, profile.id)), 'TUTOR_APPLICATION_NOT_APPROVED');
    assert.equal(await code(admin.reinstateTutor(adminId, randomUUID())), 'TUTOR_NOT_FOUND');
  });
});
