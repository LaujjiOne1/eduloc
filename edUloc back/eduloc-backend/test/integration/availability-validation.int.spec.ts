/**
 * Une disponibilité qui ne produirait aucun créneau réservable est refusée à la création (plage plus courte que la
 * séance, salle partenaire sans salle acceptée) au lieu de rester silencieusement invisible à la réservation. À lancer :
 *
 *   TEST_DATABASE_URL=postgresql://eduloc:eduloc@localhost:5433/eduloc_scratch npm run test:int
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import type { PrismaService } from '../../src/core/prisma/prisma.service';
import { AvailabilitiesService } from '../../src/modules/tutors/tutors.service';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL absent : tests d’intégration ignorés';

const run = randomUUID().slice(0, 8);
const pool = new pg.Pool({ connectionString: url, max: 4 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const availabilities = new AvailabilitiesService(prisma as unknown as PrismaService);

const code = (promise: Promise<unknown>) =>
  promise.then(() => 'OK', (e: { message?: string }) => e.message ?? 'ERR');

describe('validation des disponibilités du Tuteur (base réelle)', { skip }, () => {
  let userId: string;
  let profileId: string;
  let subjectId: string;
  let venueManagerId: string;
  let roomId: string;
  let planId: string;

  before(async () => {
    const user = await prisma.user.create({
      data: { firstName: 'Test', lastName: `Avail-${run}`, email: `avail-${run}@example.mg`, password: 'x', status: 'ACTIVE', emailVerified: true },
    });
    userId = user.id;
    profileId = (await prisma.tutorProfile.create({ data: { userId, displayName: `Tuteur ${run}`, isVisible: true } })).id;
    subjectId = (await prisma.subject.create({ data: { name: `Matière ${run}` } })).id;
  });

  after(async () => {
    await prisma.tutorProfile.deleteMany({ where: { id: profileId } });
    if (roomId) await prisma.partnerVenue.deleteMany({ where: { managerId: venueManagerId } });
    if (planId) await prisma.partnerPlan.deleteMany({ where: { id: planId } });
    await prisma.subject.deleteMany({ where: { id: subjectId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, venueManagerId].filter(Boolean) } } });
    await prisma.$disconnect();
    await pool.end();
  });

  it('sans offre, aucune durée à comparer : la plage est acceptée', async () => {
    assert.equal(await code(availabilities.create(userId, { dayOfWeek: 1, startTime: '10:00', endTime: '10:30', online: true })), 'OK');
  });

  it('refuse une plage plus courte que la plus petite durée réservable, l’accepte dès qu’elle tient', async () => {
    await prisma.offer.create({
      data: {
        tutorProfileId: profileId, subjectId, title: 'Cours', description: 'Cours test', format: 'BOTH',
        durationMinutes: 60, durationOptions: [90], price: 10000,
      },
    });
    assert.equal(await code(availabilities.create(userId, { dayOfWeek: 2, startTime: '10:10', endTime: '11:00', online: true })), 'AVAILABILITY_TOO_SHORT');
    assert.equal(await code(availabilities.create(userId, { dayOfWeek: 2, startTime: '10:00', endTime: '11:00', online: true })), 'OK');
  });

  it('une plage liée à une offre est comparée aux durées de CETTE offre', async () => {
    await prisma.offer.create({
      data: { tutorProfileId: profileId, subjectId, title: 'Flash', description: 'Court', format: 'ONLINE', durationMinutes: 30, price: 5000 },
    });
    // Libre : la plus petite durée des offres (30 min) suffit désormais.
    assert.equal(await code(availabilities.create(userId, { dayOfWeek: 3, startTime: '10:00', endTime: '10:30', online: true })), 'OK');
    // Liée à l'offre de 60 min : 30 min ne suffisent pas.
    const long = await prisma.offer.findFirstOrThrow({ where: { tutorProfileId: profileId, durationMinutes: 60 } });
    assert.equal(
      await code(availabilities.create(userId, { dayOfWeek: 3, startTime: '12:00', endTime: '12:30', online: true, offerId: long.id })),
      'AVAILABILITY_TOO_SHORT',
    );
  });

  it('refuse de raccourcir une plage existante sous la durée d’une séance', async () => {
    const created = await availabilities.create(userId, { dayOfWeek: 4, startTime: '09:00', endTime: '11:00', online: true });
    // Plus petite durée = 30 min (offre « Flash ») : 20 min ne tiennent pas, 30 min oui.
    assert.equal(await code(availabilities.update(userId, created.id, { endTime: '09:20' })), 'AVAILABILITY_TOO_SHORT');
    assert.equal(await code(availabilities.update(userId, created.id, { endTime: '09:30' })), 'OK');
  });

  it('refuse « salle partenaire » sans salle acceptée, l’accepte une fois la salle acceptée', async () => {
    assert.equal(
      await code(availabilities.create(userId, { dayOfWeek: 5, startTime: '09:00', endTime: '12:00', partnerRoom: true })),
      'AVAILABILITY_NO_ACCEPTED_ROOM',
    );

    const manager = await prisma.user.create({
      data: { firstName: 'Gest', lastName: `Avail-${run}`, email: `avail-mgr-${run}@example.mg`, password: 'x', status: 'ACTIVE', emailVerified: true },
    });
    venueManagerId = manager.id;
    const now = new Date();
    const plan = await prisma.partnerPlan.create({ data: { code: `T-${run}`, name: 'Test', priceAmount: 0, durationDays: 30 } });
    planId = plan.id;
    const venue = await prisma.partnerVenue.create({
      data: {
        managerId: manager.id, name: `Structure ${run}`, status: 'APPROVED',
        subscriptions: { create: { planId: plan.id, status: 'ACTIVE', startsAt: new Date(now.getTime() - 86_400_000), endsAt: new Date(now.getTime() + 86_400_000) } },
      },
    });
    const room = await prisma.room.create({
      data: { venueId: venue.id, name: `Salle ${run}`, status: 'APPROVED', publication: 'PUBLISHED', publishedAt: now },
    });
    roomId = room.id;
    await prisma.tutorRoom.create({ data: { tutorProfileId: profileId, roomId } });

    assert.equal(await code(availabilities.create(userId, { dayOfWeek: 5, startTime: '09:00', endTime: '12:00', partnerRoom: true })), 'OK');

    // Salle retirée de la vente (dépubliée) : redevient refusé.
    await prisma.room.update({ where: { id: roomId }, data: { publication: 'UNPUBLISHED' } });
    assert.equal(
      await code(availabilities.create(userId, { dayOfWeek: 6, startTime: '09:00', endTime: '12:00', partnerRoom: true })),
      'AVAILABILITY_NO_ACCEPTED_ROOM',
    );
  });
});
