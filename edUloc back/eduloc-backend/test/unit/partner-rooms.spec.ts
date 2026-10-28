import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ERROR_MESSAGES } from '../../src/common/errors/error-messages';
import { CreateBookingDto } from '../../src/modules/bookings/dto';
import { computeDaySlots } from '../../src/modules/bookings/domain/day-slots';
import { MarginPolicy, locationKeyOf } from '../../src/modules/bookings/domain/margin-policy';
import { allowedDurations } from '../../src/modules/bookings/domain/offer-durations';
import { AvailabilityRule, SlotPolicy } from '../../src/modules/bookings/domain/slot-policy';
import { isLikelyMinor } from '../../src/modules/bookings/room-reservation.service';
import { PartnerLifecycle } from '../../src/modules/partners/domain/review-lifecycle';
import { missingRoomFields, publishBlockers } from '../../src/modules/partners/domain/room-bookability';
import { ReplaceRoomAvailabilitiesDto, RoomDto } from '../../src/modules/partners/dto';
import { approximateDistance, toPublicRoom } from '../../src/modules/rooms/rooms.service';
import { OfferDto } from '../../src/modules/tutors/tutors.dto';

const UUID = '0b1f3c1e-6a33-4b6a-9a52-5d2f2a3d1c11';
const errorsOf = async (cls: new () => object, plain: object) =>
  (await validate(plainToInstance(cls, plain), { whitelist: true, forbidNonWhitelisted: true })).map((e) => e.property);

// Madagascar = UTC+3, sans heure d'été : 17:00 locales = 14:00Z.
const rule = (over: Partial<AvailabilityRule> = {}): AvailabilityRule => ({
  id: 'r1', dayOfWeek: 3, startTime: '08:00', endTime: '18:00', timezone: 'Indian/Antananarivo',
  validFrom: null, validUntil: null, isActive: true, offerId: null, placeId: null, placeType: null, ...over,
});
// 2026-10-21 est un mercredi (3).
const DAY = '2026-10-21';
const at = (hhmm: string, date = DAY) => new Date(`${date}T${hhmm}:00+03:00`);
const noMargin = { bufferMinutes: 0, travelBufferMinutes: 0 };
const base = {
  date: DAY, durationMinutes: 60, stepMinutes: 30, notBefore: new Date(0), mode: 'PARTNER_ROOM' as const, offerId: 'o1',
  tutorRules: [rule()], tutorBlocked: [], tutorBusy: [], candidateLocationKey: 'room:A', margins: noMargin,
};
const starts = (slots: { startAt: Date }[]) =>
  slots.map((s) => s.startAt.toLocaleTimeString('fr-FR', { timeZone: 'Indian/Antananarivo', hour: '2-digit', minute: '2-digit' }));

