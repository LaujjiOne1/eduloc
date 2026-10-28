/**
 * Tests d'intégration des lieux partenaires : base PostgreSQL RÉELLE, migrations appliquées (contrainte d'exclusion
 * de salle, CHECK, colonne PostGIS). Parcours complet Gestionnaire → administrateur → Tuteur → Demandeur, conflits
 * à l'acceptation, concurrence et confidentialité de l'adresse. À lancer avec :
 *
 *   TEST_DATABASE_URL=postgresql://eduloc:eduloc@localhost:5433/eduloc_scratch npm run test:int
 *
 * Ne jamais pointer vers la base Supabase. Chaque exécution crée ses données (suffixe unique) et les supprime.
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
import { PartnerAdminService } from '../../src/modules/partners/partner-admin.service';
import { PartnerRoomsService } from '../../src/modules/partners/partner-rooms.service';
import { PartnerSubscriptionService } from '../../src/modules/partners/partner-subscription.service';
import type { PartnerUploadsService } from '../../src/modules/partners/partner-support';
import { PartnerVenueService } from '../../src/modules/partners/partner-venue.service';
import { BookingOptionsService } from '../../src/modules/rooms/booking-options.service';
import { RoomsService } from '../../src/modules/rooms/rooms.service';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL absent : tests d’intégration ignorés';

const run = randomUUID().slice(0, 8);
const pool = new pg.Pool({ connectionString: url, max: 8 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const db = prisma as unknown as PrismaService;

const cfg = {
  bookingMinNoticeHours: 12, cancellationFreeNoticeHours: 24, bookingSlotStepMinutes: 30, bookingBufferMinutes: 0,
  bookingTravelBufferMinutes: 30, roomTurnoverBufferMinutes: 0, otpEncryptionKey: randomBytes(32),
  partnerDocsBucket: 'partner-documents', roomPhotosBucket: 'room-photos',
  platformCommissionRate: 0.1, bookingHoldMinutes: 15, roomMaxHourlyFee: 10_000,
} as unknown as AppConfig;
const uploads = {
  readUrl: async (_b: string, path: string) => `https://signed.test/${path}`,
  remove: async () => undefined,
} as unknown as PartnerUploadsService;
const outbox = new OutboxWriter();
const roomReservations = new RoomReservationService(cfg);
const bookings = new BookingsService(
  db, new BookingsRepository(db), new CryptoService(cfg), outbox, { consume: async () => undefined } as never, cfg, roomReservations, new BookingHoldsService(db, cfg),
);
const venues = new PartnerVenueService(db, cfg, outbox, uploads);
const partnerRooms = new PartnerRoomsService(db, cfg, outbox, uploads);
const subscriptions = new PartnerSubscriptionService(db, outbox);
const admin = new PartnerAdminService(db, cfg, outbox, uploads);
const publicRooms = new RoomsService(db, cfg, uploads);
const options = new BookingOptionsService(db, cfg, publicRooms);

const SECRETS = {
  address: `${run} Rue du Secret`,
  city: `Ville${run}`,
  access: `Code portail ${run}`,
  lat: -18.912345,
  lng: 47.523456,
};

const createdUsers: string[] = [];
const createdPlans: string[] = [];
const createdSubjects: string[] = [];

async function makeUser(isAdmin = false) {
  const user = await prisma.user.create({
    data: {
      firstName: 'Test', lastName: `Rooms-${run}`, email: `rooms-${run}-${randomUUID().slice(0, 6)}@example.mg`,
      password: 'x', status: 'ACTIVE', emailVerified: true, isAdmin,
    },
  });
  createdUsers.push(user.id);
  return user;
}

/** Jour LOCAL (Madagascar, UTC+3) à `offset` jours d'aujourd'hui, avec son jour de semaine. */
function localDay(offset: number) {
  const d = new Date(Date.now() + 3 * 3_600_000 + offset * 86_400_000);
  const date = d.toISOString().slice(0, 10);
  return { date, dow: d.getUTCDay() };
}
const startAtOf = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+03:00`);

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const code = (promise: Promise<unknown>) =>
  promise.then(() => 'OK', (e: { code?: string; message?: string }) => e.code ?? e.message ?? 'ERR');

describe('lieux partenaires (base réelle)', { skip }, () => {
  let adminUser: { id: string };
  let manager: { id: string };
  let venueId: string;
  let planId: string;
  let roomA: string;
  let roomB: string;
  let tutor1: { userId: string; profileId: string; offerId: string };
  let tutor2: { userId: string; profileId: string; offerId: string };
  let requester1: { id: string; beneficiaryId: string };
  let requester2: { id: string; beneficiaryId: string };

  async function makeTutor(): Promise<typeof tutor1> {
    const user = await makeUser();
    const profile = await prisma.tutorProfile.create({ data: { userId: user.id, displayName: `Tuteur ${run}`, isVisible: true } });
    const subjectName = `Matière ${run}-${randomUUID().slice(0, 4)}`;
    const subject = await prisma.subject.create({ data: { name: subjectName } });
    createdSubjects.push(subject.id);
    const offer = await prisma.offer.create({
      data: {
        tutorProfileId: profile.id, subjectId: subject.id, title: 'Cours', description: 'Cours test', format: 'BOTH',
        durationMinutes: 60, durationOptions: [120], price: 10000,
      },
    });
    // Plage sans lieu précis, tous les jours : tous les modes (dont la salle partenaire) sont autorisés.
    await prisma.availability.createMany({
      data: ALL_DAYS.map((dayOfWeek) => ({ tutorProfileId: profile.id, dayOfWeek, startTime: '08:00', endTime: '18:00' })),
    });
    return { userId: user.id, profileId: profile.id, offerId: offer.id };
  }

  async function makeRequester() {
    const user = await makeUser();
    const beneficiary = await prisma.beneficiary.create({
      data: { requesterId: user.id, firstName: 'Élève', relationship: 'SELF', birthDate: new Date('1990-01-01') },
    });
    return { id: user.id, beneficiaryId: beneficiary.id };
  }

  /** Salle de bout en bout : brouillon → soumission → validation → publication. */
  async function makePublishedRoom(name: string, over: Record<string, unknown> = {}) {
    const room = await partnerRooms.create(manager.id, {
      name, description: 'Calme et lumineuse', addressLine: `${SECRETS.address} (${name})`, city: SECRETS.city,
      latitude: SECRETS.lat, longitude: SECRETS.lng, accessInstructions: `${SECRETS.access} ${name}`,
      zoneLabel: 'Analakely', capacity: 4, equipment: ['Tableau', 'Wi-Fi'], pricePerHour: 5000, rules: 'Pas de nourriture',
      ...over,
    });
    await partnerRooms.replaceAvailabilities(manager.id, room.id, {
      availabilities: ALL_DAYS.map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '17:00' })),
    });
    await partnerRooms.submit(manager.id, room.id);
    await admin.reviewRoom(adminUser.id, room.id, { decision: 'APPROVE' });
    await partnerRooms.publish(manager.id, room.id);
    return room.id;
  }

  const book = (
    requester: typeof requester1, tutor: typeof tutor1, room: string, date: string, hhmm: string,
    over: Record<string, unknown> = {},
  ) => bookings.createBooking(requester.id, {
    offerId: tutor.offerId, beneficiaryId: requester.beneficiaryId, startAt: startAtOf(date, hhmm).toISOString(),
    teachingMode: 'PARTNER_ROOM', roomId: room, ...over,
  } as never);

  before(async () => {
    adminUser = await makeUser(true);
    manager = await makeUser();
    const plan = await prisma.partnerPlan.create({
      data: { code: `PILOT_${run}`.toUpperCase(), name: 'Pilote test', priceAmount: 0, durationDays: 365 },
    });
    planId = plan.id;
    createdPlans.push(plan.id);
    [tutor1, tutor2] = [await makeTutor(), await makeTutor()];
    [requester1, requester2] = [await makeRequester(), await makeRequester()];
  });

  after(async () => {
    const roomIds = (await prisma.room.findMany({ where: { venue: { managerId: manager.id } }, select: { id: true } })).map((r) => r.id);
    const bookingIds = (await prisma.booking.findMany({
      where: { OR: [{ requesterId: { in: createdUsers } }, { roomId: { in: roomIds } }] }, select: { id: true },
    })).map((b) => b.id);
    await prisma.conflict.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.conversation.deleteMany({ where: { requesterId: { in: createdUsers } } });
    await prisma.outboxEvent.deleteMany({ where: { OR: [{ aggregateId: { in: bookingIds } }, { aggregateId: { in: roomIds } }, { aggregateId: venueId ?? '' }] } });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await prisma.partnerPlan.deleteMany({ where: { id: { in: createdPlans } } });
    await prisma.subject.deleteMany({ where: { id: { in: createdSubjects } } });
    await prisma.$disconnect();
    await pool.end();
  });

  // ------------------------------------------------------------------ migration

  describe('migration', () => {
    it('la colonne PostGIS des salles est générée et indexée', async () => {
      const cols = await prisma.$queryRaw<{ is_generated: string }[]>`
        SELECT is_generated FROM information_schema.columns WHERE table_name = 'rooms' AND column_name = 'location'`;
      assert.equal(cols[0].is_generated, 'ALWAYS');
      const idx = await prisma.$queryRaw<{ indexname: string }[]>`SELECT indexname FROM pg_indexes WHERE indexname = 'rooms_location_gist'`;
      assert.equal(idx.length, 1);
    });
  });

  // ------------------------------------------------------------------ parcours Gestionnaire / administrateur

  describe('structure, salles et publication', () => {
    it('le dossier de structure se soumet avec un justificatif, puis l’administrateur le valide', async () => {
      const created = await venues.create(manager.id, { name: `Bibliothèque ${run}`, type: 'LIBRARY', contactEmail: `contact-${run}@example.mg` });
      venueId = created.id;
      assert.equal(created.status, 'DRAFT');
      assert.equal(created.subscription.status, 'NOT_SELECTED');
      assert.equal(await code(venues.submit(manager.id)), 'VENUE_DOCUMENT_REQUIRED');

      await prisma.venueDocument.create({
        data: { venueId, type: 'OWNERSHIP_PROOF', storagePath: `venues/${venueId}/${run}.pdf`, mimeType: 'application/pdf', sizeBytes: 100 },
      });
      assert.equal((await venues.submit(manager.id)).status, 'SUBMITTED');
      // Sans NIF ni STAT : soumission permise, mais pas de statut « Vérifié ».
      assert.equal(await code(admin.reviewVenue(adminUser.id, venueId, { decision: 'APPROVE' })), 'VENUE_NIF_STAT_REQUIRED');
      await prisma.partnerVenue.update({ where: { id: venueId }, data: { nif: `NIF${run}`, stat: `STAT${run}` } });
      assert.equal((await admin.reviewVenue(adminUser.id, venueId, { decision: 'APPROVE' })).status, 'APPROVED');
    });

    it('une salle incomplète ne peut pas être soumise ; la liste des champs manquants est renvoyée', async () => {
      const draft = await partnerRooms.create(manager.id, { name: `Brouillon ${run}` });
      await assert.rejects(partnerRooms.submit(manager.id, draft.id), (e: { code: string; fields: string[] }) => {
        assert.equal(e.code, 'ROOM_INCOMPLETE');
        assert.ok(e.fields.includes('addressLine') && e.fields.includes('availabilities'));
        return true;
      });
      await partnerRooms.remove(manager.id, draft.id);
    });

    it('chaque salle est soumise et validée INDÉPENDAMMENT : valider A ne valide pas B', async () => {
      const a = await partnerRooms.create(manager.id, {
        name: `Salle A ${run}`, addressLine: `${SECRETS.address} (A)`, city: SECRETS.city, latitude: SECRETS.lat, longitude: SECRETS.lng,
        accessInstructions: `${SECRETS.access} A`, zoneLabel: 'Analakely', capacity: 4, equipment: ['Tableau', 'Wi-Fi'], pricePerHour: 5000, rules: 'Silence',
      });
      const b = await partnerRooms.create(manager.id, {
        name: `Salle B ${run}`, addressLine: `${SECRETS.address} (B)`, city: SECRETS.city, latitude: SECRETS.lat + 0.01, longitude: SECRETS.lng,
        accessInstructions: `${SECRETS.access} B`, zoneLabel: 'Isoraka', capacity: 2, equipment: ['Tableau'], pricePerHour: 3000, rules: 'Silence',
      });
      roomA = a.id;
      roomB = b.id;
      for (const id of [roomA, roomB]) {
        await partnerRooms.replaceAvailabilities(manager.id, id, {
          availabilities: ALL_DAYS.map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '17:00' })),
        });
      }
      await partnerRooms.submit(manager.id, roomA);
      await admin.reviewRoom(adminUser.id, roomA, { decision: 'APPROVE' });
      assert.equal((await partnerRooms.get(manager.id, roomA)).status, 'APPROVED');
      assert.equal((await partnerRooms.get(manager.id, roomB)).status, 'DRAFT');
    });

    it('la salle validée n’est pas publiable sans offre commerciale active ; la souscription vient après la validation', async () => {
      assert.equal(await code(partnerRooms.publish(manager.id, roomA)), 'SUBSCRIPTION_REQUIRED');
      const status = await subscriptions.select(manager.id, planId);
      assert.equal(status.status, 'ACTIVE');
      assert.equal(await code(subscriptions.select(manager.id, planId)), 'SUBSCRIPTION_ALREADY_OPEN');
      assert.equal((await partnerRooms.publish(manager.id, roomA)).publication, 'PUBLISHED');
    });

    it('les champs d’identité d’une salle validée sont verrouillés, le reste reste modifiable', async () => {
      assert.equal(await code(partnerRooms.update(manager.id, roomA, { addressLine: 'Autre rue' })), 'ROOM_FIELDS_LOCKED');
      assert.equal((await partnerRooms.update(manager.id, roomA, { description: 'Nouvelle description' })).description, 'Nouvelle description');
    });

    it('un autre Gestionnaire ne voit pas ces salles (introuvable, pas interdit)', async () => {
      const intruder = await makeUser();
      await venues.create(intruder.id, { name: `Autre ${run}` });
      assert.equal(await code(partnerRooms.get(intruder.id, roomA)), 'ROOM_NOT_FOUND');
    });

    it('l’historique trace chaque changement de statut', async () => {
      const history = (await venues.get(manager.id)).history;
      const trail = history.filter((e) => e.roomId === roomA).map((e) => `${e.scope}:${e.to}`);
      for (const step of ['ROOM:DRAFT', 'ROOM:SUBMITTED', 'ROOM:APPROVED', 'PUBLICATION:PUBLISHED']) assert.ok(trail.includes(step), step);
    });
  });

  // ------------------------------------------------------------------ confidentialité publique

  describe('fiche publique et options de réservation : jamais d’adresse exacte', () => {
    const forbidden = () => [SECRETS.address, SECRETS.city, SECRETS.access, String(SECRETS.lat), String(SECRETS.lng), 'addressLine', 'accessInstructions'];
    const assertClean = (value: unknown) => {
      const json = JSON.stringify(value);
      for (const s of forbidden()) assert.ok(!json.includes(s), `fuite de « ${s} »`);
    };

    it('liste, détail, salles acceptées et options ne contiennent aucun secret', async () => {
      await publicRooms.accept(tutor1.userId, roomA);
      const list = await publicRooms.list({ lat: SECRETS.lat, lng: SECRETS.lng, radiusM: 5000, limit: 20 });
      assert.ok(list.some((r) => r.id === roomA), 'la salle publiée apparaît');
      assert.equal(list.find((r) => r.id === roomA)!.zoneLabel, 'Analakely');
      assert.ok((list.find((r) => r.id === roomA)!.distanceMeters ?? 0) >= 500, 'distance arrondie');
      assertClean(list);
      assertClean(await publicRooms.detail(roomA, { lat: SECRETS.lat, lng: SECRETS.lng }));
      assertClean(await publicRooms.listAccepted(tutor1.userId));
      assertClean(await options.options(tutor1.offerId, { lat: SECRETS.lat, lng: SECRETS.lng }));
    });

    it('une salle non publiée ou non validée n’est ni listée ni consultable', async () => {
      assert.ok(!(await publicRooms.list({ radiusM: 100_000, limit: 50 })).some((r) => r.id === roomB));
      assert.equal(await code(publicRooms.detail(roomB)), 'ROOM_NOT_BOOKABLE');
    });

    it('le Tuteur n’obtient que les salles qu’il accepte : tutor2 n’en a aucune', async () => {
      const o1 = await options.options(tutor1.offerId);
      assert.ok(o1.modes.includes('PARTNER_ROOM'));
      assert.deepEqual(o1.rooms.map((r) => r.id), [roomA]);
      assert.deepEqual(o1.durations.map((d) => d.minutes), [60, 120]);
      assert.equal(o1.durations[1].price.amount, '20000');
      const o2 = await options.options(tutor2.offerId);
      assert.ok(!o2.modes.includes('PARTNER_ROOM'));
      assert.deepEqual(o2.rooms, []);
    });

    it('déclarer une salle n’en bloque aucun horaire', async () => {
      const day = localDay(4);
      const slots = await options.slots(tutor1.offerId, { date: day.date, mode: 'PARTNER_ROOM', roomId: roomA });
      assert.ok(slots.slots.length > 0);
      const busy = await prisma.booking.count({ where: { roomId: roomA } });
      assert.equal(busy, 0);
    });
  });

  // ------------------------------------------------------------------ demande, acceptation, adresse

  describe('demande en attente, confirmation conjointe et adresse', () => {
    const day = localDay(5);
    let bookingId: string;

    it('le préavis de 12 h est appliqué par le backend', async () => {
      const soon = new Date(Date.now() + 5 * 3_600_000);
      assert.equal(await code(bookings.createBooking(requester1.id, {
        offerId: tutor1.offerId, beneficiaryId: requester1.beneficiaryId, startAt: soon.toISOString(), teachingMode: 'PARTNER_ROOM', roomId: roomA,
      } as never)), 'SLOT_TOO_SOON');
    });

    it('refuse une salle non acceptée par le Tuteur, une durée non proposée, un effectif ou un équipement incompatibles', async () => {
      assert.equal(await code(book(requester1, tutor2, roomA, day.date, '10:00')), 'ROOM_NOT_ACCEPTED_BY_TUTOR');
      assert.equal(await code(book(requester1, tutor1, roomA, day.date, '10:00', { durationMinutes: 90 })), 'DURATION_NOT_OFFERED');
      assert.equal(await code(book(requester1, tutor1, roomA, day.date, '10:00', { participantsCount: 9 })), 'ROOM_CAPACITY_EXCEEDED');
      assert.equal(await code(book(requester1, tutor1, roomA, day.date, '10:00', { requiredEquipment: ['Projecteur'] })), 'ROOM_EQUIPMENT_MISSING');
      assert.equal(await code(book(requester1, tutor1, roomB, day.date, '10:00')), 'ROOM_NOT_BOOKABLE');
      assert.equal(await code(book(requester1, tutor1, roomA, day.date, '08:00')), 'ROOM_CLOSED');
      assert.equal(await code(bookings.createBooking(requester1.id, {
        offerId: tutor1.offerId, beneficiaryId: requester1.beneficiaryId, startAt: startAtOf(day.date, '10:00').toISOString(),
        teachingMode: 'PARTNER_ROOM',
      } as never)), 'ROOM_REQUIRED');
    });

    it('la demande est PENDING, sans adresse exacte, et ne réserve ni la salle ni le créneau', async () => {
      const pending = await book(requester1, tutor1, roomA, day.date, '10:00', { durationMinutes: 120, participantsCount: 2 });
      bookingId = pending.id;
      assert.equal(pending.status, 'PENDING');
      assert.equal(pending.room?.zoneLabel, 'Analakely');
      assert.equal(pending.locationAddress, null);
      assert.equal(pending.latitude, null);
      assert.equal(pending.roomAccessInstructions, null);
      assert.equal(pending.price.amount, '20000');
      assert.equal(pending.roomFee?.amount, '10000');
      assert.equal((pending.endAt.getTime() - pending.startAt.getTime()) / 60_000, 120);
      // Même créneau, même salle : une deuxième demande est possible (aucun blocage temporaire).
      const second = await book(requester2, tutor1, roomA, day.date, '10:00');
      assert.equal(second.status, 'PENDING');
      await bookings.cancelBooking(requester2.id, second.id, {}, false);
      // La vue du Tuteur ne contient pas non plus l'adresse tant que la séance n'est pas confirmée.
      const tutorView = await bookings.getForUser(tutor1.userId, bookingId);
      assert.equal(tutorView.locationAddress, null);
      assert.equal(tutorView.roomAccessInstructions, null);
    });

    it('l’acceptation confirme séance ET salle ensemble, et révèle alors adresse et instructions aux deux parties', async () => {
      const accepted = await bookings.acceptBooking(tutor1.userId, bookingId);
      assert.equal(accepted.status, 'CONFIRMED');
      for (const viewer of [requester1.id, tutor1.userId]) {
        const view = await bookings.getForUser(viewer, bookingId);
        assert.equal(view.locationAddress, `${SECRETS.address} (A), ${SECRETS.city}`);
        assert.equal(view.latitude, SECRETS.lat);
        assert.equal(view.roomAccessInstructions, `${SECRETS.access} A`);
      }
      const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      assert.equal(row.roomId, roomA);
      assert.equal(row.status, 'CONFIRMED');
    });

    it('aucune notification, aucun événement ni message de conversation ne contient l’adresse exacte', async () => {
      const events = await prisma.outboxEvent.findMany({ where: { aggregateId: bookingId } });
      assert.ok(events.length >= 2);
      const messages = await prisma.message.findMany({ where: { conversation: { requesterId: requester1.id } } });
      const blob = JSON.stringify({ events, messages });
      for (const s of [SECRETS.address, SECRETS.city, SECRETS.access, String(SECRETS.lat)]) assert.ok(!blob.includes(s), `fuite de « ${s} »`);
    });

    it('les créneaux proposés excluent désormais la séance confirmée de la salle', async () => {
      const slots = await options.slots(tutor1.offerId, { date: day.date, mode: 'PARTNER_ROOM', roomId: roomA, durationMinutes: 60 });
      const starts = slots.slots.map((s) => s.startAt);
      assert.ok(!starts.includes(startAtOf(day.date, '10:00').toISOString()));
      assert.ok(!starts.includes(startAtOf(day.date, '11:30').toISOString()), 'créneau dans la séance de 2 h');
      assert.ok(starts.includes(startAtOf(day.date, '12:00').toISOString()));
      assert.ok(starts.includes(startAtOf(day.date, '09:00').toISOString()), 'juste avant la séance : adjacent mais libre');
    });

    it('un autre Tuteur ne peut pas prendre la salle sur un créneau déjà confirmé ; l’autre Demandeur ne peut plus voir l’adresse', async () => {
      await publicRooms.accept(tutor2.userId, roomA);
      assert.equal(await code(book(requester2, tutor2, roomA, day.date, '11:00')), 'ROOM_UNAVAILABLE');
      assert.equal(await code(bookings.getForUser(requester2.id, bookingId)), 'BOOKING_NOT_FOUND');
    });

    it('marge de déplacement : après une séance en salle A, le même Tuteur ne peut pas enchaîner en salle B', async () => {
      roomB = await makePublishedRoom(`Salle B2 ${run}`);
      await publicRooms.accept(tutor1.userId, roomB);
      // La séance de la salle A finit à 12:00 : 12:00 en salle B est trop proche (marge de 30 min), 12:30 passe.
      assert.equal(await code(book(requester2, tutor1, roomB, day.date, '12:00')), 'SLOT_TOO_CLOSE');
      const ok = await book(requester2, tutor1, roomB, day.date, '12:30');
      assert.equal(ok.status, 'PENDING');
      // Enchaîner dans la MÊME salle ne demande aucune marge de déplacement.
      const same = await book(requester2, tutor1, roomA, day.date, '12:00');
      assert.equal(same.status, 'PENDING');
      await bookings.cancelBooking(requester2.id, same.id, {}, false);
      await bookings.cancelBooking(requester2.id, ok.id, {}, false);
    });

    it('l’annulation libère le créneau, et l’adresse n’est plus renvoyée', async () => {
      const cancelled = await bookings.cancelBooking(requester1.id, bookingId, { reason: 'Empêchement' }, false);
      assert.equal(cancelled.status, 'CANCELLED');
      assert.equal(cancelled.locationAddress, null);
      assert.equal(cancelled.roomAccessInstructions, null);
      const again = await book(requester2, tutor1, roomA, day.date, '10:00');
      const reconfirmed = await bookings.acceptBooking(tutor1.userId, again.id);
      assert.equal(reconfirmed.status, 'CONFIRMED');
      await bookings.cancelBooking(requester2.id, again.id, { reason: 'Fin du test' }, false);
    });
  });

  // ------------------------------------------------------------------ conflits à l'acceptation

  describe('conflit à l’acceptation (spec 7.3)', () => {
    const day = localDay(6);

    it('le second Tuteur à accepter reçoit 409 ; sa demande reste PENDING, sans salle réservée, et le conflit est tracé', async () => {
      const first = await book(requester1, tutor1, roomA, day.date, '14:00');
      const second = await book(requester2, tutor2, roomA, day.date, '14:00');
      assert.equal((await bookings.acceptBooking(tutor1.userId, first.id)).status, 'CONFIRMED');

      assert.equal(await code(bookings.acceptBooking(tutor2.userId, second.id)), 'ROOM_NO_LONGER_AVAILABLE');
      const row = await prisma.booking.findUniqueOrThrow({ where: { id: second.id } });
      assert.equal(row.status, 'PENDING');
      assert.equal(row.locationAddress, null, 'rien n’est copié tant que la séance n’est pas confirmée');
      assert.equal(row.roomAccessInstructions, null);
      assert.equal(await prisma.booking.count({ where: { roomId: roomA, status: 'CONFIRMED', startAt: startAtOf(day.date, '14:00') } }), 1);

      const conflict = await prisma.conflict.findUniqueOrThrow({ where: { bookingId_type: { bookingId: second.id, type: 'ROOM_UNAVAILABLE' } } });
      assert.equal(conflict.status, 'OPEN');
      assert.equal((conflict.details as { reason: string }).reason, 'ROOM_UNAVAILABLE');

      const events = await prisma.outboxEvent.findMany({ where: { aggregateId: second.id, eventType: 'booking.conflict' } });
      assert.deepEqual(events.flatMap((e) => e.recipientIds).sort(), [requester2.id, tutor2.userId].sort(), 'Demandeur ET Tuteur informés');

      // Un nouvel essai ne notifie pas une seconde fois.
      assert.equal(await code(bookings.acceptBooking(tutor2.userId, second.id)), 'ROOM_NO_LONGER_AVAILABLE');
      assert.equal(await prisma.outboxEvent.count({ where: { aggregateId: second.id, eventType: 'booking.conflict' } }), 2);

      // La demande n'a pas été déplacée : le Demandeur choisit un autre créneau.
      const moved = await bookings.getForUser(requester2.id, second.id);
      assert.equal(moved.startAt.toISOString(), startAtOf(day.date, '14:00').toISOString());
      await bookings.cancelBooking(requester2.id, second.id, {}, false);
      await bookings.cancelBooking(requester1.id, first.id, { reason: 'Fin du test' }, false);
    });

    it('deux acceptations CONCURRENTES du même créneau : exactement une séance confirmée', async () => {
      const slotDay = localDay(7);
      for (let round = 0; round < 3; round += 1) {
        const hhmm = ['09:00', '11:00', '15:00'][round];
        const a = await book(requester1, tutor1, roomA, slotDay.date, hhmm);
        const b = await book(requester2, tutor2, roomA, slotDay.date, hhmm);
        const results = await Promise.allSettled([bookings.acceptBooking(tutor1.userId, a.id), bookings.acceptBooking(tutor2.userId, b.id)]);
        const ok = results.filter((r) => r.status === 'fulfilled');
        const ko = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        assert.equal(ok.length, 1, `ronde ${round} : une seule acceptation`);
        assert.equal(ko.length, 1);
        assert.equal((ko[0].reason as { code: string }).code, 'ROOM_NO_LONGER_AVAILABLE');
        assert.equal(await prisma.booking.count({ where: { roomId: roomA, status: 'CONFIRMED', startAt: startAtOf(slotDay.date, hhmm) } }), 1);
        assert.equal(await prisma.booking.count({ where: { id: { in: [a.id, b.id] }, status: 'PENDING' } }), 1);
      }
    });

    it('même sans verrou applicatif, la base refuse deux séances confirmées qui se chevauchent dans une salle', async () => {
      const day2 = localDay(8);
      const base = {
        requesterId: requester1.id, beneficiaryId: requester1.beneficiaryId, offerId: tutor1.offerId, roomId: roomA,
        teachingMode: 'PARTNER_ROOM' as const, price: 1, offerTitle: 'x', status: 'CONFIRMED' as const,
      };
      await prisma.booking.create({ data: { ...base, tutorProfileId: tutor1.profileId, startAt: startAtOf(day2.date, '10:00'), endAt: startAtOf(day2.date, '11:00') } });
      await assert.rejects(prisma.booking.create({
        data: { ...base, tutorProfileId: tutor2.profileId, startAt: startAtOf(day2.date, '10:30'), endAt: startAtOf(day2.date, '11:30') },
      }));
      // Adjacent : autorisé (intervalle semi-ouvert).
      await prisma.booking.create({
        data: { ...base, tutorProfileId: tutor2.profileId, startAt: startAtOf(day2.date, '11:00'), endAt: startAtOf(day2.date, '12:00') },
      });
      // Le mode salle et la salle vont ensemble.
      await assert.rejects(prisma.booking.create({
        data: { ...base, roomId: null, tutorProfileId: tutor2.profileId, startAt: startAtOf(day2.date, '15:00'), endAt: startAtOf(day2.date, '16:00') },
      }));
      await assert.rejects(prisma.booking.create({
        data: { ...base, teachingMode: 'ONLINE', tutorProfileId: tutor2.profileId, startAt: startAtOf(day2.date, '15:00'), endAt: startAtOf(day2.date, '16:00') },
      }));
    });
  });

  // ------------------------------------------------------------------ modifications après confirmation

  describe('une séance confirmée n’est jamais annulée en silence', () => {
    const day = localDay(9);
    let confirmedId: string;

    it('changer les horaires de la salle ne touche pas la séance confirmée, mais signale qu’elle sort des plages', async () => {
      const b = await book(requester1, tutor1, roomA, day.date, '10:00');
      confirmedId = (await bookings.acceptBooking(tutor1.userId, b.id)).id;
      const result = await partnerRooms.replaceAvailabilities(manager.id, roomA, {
        availabilities: ALL_DAYS.map((dayOfWeek) => ({ dayOfWeek, startTime: '13:00', endTime: '17:00' })),
      });
      assert.ok(result.uncoveredConfirmedBookings >= 1);
      assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: confirmedId } })).status, 'CONFIRMED');
      await partnerRooms.replaceAvailabilities(manager.id, roomA, {
        availabilities: ALL_DAYS.map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '17:00' })),
      });
    });

    it('fermer la salle sur une séance confirmée est refusé ; fermer ailleurs est accepté', async () => {
      const start = startAtOf(day.date, '09:30');
      const end = startAtOf(day.date, '10:30');
      assert.equal(await code(partnerRooms.addBlock(manager.id, roomA, { startAt: start.toISOString(), endAt: end.toISOString() })), 'BLOCK_OVERLAPS_CONFIRMED_BOOKING');
      const other = await partnerRooms.addBlock(manager.id, roomA, {
        startAt: startAtOf(day.date, '15:00').toISOString(), endAt: startAtOf(day.date, '16:00').toISOString(),
      });
      assert.ok(other.id);
      assert.ok(!(await options.slots(tutor1.offerId, { date: day.date, mode: 'PARTNER_ROOM', roomId: roomA })).slots
        .some((s) => s.startAt === startAtOf(day.date, '15:00').toISOString()));
    });

    it('suspendre la salle dépublie, bloque les demandes en attente, et conserve la séance déjà confirmée', async () => {
      const pending = await book(requester2, tutor2, roomA, day.date, '12:00');
      await admin.reviewRoom(adminUser.id, roomA, { decision: 'SUSPEND', note: 'Contrôle sécurité' });
      const room = await prisma.room.findUniqueOrThrow({ where: { id: roomA } });
      assert.equal(room.status, 'SUSPENDED');
      assert.equal(room.publication, 'UNPUBLISHED_BY_ADMIN');
      assert.ok(!(await publicRooms.list({ radiusM: 100_000, limit: 50 })).some((r) => r.id === roomA));
      assert.equal(await code(bookings.acceptBooking(tutor2.userId, pending.id)), 'ROOM_NO_LONGER_AVAILABLE');
      assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: confirmedId } })).status, 'CONFIRMED');
      assert.equal(await code(partnerRooms.publish(manager.id, roomA)), 'ROOM_NOT_APPROVED');
      await bookings.cancelBooking(requester2.id, pending.id, {}, false);
    });

    it('après réintégration, le Gestionnaire doit republier lui-même', async () => {
      await admin.reviewRoom(adminUser.id, roomA, { decision: 'REINSTATE' });
      const room = await prisma.room.findUniqueOrThrow({ where: { id: roomA } });
      assert.equal(room.status, 'APPROVED');
      assert.equal(room.publication, 'UNPUBLISHED');
      assert.equal((await partnerRooms.publish(manager.id, roomA)).publication, 'PUBLISHED');
    });
  });

  // ------------------------------------------------------------------ expiration commerciale

  describe('expiration de l’offre commerciale', () => {
    it('la salle cesse d’être réservable, les séances confirmées sont conservées, une nouvelle offre la rétablit', async () => {
      const day = localDay(10);
      const confirmed = await bookings.acceptBooking(tutor1.userId, (await book(requester1, tutor1, roomA, day.date, '10:00')).id);
      const pending = await book(requester2, tutor2, roomA, day.date, '14:00');
      await prisma.venueSubscription.updateMany({ where: { venueId, status: 'ACTIVE' }, data: { endsAt: new Date(Date.now() - 60_000) } });

      assert.equal((await subscriptions.current(manager.id)).status, 'EXPIRED');
      assert.ok(!(await publicRooms.list({ radiusM: 100_000, limit: 50 })).some((r) => r.id === roomA));
      assert.equal(await code(book(requester1, tutor1, roomA, day.date, '16:00')), 'ROOM_NOT_BOOKABLE');
      assert.equal(await code(bookings.acceptBooking(tutor2.userId, pending.id)), 'ROOM_NO_LONGER_AVAILABLE');
      assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: confirmed.id } })).status, 'CONFIRMED');

      assert.equal(await subscriptions.expireDue() >= 1, true);
      assert.equal((await subscriptions.select(manager.id, planId)).status, 'ACTIVE');
      assert.ok((await publicRooms.list({ radiusM: 100_000, limit: 50 })).some((r) => r.id === roomA));
      await bookings.cancelBooking(requester2.id, pending.id, {}, false);
      await bookings.cancelBooking(requester1.id, confirmed.id, { reason: 'Fin du test' }, false);
    });
  });

  // ------------------------------------------------------------------ réservations côté Gestionnaire / admin

  describe('suivi des réservations', () => {
    it('le Gestionnaire voit les séances confirmées sans données du Bénéficiaire', async () => {
      const day = localDay(11);
      const b = await bookings.acceptBooking(tutor1.userId, (await book(requester1, tutor1, roomA, day.date, '10:00')).id);
      const list = await partnerRooms.reservations(manager.id, { roomId: roomA, limit: 100 });
      const mine = list.find((r) => r.id === b.id);
      assert.ok(mine);
      const json = JSON.stringify(mine);
      assert.ok(!json.includes('Élève') && !json.includes(requester1.beneficiaryId));
      assert.equal(mine!.roomName, `Salle A ${run}`);
      const adminView = await admin.reservations({ roomId: roomA, limit: 100 } as never);
      assert.ok(adminView.some((r) => r.id === b.id));
      await bookings.cancelBooking(requester1.id, b.id, { reason: 'Fin du test' }, false);
    });
  });

  // ------------------------------------------------------------------ code de séance d'un cours en ligne

  describe('envoi du code de séance (cours en ligne)', () => {
    const onlineBooking = (offset: number, hhmm: string, over: Record<string, unknown> = {}) => {
      const day = localDay(offset);
      return bookings.createBooking(requester1.id, {
        offerId: tutor1.offerId, beneficiaryId: requester1.beneficiaryId, startAt: startAtOf(day.date, hhmm).toISOString(),
        teachingMode: 'ONLINE', ...over,
      } as never);
    };

    it('le code arrive au tuteur en message système, sans fuiter dans l’aperçu ni les événements, puis il est effacé au démarrage', async () => {
      const pending = await onlineBooking(12, '10:00');
      await bookings.acceptBooking(tutor1.userId, pending.id);
      const { otp } = await bookings.getOtp(requester1.id, pending.id);
      const spaced = `${otp.slice(0, 3)} ${otp.slice(3)}`;

      await bookings.shareOtp(requester1.id, pending.id);
      const conversation = await prisma.conversation.findFirstOrThrow({ where: { requesterId: requester1.id, tutorProfileId: tutor1.profileId } });
      const shared = await prisma.message.findFirst({ where: { conversationId: conversation.id, systemText: `Code de séance : ${spaced}` } });
      assert.ok(shared, 'le code est dans le fil');
      assert.equal(shared!.type, 'SYSTEM');
      assert.equal(shared!.senderId, null, 'message système, pas du texte libre');
      assert.ok(!(conversation.lastMessagePreview ?? '').includes(otp.slice(0, 3)), 'aperçu sans le code');
      const events = await prisma.outboxEvent.findMany({ where: { aggregateId: pending.id, eventType: 'message.system.created' } });
      assert.deepEqual(events.flatMap((e) => e.recipientIds), [tutor1.userId]);
      assert.ok(!JSON.stringify(events).includes(otp), 'l’événement ne porte pas le code');

      // Seule la partie concernée peut l'envoyer.
      assert.equal(await code(bookings.shareOtp(requester2.id, pending.id)), 'BOOKING_NOT_FOUND');

      // Le démarrage consomme le code : il disparaît du fil.
      await prisma.booking.update({ where: { id: pending.id }, data: { startAt: new Date(Date.now() + 60_000), endAt: new Date(Date.now() + 3_660_000) } });
      await bookings.startSession(tutor1.userId, pending.id, otp);
      const after = await prisma.message.findUniqueOrThrow({ where: { id: shared!.id } });
      assert.equal(after.systemText, 'Code de séance transmis');
      assert.equal(await code(bookings.shareOtp(requester1.id, pending.id)), 'OTP_NOT_AVAILABLE');
    });

    it('en présentiel (salle partenaire), le code ne s’envoie pas par message', async () => {
      const day = localDay(13);
      const pending = await book(requester1, tutor1, roomA, day.date, '10:00');
      const confirmed = await bookings.acceptBooking(tutor1.userId, pending.id);
      assert.equal(confirmed.status, 'CONFIRMED');
      assert.equal(await code(bookings.shareOtp(requester1.id, pending.id)), 'OTP_SHARE_ONLINE_ONLY');
      await bookings.cancelBooking(requester1.id, pending.id, { reason: 'Fin du test' }, false);
    });

    it('annuler la réservation efface aussi le code du fil', async () => {
      const pending = await onlineBooking(14, '11:00');
      await bookings.acceptBooking(tutor1.userId, pending.id);
      const { otp } = await bookings.getOtp(requester1.id, pending.id);
      await bookings.shareOtp(requester1.id, pending.id);
      await bookings.cancelBooking(requester1.id, pending.id, { reason: 'Empêchement' }, false);
      const left = await prisma.message.count({ where: { systemText: { contains: `${otp.slice(0, 3)} ${otp.slice(3)}` } } });
      assert.equal(left, 0);
    });
  });
});
