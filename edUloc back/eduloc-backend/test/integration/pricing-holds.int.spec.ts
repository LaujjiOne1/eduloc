/**
 * Tests d'intégration du prix détaillé (déplacement, salle, frais de service) et du blocage temporaire du créneau.
 * Base PostgreSQL RÉELLE, migrations appliquées. À lancer avec :
 *
 *   TEST_DATABASE_URL=postgresql://eduloc:<mot de passe>@localhost:5433/eduloc_scratch npm run test:int
 *
 * Ne jamais pointer vers la base de développement ni Supabase. Chaque exécution crée ses données (suffixe unique).
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
import { CryptoService } from '../../src/core/crypto/crypto.service';
import { OutboxWriter } from '../../src/infrastructure/outbox/outbox-writer';
import { BookingHoldsService } from '../../src/modules/bookings/booking-holds.service';
import { BookingsRepository } from '../../src/modules/bookings/bookings.repository';
import { BookingsService } from '../../src/modules/bookings/bookings.service';
import { RoomReservationService } from '../../src/modules/bookings/room-reservation.service';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL absent : tests d’intégration ignorés';

const run = randomUUID().slice(0, 8);
const pool = new pg.Pool({ connectionString: url, max: 6 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const db = prisma as unknown as PrismaService;

const cfg = {
  bookingMinNoticeHours: 24, cancellationFreeNoticeHours: 24, bookingSlotStepMinutes: 30, bookingBufferMinutes: 15,
  bookingTravelBufferMinutes: 30, roomTurnoverBufferMinutes: 0, otpEncryptionKey: randomBytes(32),
  platformCommissionRate: 0.1, bookingHoldMinutes: 15, roomMaxHourlyFee: 10_000,
} as unknown as AppConfig;
const holds = new BookingHoldsService(db, cfg);
const bookings = new BookingsService(
  db, new BookingsRepository(db), new CryptoService(cfg), new OutboxWriter(), { consume: async () => undefined } as never,
  cfg, new RoomReservationService(cfg), holds,
);

/** Centre de la zone de déplacement du Tuteur (Antananarivo) et rayon maximal. */
const REF = { lat: -18.9, lng: 47.5 };
const ZONE_RADIUS_M = 15_000;
/** ≈ 1 km de latitude = 0,009° ; on place les adresses de test à distance connue au nord de la référence. */
const north = (km: number) => ({ beneficiaryLatitude: REF.lat + km * 0.009, beneficiaryLongitude: REF.lng });

const createdUsers: string[] = [];
const createdSubjects: string[] = [];
const createdPlans: string[] = [];

const code = (promise: Promise<unknown>) =>
  promise.then(() => 'OK', (e: { code?: string; message?: string }) => e.code ?? e.message ?? 'ERR');