describe('calcul des créneaux : intersection Tuteur ∩ salle (spec 5)', () => {
  const room = (over: Record<string, unknown> = {}) => ({
    rules: [rule({ id: 'room-rule', startTime: '10:00', endTime: '14:00' })], blocked: [], busy: [], turnoverMinutes: 0, ...over,
  });

  it('seule la plage commune au Tuteur (8-18 h) et à la salle (10-14 h) est proposée, durée entière couverte', () => {
    const slots = computeDaySlots({ ...base, room: room() });
    assert.deepEqual(starts(slots), ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00']);
    for (const s of slots) assert.equal(s.endAt.getTime() - s.startAt.getTime(), 3_600_000);
  });

  it('une durée de 2 h réduit les départs possibles : tout le créneau doit tenir dans les deux plages', () => {
    const slots = computeDaySlots({ ...base, durationMinutes: 120, room: room() });
    assert.deepEqual(starts(slots), ['10:00', '10:30', '11:00', '11:30', '12:00']);
  });

  it('un Tuteur sans plage pour ce mode n’a aucun créneau de salle', () => {
    const slots = computeDaySlots({ ...base, tutorRules: [rule({ placeType: 'ONLINE' })], room: room() });
    assert.deepEqual(slots, []);
  });

  it('une plage « salles partenaires » ou sans lieu autorise le mode salle', () => {
    assert.ok(computeDaySlots({ ...base, tutorRules: [rule({ placeType: 'PARTNER_ROOM' })], room: room() }).length > 0);
    assert.ok(computeDaySlots({ ...base, tutorRules: [rule({ placeType: null })], room: room() }).length > 0);
  });

  it('une séance confirmée dans la salle retire les créneaux qui la chevauchent, pas les adjacents', () => {
    const busy = [{ startAt: at('11:00'), endAt: at('12:00') }];
    assert.deepEqual(starts(computeDaySlots({ ...base, room: room({ busy }) })), ['10:00', '12:00', '12:30', '13:00']);
  });

  it('le temps de rotation de la salle écarte aussi les créneaux collés à une séance confirmée', () => {
    const busy = [{ startAt: at('11:00'), endAt: at('12:00') }];
    assert.deepEqual(starts(computeDaySlots({ ...base, room: room({ busy, turnoverMinutes: 30 }) })), ['12:30', '13:00']);
  });

  it('une fermeture de la salle bloque ses créneaux', () => {
    const blocked = [{ startAt: at('10:00'), endAt: at('12:00') }];
    assert.deepEqual(starts(computeDaySlots({ ...base, room: room({ blocked }) })), ['12:00', '12:30', '13:00']);
  });

  it('le Tuteur occupé ailleurs n’est pas proposé, même si la salle est libre', () => {
    const tutorBusy = [{ startAt: at('10:00'), endAt: at('12:00'), locationKey: null }];
    assert.deepEqual(starts(computeDaySlots({ ...base, tutorBusy, room: room() })), ['12:00', '12:30', '13:00']);
  });

  it('une période bloquée du Tuteur retire les créneaux', () => {
    const tutorBlocked = [{ startAt: at('09:00'), endAt: at('13:00') }];
    assert.deepEqual(starts(computeDaySlots({ ...base, tutorBlocked, room: room() })), ['13:00']);
  });

  it('le préavis écarte tout créneau qui commence avant (notBefore)', () => {
    const slots = computeDaySlots({ ...base, notBefore: at('11:45'), room: room() });
    assert.deepEqual(starts(slots), ['12:00', '12:30', '13:00']);
  });

  it('sans salle, seules les disponibilités du Tuteur comptent', () => {
    const slots = computeDaySlots({ ...base, mode: 'ONLINE', candidateLocationKey: null });
    assert.equal(starts(slots)[0], '08:00');
    assert.equal(starts(slots).at(-1), '17:00');
  });

  it('un autre jour de la semaine ne renvoie rien', () => {
    assert.deepEqual(computeDaySlots({ ...base, date: '2026-10-22' }), []);
  });
});

describe('marges de déplacement (spec 4.4)', () => {
  const margins = { bufferMinutes: 0, travelBufferMinutes: 30 };

  it('séance précédente finie à 15 h dans un lieu éloigné : 15 h refusé, 15 h 30 accepté', () => {
    const previous = [{ startAt: at('14:00'), endAt: at('15:00'), locationKey: 'room:B' }];
    const candidate = (start: string, end: string) => ({ startAt: at(start), endAt: at(end), locationKey: 'room:A' });
    assert.ok(MarginPolicy.findConflict(candidate('15:00', '16:00'), previous, margins));
    assert.ok(MarginPolicy.findConflict(candidate('15:29', '16:29'), previous, margins));
    assert.equal(MarginPolicy.findConflict(candidate('15:30', '16:30'), previous, margins), null);
  });

  it('même lieu : aucune marge de déplacement, enchaînement possible', () => {
    const previous = [{ startAt: at('14:00'), endAt: at('15:00'), locationKey: 'room:A' }];
    assert.equal(MarginPolicy.findConflict({ startAt: at('15:00'), endAt: at('16:00'), locationKey: 'room:A' }, previous, margins), null);
  });

  it('une séance en ligne n’impose aucun déplacement', () => {
    const previous = [{ startAt: at('14:00'), endAt: at('15:00'), locationKey: null }];
    assert.equal(MarginPolicy.findConflict({ startAt: at('15:00'), endAt: at('16:00'), locationKey: 'room:A' }, previous, margins), null);
  });

  it('le chevauchement strict reste toujours un conflit, marge nulle comprise', () => {
    const previous = [{ startAt: at('14:00'), endAt: at('15:00'), locationKey: 'room:A' }];
    assert.ok(MarginPolicy.findConflict({ startAt: at('14:30'), endAt: at('15:30'), locationKey: 'room:A' }, previous, noMargin));
  });

  it('les clés de lieu distinguent salle, lieu du tuteur, domicile et ligne', () => {
    assert.equal(locationKeyOf({ teachingMode: 'ONLINE' }), null);
    assert.equal(locationKeyOf({ teachingMode: 'PARTNER_ROOM', roomId: 'x' }), 'room:x');
    assert.equal(locationKeyOf({ teachingMode: 'AT_HOME_BENEFICIARY', address: '  12 Rue  Rainitovo ' }), 'home:12 rue rainitovo');
    assert.equal(locationKeyOf({ teachingMode: 'PUBLIC_PLACE', placeId: 'p1' }), 'place:p1');
  });
});

describe('cycle de vie des dossiers (spec 10)', () => {
  it('le Gestionnaire soumet, seul l’administrateur valide', () => {
    assert.doesNotThrow(() => PartnerLifecycle.assertRoom('DRAFT', 'SUBMITTED', 'MANAGER'));
    assert.throws(() => PartnerLifecycle.assertRoom('SUBMITTED', 'APPROVED', 'MANAGER'), { code: 'TRANSITION_NOT_ALLOWED_FOR_ACTOR' });
    assert.throws(() => PartnerLifecycle.assertRoom('DRAFT', 'APPROVED', 'ADMIN'), { code: 'INVALID_TRANSITION' });
    assert.doesNotThrow(() => PartnerLifecycle.assertRoom('SUBMITTED', 'APPROVED', 'ADMIN'));
  });

  it('une salle rejetée est terminale ; une salle à corriger peut être resoumise', () => {
    assert.throws(() => PartnerLifecycle.assertRoom('REJECTED', 'SUBMITTED', 'MANAGER'));
    assert.ok(PartnerLifecycle.canRoom('NEEDS_CORRECTION', 'SUBMITTED', 'MANAGER'));
  });

  it('seule une structure ou une salle validée peut être suspendue, puis rétablie', () => {
    assert.ok(PartnerLifecycle.canRoom('APPROVED', 'SUSPENDED', 'ADMIN'));
    assert.ok(PartnerLifecycle.canRoom('SUSPENDED', 'APPROVED', 'ADMIN'));
    assert.ok(!PartnerLifecycle.canRoom('DRAFT', 'SUSPENDED', 'ADMIN'));
    assert.ok(PartnerLifecycle.canVenue('SUSPENDED', 'APPROVED', 'ADMIN'));
  });

  it('une salle validée n’est plus modifiable librement : seuls brouillon et corrections le sont', () => {
    assert.ok(PartnerLifecycle.isEditable('DRAFT'));
    assert.ok(PartnerLifecycle.isEditable('NEEDS_CORRECTION'));
    for (const s of ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'SUSPENDED', 'REJECTED'] as const) assert.ok(!PartnerLifecycle.isEditable(s), s);
  });
});

