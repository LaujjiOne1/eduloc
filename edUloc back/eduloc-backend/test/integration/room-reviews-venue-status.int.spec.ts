/**
 * Tests d'intégration : avis sur les salles (séance terminée, réponse unique, masquage) et statuts de structure
 * (Refusé, Désactivé, NIF/STAT, nouvelle soumission). Base PostgreSQL RÉELLE, migrations appliquées. À lancer avec :
 *
 *   TEST_DATABASE_URL=postgresql://eduloc:<mot de passe>@localhost:5433/eduloc_scratch npm run test:int
 *
 * Ne jamais pointer vers la base de développement ni Supabase.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import type { PrismaService } from '../../src/core/prisma/prisma.service';
import type { AppConfig } from '../../src/core/config/app.config';
import { OutboxWriter } from '../../src/infrastructure/outbox/outbox-writer';
import { PartnerAdminService } from '../../src/modules/partners/partner-admin.service';
import { PartnerRoomsService } from '../../src/modules/partners/partner-rooms.service';
import type { PartnerUploadsService } from '../../src/modules/partners/partner-support';
import { PartnerVenueService } from '../../src/modules/partners/partner-venue.service';
import { bookableRoomWhere } from '../../src/modules/partners/domain/room-bookability';
import { RoomReviewsService } from '../../src/modules/rooms/room-reviews.service';
import { RoomsService } from '../../src/modules/rooms/rooms.service';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL absent : tests d’intégration ignorés';

const run = randomUUID().slice(0, 8);
const pool = new pg.Pool({ connectionString: url, max: 6 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const db = prisma as unknown as PrismaService;

const cfg = {
  otpEncryptionKey: randomBytes(32), partnerDocsBucket: 'partner-documents', roomPhotosBucket: 'room-photos',
  roomMaxHourlyFee: 10_000, bookingBufferMinutes: 15, bookingTravelBufferMinutes: 30, roomTurnoverBufferMinutes: 0,
} as unknown as AppConfig;
const uploads = { readUrl: async (_b: string, path: string) => `https://signed.test/${path}`, remove: async () => undefined } as unknown as PartnerUploadsService;
const outbox = new OutboxWriter();
const venues = new PartnerVenueService(db, cfg, outbox, uploads);
const partnerRooms = new PartnerRoomsService(db, cfg, outbox, uploads);
const admin = new PartnerAdminService(db, cfg, outbox, uploads);
const reviews = new RoomReviewsService(db, outbox);
const publicRooms = new RoomsService(db, cfg, uploads);

const createdUsers: string[] = [];
const createdSubjects: string[] = [];
const createdPlans: string[] = [];
const code = (promise: Promise<unknown>) =>
  promise.then(() => 'OK', (e: { code?: string; message?: string }) => e.code ?? e.message ?? 'ERR');
const ratings = (n: number) => ({ cleanliness: n, safety: n, accessibility: n, equipment: n, punctuality: n, overall: n });

describe('avis sur les salles et statuts de structure (base réelle)', { skip }, () => {
  let adminUser: { id: string };
  let manager: { id: string };
  let otherManager: { id: string };
  let venueId: string;
  let roomId: string;
  let tutor: { userId: string; profileId: string; offerId: string };
  let requester: { id: string; beneficiaryId: string };
  let stranger: { id: string };

  async function makeUser(isAdmin = false) {
    const user = await prisma.user.create({
      data: { firstName: 'Test', lastName: `Rev-${run}`, email: `rev-${run}-${randomUUID().slice(0, 6)}@example.mg`, password: 'x', status: 'ACTIVE', emailVerified: true, isAdmin },
    });
    createdUsers.push(user.id);
    return user;
  }

  /** Séance dans la salle, au statut voulu, directement en base (le parcours de réservation est testé ailleurs). */
  async function makeBooking(status: 'COMPLETED' | 'CONFIRMED', inRoom: boolean) {
    const startAt = new Date(Date.now() - 48 * 3_600_000 + Math.floor(Math.random() * 1e6));
    return prisma.booking.create({
      data: {
        requesterId: requester.id, beneficiaryId: requester.beneficiaryId, tutorProfileId: tutor.profileId, offerId: tutor.offerId,
        roomId: inRoom ? roomId : null, startAt, endAt: new Date(startAt.getTime() + 3_600_000), status,
        teachingMode: inRoom ? 'PARTNER_ROOM' : 'ONLINE', price: 10_000, offerTitle: 'Cours',
      },
    });
  }

  before(async () => {
    adminUser = await makeUser(true);
    manager = await makeUser();
    otherManager = await makeUser();
    stranger = await makeUser();
    const tutorUser = await makeUser();
    const profile = await prisma.tutorProfile.create({ data: { userId: tutorUser.id, displayName: `Tuteur ${run}`, isVisible: true } });
    const subject = await prisma.subject.create({ data: { name: `Matière ${run}` } });
    createdSubjects.push(subject.id);
    const offer = await prisma.offer.create({
      data: { tutorProfileId: profile.id, subjectId: subject.id, title: 'Cours', description: 'Test', format: 'BOTH', durationMinutes: 60, price: 10_000 },
    });
    tutor = { userId: tutorUser.id, profileId: profile.id, offerId: offer.id };
    const reqUser = await makeUser();
    const beneficiary = await prisma.beneficiary.create({ data: { requesterId: reqUser.id, firstName: 'Élève', relationship: 'SELF', birthDate: new Date('1990-01-01') } });
    requester = { id: reqUser.id, beneficiaryId: beneficiary.id };

    const plan = await prisma.partnerPlan.create({ data: { code: `PLAN_${run}`.toUpperCase(), name: 'Test', priceAmount: 0, durationDays: 365 } });
    createdPlans.push(plan.id);
    const venue = await prisma.partnerVenue.create({
      data: { managerId: manager.id, name: `Lieu ${run}`, status: 'APPROVED', nif: `NIF${run}`, stat: `STAT${run}` },
    });
    venueId = venue.id;
    await prisma.venueSubscription.create({
      data: { venueId, planId: plan.id, status: 'ACTIVE', startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 365 * 86_400_000) },
    });
    const room = await prisma.room.create({
      data: { venueId, name: `Salle ${run}`, zoneLabel: 'Analakely', capacity: 4, pricePerHour: 5_000, welcomesMinors: true, status: 'APPROVED', publication: 'PUBLISHED' },
    });
    roomId = room.id;
  });

  after(async () => {
    const bookingIds = (await prisma.booking.findMany({ where: { requesterId: { in: createdUsers } }, select: { id: true } })).map((b) => b.id);
    await prisma.roomReview.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.outboxEvent.deleteMany({ where: { OR: [{ aggregateId: { in: bookingIds } }, { aggregateId: venueId }] } });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.partnerVenue.deleteMany({ where: { managerId: { in: createdUsers } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await prisma.partnerPlan.deleteMany({ where: { id: { in: createdPlans } } });
    await prisma.subject.deleteMany({ where: { id: { in: createdSubjects } } });
    await prisma.$disconnect();
    await pool.end();
  });

  describe('avis sur les salles', () => {
    it('lié à une séance TERMINÉE, tenue dans une salle, à laquelle l’auteur a assisté', async () => {
      const pending = await makeBooking('CONFIRMED', true);
      assert.equal(await code(reviews.create(requester.id, { bookingId: pending.id, ...ratings(5) })), 'BOOKING_NOT_COMPLETED');
      const online = await makeBooking('COMPLETED', false);
      assert.equal(await code(reviews.create(requester.id, { bookingId: online.id, ...ratings(5) })), 'ROOM_REVIEW_NOT_A_ROOM_BOOKING');
      const done = await makeBooking('COMPLETED', true);
      assert.equal(await code(reviews.create(stranger.id, { bookingId: done.id, ...ratings(5) })), 'BOOKING_NOT_FOUND');
      assert.equal(await code(reviews.create(manager.id, { bookingId: done.id, ...ratings(5) })), 'BOOKING_NOT_FOUND', 'le partenaire ne note pas sa propre salle');
    });

    it('le Demandeur et le Tuteur de la séance notent chacun une fois ; la moyenne suit', async () => {
      const done = await makeBooking('COMPLETED', true);
      const first = await reviews.create(requester.id, { bookingId: done.id, ...ratings(5), comment: 'Très propre' });
      assert.equal(first.authorRole, 'REQUESTER');
      const again = await reviews.create(requester.id, { bookingId: done.id, ...ratings(1) });
      assert.equal(again.id, first.id, 'un seul avis par séance et par auteur (idempotent)');
      const byTutor = await reviews.create(tutor.userId, { bookingId: done.id, ...ratings(3) });
      assert.equal(byTutor.authorRole, 'TUTOR');

      const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
      assert.equal(room.reviewsCount, 2);
      assert.equal(room.rating, 4);

      const listing = await reviews.listPublic(roomId);
      assert.equal(listing.reviewsCount, 2);
      assert.equal(listing.averages.cleanliness, 4);
      assert.ok(!JSON.stringify(listing).includes(requester.id), 'aucun identifiant de compte dans la liste publique');
      const fiche = await publicRooms.detail(roomId);
      assert.equal(fiche.rating, 4);
      assert.equal(fiche.reviewsCount, 2);
    });

    it('le partenaire répond UNE fois ; un autre Gestionnaire ne voit ni ne modifie rien', async () => {
      const review = (await reviews.listForManager(manager.id)).find((r) => r.needsReply)!;
      assert.ok(review);
      assert.deepEqual(await reviews.listForManager(otherManager.id), []);
      assert.equal(await code(reviews.reply(otherManager.id, review.id, 'Merci')), 'ROOM_REVIEW_NOT_FOUND');
      assert.equal(await code(reviews.reply(manager.id, review.id, '   ')), 'ROOM_REVIEW_REPLY_REQUIRED');
      assert.equal(await code(reviews.reply(manager.id, review.id, 'Merci pour votre retour')), 'OK');
      assert.equal(await code(reviews.reply(manager.id, review.id, 'Seconde réponse')), 'ROOM_REVIEW_ALREADY_REPLIED');
      const stored = await prisma.roomReview.findUniqueOrThrow({ where: { id: review.id } });
      assert.equal(stored.partnerReply, 'Merci pour votre retour');
    });

    it('l’administrateur masque un avis avec un motif : il quitte la liste et la moyenne', async () => {
      const visible = (await reviews.listPublic(roomId)).reviews;
      const target = visible.find((r) => r.ratings.overall === 3)!;
      assert.equal(await code(reviews.hide(adminUser.id, target.id, '  ')), 'REVIEW_HIDE_REASON_REQUIRED');
      assert.equal(await code(reviews.hide(adminUser.id, target.id, 'Contient un numéro de téléphone')), 'OK');
      const after = await reviews.listPublic(roomId);
      assert.equal(after.reviewsCount, 1);
      assert.equal(after.rating, 5);
      const stored = await prisma.roomReview.findUniqueOrThrow({ where: { id: target.id } });
      assert.equal(stored.hiddenReason, 'Contient un numéro de téléphone');
      assert.equal(stored.hiddenById, adminUser.id);
      assert.equal(await code(reviews.reply(manager.id, target.id, 'Réponse')), 'ROOM_REVIEW_HIDDEN');
      await reviews.unhide(target.id);
      assert.equal((await reviews.listPublic(roomId)).reviewsCount, 2);
    });
  });

  describe('statuts de structure', () => {
    it('le NIF et le STAT sont facultatifs jusqu’à la vérification complète', async () => {
      const m = await makeUser();
      const venue = await venues.create(m.id, { name: `Sans numéros ${run}`, type: 'TRAINING_CENTER', contactEmail: `c-${run}@example.mg` });
      assert.equal(venue.status, 'DRAFT');
      await prisma.venueDocument.create({
        data: { venueId: venue.id, type: 'OWNERSHIP_PROOF', storagePath: `venues/${venue.id}/${run}.pdf`, mimeType: 'application/pdf', sizeBytes: 10 },
      });
      assert.equal((await venues.submit(m.id)).status, 'SUBMITTED', 'soumission possible sans NIF / STAT : en attente de vérification');
      assert.equal(await code(admin.reviewVenue(adminUser.id, venue.id, { decision: 'APPROVE' })), 'VENUE_NIF_STAT_REQUIRED');
      await prisma.partnerVenue.update({ where: { id: venue.id }, data: { nif: `NIF${run}9`, stat: `STAT${run}9` } });
      assert.equal((await admin.reviewVenue(adminUser.id, venue.id, { decision: 'APPROVE' })).status, 'APPROVED');
    });

    it('Refusé : motif obligatoire, ni carte ni réservation, correction puis nouvelle soumission', async () => {
      const m = await makeUser();
      const venue = await venues.create(m.id, { name: `À refuser ${run}`, type: 'COMPANY', contactEmail: `r-${run}@example.mg` });
      await prisma.venueDocument.create({
        data: { venueId: venue.id, type: 'OWNERSHIP_PROOF', storagePath: `venues/${venue.id}/r-${run}.pdf`, mimeType: 'application/pdf', sizeBytes: 10 },
      });
      await venues.submit(m.id);
      assert.equal(await code(admin.reviewVenue(adminUser.id, venue.id, { decision: 'REJECT' })), 'REVIEW_NOTE_REQUIRED');
      const rejected = await admin.reviewVenue(adminUser.id, venue.id, { decision: 'REJECT', note: 'Aucune salle adaptée à l’apprentissage' });
      assert.equal(rejected.status, 'REJECTED');
      assert.equal(rejected.reviewNote, 'Aucune salle adaptée à l’apprentissage');
      assert.equal(await code(partnerRooms.create(m.id, { name: 'Salle X' })), 'VENUE_REJECTED');
      assert.equal(await prisma.room.count({ where: { venueId: venue.id, ...bookableRoomWhere() } }), 0);

      // Le Gestionnaire voit le motif, corrige et resoumet.
      assert.equal((await venues.get(m.id)).reviewNote, 'Aucune salle adaptée à l’apprentissage');
      await venues.update(m.id, { description: 'Salle de formation dédiée, 12 places' });
      assert.equal((await venues.submit(m.id)).status, 'SUBMITTED');
      const history = await prisma.partnerStatusEvent.findMany({ where: { venueId: venue.id }, orderBy: { createdAt: 'asc' } });
      assert.ok(history.some((h) => h.toStatus === 'REJECTED' && h.note?.includes('apprentissage')), 'le motif est conservé dans l’historique');
    });

    it('Désactivé : retirée de la carte, motif obligatoire, réintégration possible', async () => {
      assert.equal(await prisma.room.count({ where: { id: roomId, ...bookableRoomWhere() } }), 1);
      assert.equal(await code(admin.reviewVenue(adminUser.id, venueId, { decision: 'DISABLE' })), 'REVIEW_NOTE_REQUIRED');
      assert.equal((await admin.reviewVenue(adminUser.id, venueId, { decision: 'DISABLE', note: 'Fermeture du lieu' })).status, 'DISABLED');
      assert.equal(await prisma.room.count({ where: { id: roomId, ...bookableRoomWhere() } }), 0, 'plus réservable');
      assert.equal(await code(partnerRooms.create(manager.id, { name: 'Autre salle' })), 'VENUE_DISABLED');
      assert.equal((await admin.reviewVenue(adminUser.id, venueId, { decision: 'REINSTATE' })).status, 'APPROVED');
      assert.equal(await prisma.room.count({ where: { id: roomId, ...bookableRoomWhere() } }), 1);
    });

    it('le NIF, le STAT et les justificatifs ne sortent jamais d’une API publique', async () => {
      const fiche = JSON.stringify(await publicRooms.detail(roomId));
      const listing = JSON.stringify(await publicRooms.list({ radiusM: 100_000, limit: 50 }));
      for (const key of ['nif', 'stat', 'storagePath', 'registrationNumber', 'legalName']) {
        assert.ok(!fiche.includes(`"${key}"`), `fiche: ${key}`);
        assert.ok(!listing.includes(`"${key}"`), `liste: ${key}`);
      }
      for (const value of [`NIF${run}`, `STAT${run}`]) {
        assert.ok(!fiche.includes(value) && !listing.includes(value), `valeur ${value}`);
      }
    });

    it('le tarif horaire d’une salle est plafonné au plus haut forfait de déplacement', async () => {
      assert.equal(await code(partnerRooms.create(manager.id, { name: 'Trop chère', pricePerHour: 20_000 })), 'ROOM_PRICE_TOO_HIGH');
      assert.equal(await code(partnerRooms.create(manager.id, { name: 'Au plafond', pricePerHour: 10_000 })), 'OK');
    });
  });
});