function localDay(offset: number) {
  const d = new Date(Date.now() + 3 * 3_600_000 + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
}
const startAtOf = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+03:00`);
const money = (m: { amount: string }) => Number(m.amount);

describe('prix détaillé et blocage temporaire du créneau (base réelle)', { skip }, () => {
  let tutor: { userId: string; profileId: string; offerId: string };
  let tutor2: { userId: string; profileId: string; offerId: string };
  let req1: { id: string; beneficiaryId: string };
  let req2: { id: string; beneficiaryId: string };
  let roomId: string;
  const DAY = localDay(4);

  async function makeUser() {
    const user = await prisma.user.create({
      data: { firstName: 'Test', lastName: `Price-${run}`, email: `price-${run}-${randomUUID().slice(0, 6)}@example.mg`, password: 'x', status: 'ACTIVE', emailVerified: true },
    });
    createdUsers.push(user.id);
    return user;
  }

  async function makeTutor(withZone: boolean) {
    const user = await makeUser();
    const profile = await prisma.tutorProfile.create({ data: { userId: user.id, displayName: `Tuteur ${run}`, isVisible: true } });
    const subject = await prisma.subject.create({ data: { name: `Matière ${run}-${randomUUID().slice(0, 4)}` } });
    createdSubjects.push(subject.id);
    const offer = await prisma.offer.create({
      data: {
        tutorProfileId: profile.id, subjectId: subject.id, title: 'Cours', description: 'Cours test', format: 'BOTH',
        durationMinutes: 60, price: 25_000,
      },
    });
    await prisma.availability.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ tutorProfileId: profile.id, dayOfWeek, startTime: '06:00', endTime: '20:00' })),
    });
    if (withZone) {
      await prisma.place.create({
        data: { tutorProfileId: profile.id, label: 'Zone de déplacement', type: 'BENEFICIARY_HOME', latitude: REF.lat, longitude: REF.lng, radius: ZONE_RADIUS_M },
      });
    }
    return { userId: user.id, profileId: profile.id, offerId: offer.id };
  }

  async function makeRequester() {
    const user = await makeUser();
    const beneficiary = await prisma.beneficiary.create({
      data: { requesterId: user.id, firstName: 'Élève', relationship: 'SELF', birthDate: new Date('1990-01-01') },
    });
    return { id: user.id, beneficiaryId: beneficiary.id };
  }

  const dtoFor = (r: typeof req1, t: typeof tutor, hhmm: string, over: Record<string, unknown> = {}) => ({
    offerId: t.offerId, beneficiaryId: r.beneficiaryId, startAt: startAtOf(DAY, hhmm).toISOString(), teachingMode: 'ONLINE', ...over,
  }) as never;

  before(async () => {
    [tutor, tutor2] = [await makeTutor(true), await makeTutor(false)];
    [req1, req2] = [await makeRequester(), await makeRequester()];

    // Salle publiée, ouverte tous les jours, acceptée par les deux Tuteurs (insérée directement : l'admin n'est pas l'objet du test).
    const manager = await makeUser();
    const plan = await prisma.partnerPlan.create({ data: { code: `PLAN_${run}`.toUpperCase(), name: 'Test', priceAmount: 0, durationDays: 365 } });
    createdPlans.push(plan.id);
    const venue = await prisma.partnerVenue.create({ data: { managerId: manager.id, name: `Lieu ${run}`, status: 'APPROVED' } });
    await prisma.venueSubscription.create({
      data: { venueId: venue.id, planId: plan.id, status: 'ACTIVE', startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 365 * 86_400_000) },
    });
    const room = await prisma.room.create({
      data: {
        venueId: venue.id, name: `Salle ${run}`, zoneLabel: 'Analakely', capacity: 4, latitude: REF.lat + 0.09, longitude: REF.lng, equipment: ['Tableau'], pricePerHour: 5_000,
        welcomesMinors: true, status: 'APPROVED', publication: 'PUBLISHED',
      },
    });
    roomId = room.id;
    await prisma.roomAvailability.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ roomId, dayOfWeek, startTime: '06:00', endTime: '20:00' })),
    });
    await prisma.tutorRoom.createMany({ data: [tutor, tutor2].map((t) => ({ tutorProfileId: t.profileId, roomId })) });
  });

  after(async () => {
    const bookingIds = (await prisma.booking.findMany({ where: { requesterId: { in: createdUsers } }, select: { id: true } })).map((b) => b.id);
    await prisma.bookingHold.deleteMany({ where: { requesterId: { in: createdUsers } } });
    await prisma.conversation.deleteMany({ where: { requesterId: { in: createdUsers } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: bookingIds } } });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.room.deleteMany({ where: { venue: { managerId: { in: createdUsers } } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await prisma.partnerPlan.deleteMany({ where: { id: { in: createdPlans } } });
    await prisma.subject.deleteMany({ where: { id: { in: createdSubjects } } });
    await prisma.$disconnect();
    await pool.end();
  });

  describe('prix', () => {
    it('cours en ligne : 25 000 Ar + 10 % de frais de service = 27 500 Ar, figés sur la réservation', async () => {
      const quote = await bookings.quote(req1.id, dtoFor(req1, tutor, '08:00'));
      assert.equal(money(quote.pricing.tutorFee), 25_000);
      assert.equal(money(quote.pricing.serviceFee), 2_500);
      assert.equal(money(quote.pricing.travelFee), 0);
      assert.equal(money(quote.pricing.total), 27_500);

      const booking = await bookings.createBooking(req1.id, dtoFor(req1, tutor, '08:00', { holdId: quote.holdId }));
      assert.equal(money(booking.pricing.total), 27_500);
      assert.equal(money(booking.pricing.serviceFee), 2_500);
      const row = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      assert.equal(Number(row.totalAmount), 27_500);
      assert.equal(Number(row.serviceFeeRate), 0.1);
      const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: quote.holdId } });
      assert.equal(hold.status, 'CONSUMED');
      assert.equal(hold.bookingId, booking.id);
    });

    it('cours chez l’élève : forfait selon la distance au point de référence du Tuteur', async () => {
      const at = (hhmm: string, km: number) => dtoFor(req2, tutor, hhmm, { teachingMode: 'AT_HOME_BENEFICIARY', beneficiaryAddress: 'Quartier test', ...north(km) });
      const near = await bookings.quote(req2.id, at('10:00', 2));
      assert.equal(money(near.pricing.travelFee), 0);
      const mid = await bookings.quote(req2.id, at('12:00', 5));
      assert.equal(money(mid.pricing.travelFee), 5_000);
      assert.equal(money(mid.pricing.total), 25_000 + 5_000 + 2_500);
      assert.ok(mid.travel && mid.travel.distanceM % 500 === 0 && mid.travel.distanceM >= 5_000, 'distance publiée arrondie au 500 m supérieur');
      const far = await bookings.quote(req2.id, at('14:00', 9));
      assert.equal(money(far.pricing.travelFee), 8_000);
      const edge = await bookings.quote(req2.id, at('16:00', 14));
      assert.equal(money(edge.pricing.travelFee), 10_000);
    });

    it('adresse sans coordonnées ou hors de la zone du Tuteur : refusée', async () => {
      const base = { teachingMode: 'AT_HOME_BENEFICIARY', beneficiaryAddress: 'Quartier test' };
      assert.equal(await code(bookings.quote(req2.id, dtoFor(req2, tutor, '10:00', base))), 'BENEFICIARY_COORDINATES_REQUIRED');
      assert.equal(await code(bookings.quote(req2.id, dtoFor(req2, tutor, '10:00', { ...base, ...north(30) }))), 'OUT_OF_TRAVEL_ZONE');
      // Un Tuteur sans position de référence garde le comportement historique : ni frais ni contrôle.
      const free = await bookings.quote(req2.id, dtoFor(req2, tutor2, '10:00', base));
      assert.equal(money(free.pricing.travelFee), 0);
    });

    it('salle partenaire : frais de salle ajoutés, la commission ne porte que sur le tarif du Tuteur', async () => {
      const quote = await bookings.quote(req2.id, dtoFor(req2, tutor, '18:00', { teachingMode: 'PARTNER_ROOM', roomId }));
      assert.equal(money(quote.pricing.roomFee), 5_000);
      assert.equal(money(quote.pricing.serviceFee), 2_500);
      assert.equal(money(quote.pricing.total), 25_000 + 5_000 + 2_500);
    });
  });

  describe('zone d’intervention en salle partenaire', () => {
    it('une salle hors du rayon du Tuteur n’est pas proposable ; elle l’est dans un rayon plus large', async () => {
      // La salle est à ≈ 10 km de la position de référence du Tuteur (son domicile).
      await prisma.place.create({ data: { tutorProfileId: tutor2.profileId, label: 'Domicile', type: 'TUTOR_HOME', latitude: REF.lat, longitude: REF.lng } });
      const dto = dtoFor(req2, tutor2, '14:00', { teachingMode: 'PARTNER_ROOM', roomId });
      await prisma.tutorProfile.update({ where: { id: tutor2.profileId }, data: { partnerRoomRadiusM: 2_000 } });
      assert.equal(await code(bookings.quote(req2.id, dto)), 'ROOM_OUT_OF_TUTOR_ZONE');
      await prisma.tutorProfile.update({ where: { id: tutor2.profileId }, data: { partnerRoomRadiusM: 15_000 } });
      assert.equal(await code(bookings.quote(req2.id, dto)), 'OK');
      await prisma.tutorProfile.update({ where: { id: tutor2.profileId }, data: { partnerRoomRadiusM: null } });
      assert.equal(await code(bookings.quote(req2.id, dto)), 'OK', 'sans rayon défini : aucun contrôle');
    });
  });

  describe('blocage temporaire', () => {
    it('un devis bloque le Tuteur pour les AUTRES demandeurs, pas pour son titulaire', async () => {
      const first = await bookings.quote(req1.id, dtoFor(req1, tutor, '09:30'));
      assert.equal(await code(bookings.quote(req2.id, dtoFor(req2, tutor, '09:30'))), 'SLOT_HELD');
      assert.equal(await code(bookings.quote(req2.id, dtoFor(req2, tutor, '09:45'))), 'SLOT_HELD', 'chevauchement partiel');
      assert.equal(await code(bookings.quote(req1.id, dtoFor(req1, tutor, '09:30'))), 'OK', 'le titulaire peut refaire son devis');
      const stale = await prisma.bookingHold.findUniqueOrThrow({ where: { id: first.holdId } });
      assert.equal(stale.status, 'RELEASED', 'le nouveau devis remplace le précédent du même demandeur chez ce Tuteur');
    });

    it('la salle est bloquée aussi, même pour un autre Tuteur', async () => {
      const dto = (r: typeof req1, t: typeof tutor) => dtoFor(r, t, '19:00', { teachingMode: 'PARTNER_ROOM', roomId });
      await bookings.quote(req1.id, dto(req1, tutor));
      assert.equal(await code(bookings.quote(req2.id, dto(req2, tutor2))), 'ROOM_HELD');
    });

    it('un blocage expiré libère le créneau, même avant le passage de la tâche de nettoyage', async () => {
      const held = await bookings.quote(req1.id, dtoFor(req1, tutor, '11:00'));
      assert.equal(await code(bookings.quote(req2.id, dtoFor(req2, tutor, '11:00'))), 'SLOT_HELD');
      await prisma.bookingHold.update({ where: { id: held.holdId }, data: { expiresAt: new Date(Date.now() - 1_000) } });
      assert.equal(await code(bookings.quote(req2.id, dtoFor(req2, tutor, '11:00'))), 'OK');
      assert.equal(await holds.expireDue(new Date()), 1, 'la tâche marque EXPIRED le blocage échu');
      assert.equal((await prisma.bookingHold.findUniqueOrThrow({ where: { id: held.holdId } })).status, 'EXPIRED');
    });

    it('finaliser avec un blocage expiré est refusé', async () => {
      const held = await bookings.quote(req1.id, dtoFor(req1, tutor, '13:00'));
      await prisma.bookingHold.update({ where: { id: held.holdId }, data: { expiresAt: new Date(Date.now() - 1_000) } });
      assert.equal(await code(bookings.createBooking(req1.id, dtoFor(req1, tutor, '13:00', { holdId: held.holdId }))), 'HOLD_EXPIRED');
    });

    it('un blocage ne sert qu’à sa demande exacte et à son titulaire', async () => {
      const held = await bookings.quote(req1.id, dtoFor(req1, tutor, '15:00'));
      assert.equal(await code(bookings.createBooking(req1.id, dtoFor(req1, tutor, '17:00', { holdId: held.holdId }))), 'HOLD_MISMATCH');
      // Le créneau est bloqué pour req2 ; et même sur un autre créneau libre, le blocage d'autrui reste introuvable pour lui.
      assert.equal(await code(bookings.createBooking(req2.id, dtoFor(req2, tutor, '15:00', { holdId: held.holdId }))), 'SLOT_HELD');
      assert.equal(await code(bookings.createBooking(req2.id, dtoFor(req2, tutor2, '15:00', { holdId: held.holdId }))), 'HOLD_NOT_FOUND');
    });

    it('ressource prise entre le devis et la finalisation : demande refusée et blocage libéré', async () => {
      const held = await bookings.quote(req1.id, dtoFor(req1, tutor, '16:30'));
      const start = startAtOf(DAY, '16:30');
      // Un autre acteur obtient le créneau (séance confirmée) pendant que le demandeur hésite.
      await prisma.booking.create({
        data: {
          requesterId: req2.id, beneficiaryId: req2.beneficiaryId, tutorProfileId: tutor.profileId, offerId: tutor.offerId,
          startAt: start, endAt: new Date(start.getTime() + 3_600_000), status: 'CONFIRMED', teachingMode: 'ONLINE',
          price: 25_000, offerTitle: 'Cours',
        },
      });
      assert.equal(await code(bookings.createBooking(req1.id, dtoFor(req1, tutor, '16:30', { holdId: held.holdId }))), 'SLOT_UNAVAILABLE');
      assert.equal((await prisma.bookingHold.findUniqueOrThrow({ where: { id: held.holdId } })).status, 'RELEASED');
    });

    it('prix modifié entre le devis et la finalisation : le total annoncé fait foi', async () => {
      const held = await bookings.quote(req2.id, dtoFor(req2, tutor2, '07:00'));
      await prisma.offer.update({ where: { id: tutor2.offerId }, data: { price: 30_000 } });
      assert.equal(await code(bookings.createBooking(req2.id, dtoFor(req2, tutor2, '07:00', { holdId: held.holdId }))), 'PRICE_CHANGED');
      assert.equal((await prisma.bookingHold.findUniqueOrThrow({ where: { id: held.holdId } })).status, 'RELEASED');
    });

    it('sans blocage, la création reste possible (compatibilité) mais respecte les blocages des autres', async () => {
      await bookings.quote(req1.id, dtoFor(req1, tutor2, '12:30'));
      assert.equal(await code(bookings.createBooking(req2.id, dtoFor(req2, tutor2, '12:30'))), 'SLOT_HELD');
      assert.equal(await code(bookings.createBooking(req2.id, dtoFor(req2, tutor2, '05:00'))), 'SLOT_OUTSIDE_AVAILABILITY');
    });
  });
});