describe('publication (spec 8.2 / 10.3)', () => {
  const ok = { roomStatus: 'APPROVED', roomPublication: 'UNPUBLISHED', venueStatus: 'APPROVED', hasActiveSubscription: true };

  it('publiable seulement si salle et structure validées et offre active', () => {
    assert.deepEqual(publishBlockers(ok), []);
    assert.deepEqual(publishBlockers({ ...ok, roomStatus: 'SUBMITTED' }), ['ROOM_NOT_APPROVED']);
    assert.deepEqual(publishBlockers({ ...ok, venueStatus: 'SUSPENDED' }), ['VENUE_NOT_APPROVED']);
    assert.deepEqual(publishBlockers({ ...ok, hasActiveSubscription: false }), ['SUBSCRIPTION_REQUIRED']);
    assert.deepEqual(publishBlockers({ ...ok, roomPublication: 'UNPUBLISHED_BY_ADMIN' }), ['ROOM_UNPUBLISHED_BY_ADMIN']);
  });

  it('une salle suspendue ne peut pas être publiée', () => {
    assert.ok(publishBlockers({ ...ok, roomStatus: 'SUSPENDED' }).includes('ROOM_NOT_APPROVED'));
  });

  it('la soumission exige une fiche complète, horaires compris', () => {
    const room = {
      name: 'Salle A', addressLine: '1 rue X', city: 'Tana', latitude: -18.9, longitude: 47.5, zoneLabel: 'Analakely',
      capacity: 4, pricePerHour: 5000, rules: 'Silence', };
    assert.deepEqual(missingRoomFields(room, 1), []);
    assert.deepEqual(missingRoomFields(room, 0), ['availabilities']);
    assert.deepEqual(missingRoomFields({ ...room, latitude: null, zoneLabel: null }, 1), ['position', 'zoneLabel']);
  });
});

describe('fiche publique : jamais d’adresse exacte (spec 9)', () => {
  const room = {
    id: UUID, venueId: 'v', name: 'Salle Jasmin', description: 'Lumineuse', addressLine: '12 rue Secrète', city: 'Antananarivo',
    latitude: -18.91234, longitude: 47.52345, accessInstructions: 'Code portail 4821', zoneLabel: 'Analakely', capacity: 6,
    equipment: ['Tableau'], accessibility: ['PMR'], welcomesMinors: false, pricePerHour: { toString: () => '5000' },
    currency: 'MGA', rules: 'Pas de nourriture', cancellationPolicy: 'Gratuite 24 h', timezone: 'Indian/Antananarivo',
    status: 'APPROVED', publication: 'PUBLISHED', publishedAt: null, isActive: true, submittedAt: null, reviewedAt: null,
    reviewedById: null, reviewNote: 'note interne', createdAt: new Date(), updatedAt: new Date(), location: null,
    photos: [], availabilities: [], venue: { type: 'LIBRARY' },
  };

  it('la sortie publique ne contient ni adresse, ni coordonnées, ni instructions d’accès, ni note interne', () => {
    const json = JSON.stringify(toPublicRoom(room as never, [{ id: 'p', url: 'https://x/photo' }], 1234));
    for (const secret of ['12 rue Secrète', 'Antananarivo', '-18.91234', '47.52345', 'Code portail', 'note interne', 'venueId', 'latitude', 'longitude']) {
      assert.ok(!json.includes(secret), `fuite : ${secret}`);
    }
    assert.ok(json.includes('Analakely'));
  });

  it('la distance est arrondie au 500 m supérieur', () => {
    assert.equal(approximateDistance(1), 500);
    assert.equal(approximateDistance(501), 1000);
    assert.equal(approximateDistance(1234), 1500);
  });
});

describe('mineurs et durées', () => {
  const now = new Date('2026-10-19T00:00:00Z');

  it('l’âge connu prime sur le niveau', () => {
    assert.ok(isLikelyMinor({ birthDate: new Date('2012-01-01'), educationLevel: null }, now));
    assert.ok(!isLikelyMinor({ birthDate: new Date('2000-01-01'), educationLevel: { category: 'Primaire' } }, now));
  });

  it('sans date de naissance, jusqu’au lycée on suppose un mineur', () => {
    assert.ok(isLikelyMinor({ birthDate: null, educationLevel: { category: 'Collège' } }, now));
    assert.ok(isLikelyMinor({ birthDate: null, educationLevel: { category: 'Lycée' } }, now));
    assert.ok(!isLikelyMinor({ birthDate: null, educationLevel: { category: 'Université' } }, now));
    assert.ok(!isLikelyMinor({ birthDate: null, educationLevel: null }, now));
  });

  it('les durées réservables sont la durée par défaut plus celles configurées, sans doublon', () => {
    assert.deepEqual(allowedDurations({ durationMinutes: 60, durationOptions: [120, 60, 90] }), [60, 90, 120]);
    assert.deepEqual(allowedDurations({ durationMinutes: 60, durationOptions: null }), [60]);
  });

  it('SlotPolicy.supportsMode : une plage restreinte à un autre mode ne couvre pas la salle', () => {
    assert.ok(!SlotPolicy.supportsMode([rule({ placeType: 'TUTOR_HOME' })], 'PARTNER_ROOM', 'o'));
    assert.ok(SlotPolicy.supportsMode([rule({ placeType: 'TUTOR_HOME' }), rule({ placeType: 'PARTNER_ROOM' })], 'PARTNER_ROOM', 'o'));
  });
});

describe('validation des entrées', () => {
  it('la réservation accepte salle, durée et besoins ; refuse une durée hors bornes', async () => {
    const valid = {
      offerId: UUID, beneficiaryId: UUID, startAt: '2026-10-21T10:00:00.000Z', teachingMode: 'PARTNER_ROOM', roomId: UUID,
      durationMinutes: 120, participantsCount: 2, requiredEquipment: ['Tableau'],
    };
    assert.deepEqual(await errorsOf(CreateBookingDto, valid), []);
    assert.deepEqual(await errorsOf(CreateBookingDto, { ...valid, durationMinutes: 5 }), ['durationMinutes']);
    assert.deepEqual(await errorsOf(CreateBookingDto, { ...valid, roomId: 'pas-un-uuid' }), ['roomId']);
  });

  it('l’offre accepte plusieurs durées multiples de 15 min, rien d’autre', async () => {
    const offer = { subjectId: UUID, title: 'Maths', description: 'Cours', price: 10000 };
    assert.deepEqual(await errorsOf(OfferDto, { ...offer, durationMinutes: 60, durationOptions: [60, 120] }), []);
    assert.deepEqual(await errorsOf(OfferDto, { ...offer, durationOptions: [50] }), ['durationOptions']);
    assert.deepEqual(await errorsOf(OfferDto, { ...offer, durationOptions: [60, 60] }), ['durationOptions']);
  });

  it('une salle refuse une capacité nulle et une latitude hors plage', async () => {
    assert.deepEqual(await errorsOf(RoomDto, { name: 'Salle A', capacity: 4, latitude: -18.9, longitude: 47.5 }), []);
    assert.deepEqual(await errorsOf(RoomDto, { name: 'Salle A', capacity: 0 }), ['capacity']);
    assert.deepEqual(await errorsOf(RoomDto, { name: 'Salle A', latitude: 120 }), ['latitude']);
  });

  it('les plages d’ouverture exigent le format HH:mm', async () => {
    const good = { availabilities: [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }] };
    assert.deepEqual(await errorsOf(ReplaceRoomAvailabilitiesDto, good), []);
    const bad = await validate(plainToInstance(ReplaceRoomAvailabilitiesDto, {
      availabilities: [{ dayOfWeek: 1, startTime: '9h', endTime: '17:00' }],
    }));
    assert.ok(bad.length > 0);
  });
});

describe('catalogue d’erreurs', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : [];
    });

  it('chaque code métier levé par les modules lieux / réservations a un message lisible', () => {
    const root = join(__dirname, '..', '..', 'src', 'modules');
    const codes = new Set<string>();
    for (const dir of ['partners', 'rooms', 'bookings']) {
      for (const file of walk(join(root, dir))) {
        for (const m of readFileSync(file, 'utf8').matchAll(/new (?:\w+Error|\w+Exception)\(\s*'([A-Z][A-Z0-9_]+)'/g)) codes.add(m[1]);
      }
    }
    // Échecs de RoomReservationService, levés par construction (checked.failure).
    for (const code of [
      'ROOM_NOT_BOOKABLE', 'ROOM_NOT_ACCEPTED_BY_TUTOR', 'ROOM_CAPACITY_EXCEEDED', 'ROOM_EQUIPMENT_MISSING',
      'ROOM_MINORS_NOT_ALLOWED', 'ROOM_CLOSED', 'ROOM_UNAVAILABLE',
    ]) codes.add(code);
    const missing = [...codes].filter((c) => !(c in ERROR_MESSAGES) && !['INVALID_TRANSITION', 'TRANSITION_NOT_ALLOWED_FOR_ACTOR'].includes(c));
    assert.deepEqual(missing, []);
  });
});
