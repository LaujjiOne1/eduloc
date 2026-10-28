/**
 * Test d'intégration de la couche de services du FRONT pour les lieux partenaires (services + mappers + contrat)
 * contre l'API réelle : Gestionnaire → administrateur → Tuteur → Demandeur, adresse masquée avant confirmation,
 * conflit à l'acceptation.
 *
 *   # API démarrée sur une base initialisée (npm run db:seed du backend : plan PILOT, admin, tuteurs démo)
 *   DATABASE_URL=postgresql://…/eduloc_e2e EXPO_PUBLIC_API_URL=http://localhost:3999/api npx tsx scripts/partner-rooms-e2e.ts
 *
 * Les codes e-mail sont retrouvés depuis leur empreinte en base (DATABASE_URL, la même que celle de l'API).
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";

process.env.EXPO_PUBLIC_API_MODE = "http";

import { api } from "@/api/http";
import { AuthService } from "@/services/auth.service";
import { AvailabilityService } from "@/services/availability.service";
import { BeneficiaryService } from "@/services/beneficiary.service";
import { BookingService } from "@/services/booking.service";
import { OfferService } from "@/services/offer.service";
import { PartnerService } from "@/services/partner.service";
import { RoomService } from "@/services/room.service";
import { SearchService } from "@/services/search.service";
import { TutorService } from "@/services/tutor.service";
import { localDate } from "@/api/format/datetime";

const backend = path.resolve(__dirname, "../../edUloc back/eduloc-backend");
const requireBackend = createRequire(path.join(backend, "package.json"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
requireBackend("dotenv").config({ path: path.join(backend, ".env") });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pg = requireBackend("pg") as typeof import("pg");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });

let passed = 0;
let failed = 0;
function ok(cond: unknown, label: string, extra?: unknown) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400));
  }
}
const step = (t: string) => console.log(`\n${t}`);
async function expectError(fn: () => Promise<unknown>, code: string, label: string) {
  try {
    await fn();
    ok(false, `${label} (aucune erreur levée)`);
  } catch (e) {
    const err = e as { code?: string; problemCode?: string; message?: string };
    ok(err.code === code || err.problemCode === code, `${label} → ${code}`, { code: err.code, problem: err.problemCode, message: err.message });
  }
}

async function emailCode(email: string): Promise<string> {
  const { rows } = await db.query('SELECT "emailVerificationTokenHash" AS h FROM users WHERE email = $1', [email.toLowerCase()]);
  const hash = rows[0]?.h as string | undefined;
  if (!hash) throw new Error(`aucun code pour ${email}`);
  for (let n = 0; n < 1_000_000; n += 1) {
    const code = String(n).padStart(6, "0");
    if (createHash("sha256").update(`${email.toLowerCase()}:${code}`).digest("hex") === hash) return code;
  }
  throw new Error("code introuvable");
}

const dataFile = (mimeType: string, content: string, fileName?: string) => {
  const bytes = Buffer.from(content);
  return { uri: `data:${mimeType};base64,${bytes.toString("base64")}`, mimeType, sizeBytes: bytes.length, fileName };
};

async function signUp(email: string, password: string, firstName: string) {
  await AuthService.signup({ firstName, lastName: "E2E", email, password, phone: "+261 34 12 345 67" });
  const code = await emailCode(email);
  // Le calcul du code (recherche par empreinte) peut dépasser le délai d'inactivité du serveur : la connexion réutilisée
  // est alors coupée côté serveur. Ce cas ne concerne que ce script, pas l'application : un nouvel essai suffit.
  for (let attempt = 1; ; attempt += 1) {
    try {
      await AuthService.verifyEmail(email, code);
      return;
    } catch (e) {
      if ((e as { code?: string }).code !== "network_error" || attempt >= 3) throw e;
    }
  }
}

async function main() {
  await db.connect();
  const stamp = Date.now();
  const PASSWORD = "Motdepasse123!";
  const managerEmail = `front.gestionnaire.${stamp}@e2e.test`;
  const requesterEmail = `front.demandeur.${stamp}@e2e.test`;
  const requester2Email = `front.demandeur2.${stamp}@e2e.test`;
  const SECRET_ADDRESS = `Rue du Secret ${stamp}`;
  const SECRET_ACCESS = `Code portail ${stamp}`;

  // Jour de test : dans 5 jours (préavis de 12 h largement respecté).
  const target = new Date(Date.now() + 5 * 86_400_000);
  const testDate = localDate(target.toISOString());
  const testDow = new Date(`${testDate}T12:00:00Z`).getUTCDay();

  // ───────────────────────────────────────────── Gestionnaire
  step("1. Gestionnaire : structure, justificatif, soumission (PartnerService)");
  await signUp(managerEmail, PASSWORD, "Gestionnaire");
  ok((await PartnerService.getVenue()) === null, "aucune structure au départ (404 → null)");
  const venue = await PartnerService.createVenue({
    name: `Bibliothèque ${stamp}`, type: "library", description: "Salles d'étude", legalName: "", registrationNumber: "",
    contactPhone: "+261 34 00 000 00", contactEmail: managerEmail,
  });
  ok(venue.status === "draft" && venue.editable && venue.type === "library" && venue.subscription.status === "not_selected", "structure créée en brouillon", venue);
  await expectError(() => PartnerService.submitVenue(), "VENUE_DOCUMENT_REQUIRED", "soumission sans justificatif refusée");
  await PartnerService.uploadVenueDocument("ownership_proof", dataFile("application/pdf", "%PDF-1.4 preuve", "preuve.pdf"));
  const withDoc = (await PartnerService.getVenue())!;
  ok(withDoc.documents.length === 1 && withDoc.documents[0].kind === "ownership_proof" && withDoc.documents[0].fileName === "preuve.pdf", "justificatif envoyé (URL signée) et listé", withDoc.documents);
  const submitted = await PartnerService.submitVenue();
  ok(submitted.status === "submitted" && !submitted.editable, "dossier soumis, plus modifiable", submitted.status);

  step("2. Administrateur valide la structure");
  await AuthService.logout();
  await AuthService.login({ email: "admin@eduloc.mg", password: "Admin12345!" });
  await api.post(`/admin/partners/venues/${submitted.id}/review`, { decision: "APPROVE" });
  await AuthService.logout();
  await AuthService.login({ email: managerEmail, password: PASSWORD });
  ok((await PartnerService.getVenue())!.status === "approved", "structure validée");

  // ───────────────────────────────────────────── Salles
  step("3. Salle : brouillon, horaires, photo, soumission individuelle");
  const room = await PartnerService.createRoom({
    name: `Salle Jasmin ${stamp}`, description: "Calme", addressLine: SECRET_ADDRESS, city: "Antananarivo", latitude: -18.9139, longitude: 47.5217,
    accessInstructions: SECRET_ACCESS, zoneLabel: "Analakely", capacity: 4, equipment: ["Tableau", "Wi-Fi"], accessibility: ["Accès PMR"],
    welcomesMinors: true, pricePerHour: 5000, rules: "Pas de nourriture", cancellationPolicy: "",
  });
  ok(room.status === "draft" && room.editable && room.pricePerHour === "5000" && room.equipment.length === 2 && room.addressLine === SECRET_ADDRESS, "salle créée (le Gestionnaire voit l'adresse exacte)", room);
  ok(room.missingFields.includes("availabilities"), "horaires manquants signalés", room.missingFields);
  await expectError(() => PartnerService.submitRoom(room.id), "ROOM_INCOMPLETE", "soumission d'une fiche incomplète refusée");
  const hours = await PartnerService.replaceOpenings(room.id, [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: "09:00", endTime: "17:00" })));
  ok(hours.openings.length === 7 && hours.openings[0].label.includes("·") && hours.uncoveredConfirmedBookings === 0, "horaires enregistrés", hours.openings[0]);
  await PartnerService.uploadPhoto(room.id, dataFile("image/png", "PNG-fake-bytes", "salle.png"));
  const afterPhoto = await PartnerService.getRoom(room.id);
  ok(afterPhoto.photos.length === 1 && afterPhoto.photos[0].url.startsWith("http"), "photo envoyée et servie par URL", afterPhoto.photos);
  const roomSubmitted = await PartnerService.submitRoom(room.id);
  ok(roomSubmitted.status === "submitted" && !roomSubmitted.editable, "salle soumise", roomSubmitted.status);

  step("4. Validation de la salle, offre commerciale, publication");
  await AuthService.logout();
  await AuthService.login({ email: "admin@eduloc.mg", password: "Admin12345!" });
  await api.post(`/admin/partners/rooms/${room.id}/review`, { decision: "APPROVE" });
  await AuthService.logout();
  await AuthService.login({ email: managerEmail, password: PASSWORD });
  await expectError(() => PartnerService.publishRoom(room.id), "SUBSCRIPTION_REQUIRED", "publication sans offre active refusée");
  const plans = await PartnerService.listPlans();
  const pilot = plans.find((p) => p.code === "PILOT")!;
  ok(!!pilot && pilot.isFree && pilot.priceLabel === "Gratuit" && pilot.durationLabel === "1 an", "catalogue : plan PILOT gratuit", plans);
  const subscription = await PartnerService.selectPlan(pilot.id);
  ok(subscription.status === "active" && !!subscription.validUntilLabel, "offre gratuite activée aussitôt", subscription);
  const published = await PartnerService.publishRoom(room.id);
  ok(published.publication === "published" && published.bookable && published.identityLocked, "salle publiée et réservable, identité verrouillée", published);
  await expectError(() => PartnerService.updateRoom(room.id, { addressLine: "Autre rue" }), "ROOM_FIELDS_LOCKED", "adresse d'une salle validée verrouillée");
  const dashboard = (await PartnerService.getVenue())!;
  ok(dashboard.rooms.length === 1 && dashboard.rooms[0].bookable && dashboard.history.length >= 4, "tableau de bord : salle réservable + historique", { rooms: dashboard.rooms, history: dashboard.history.length });

  // ───────────────────────────────────────────── Public
  step("5. Consultation publique : jamais d'adresse exacte (RoomService)");
  await AuthService.logout();
  const publicRooms = await RoomService.listRooms({ lat: -18.9139, lng: 47.5217 }, 5000);
  const publicRoom = publicRooms.find((r) => r.id === room.id);
  ok(!!publicRoom && publicRoom.zoneLabel === "Analakely" && !!publicRoom.distanceLabel, "salle listée avec zone et distance estimée", publicRoom);
  const publicJson = JSON.stringify(publicRooms) + JSON.stringify(await RoomService.getRoom(room.id));
  ok(![SECRET_ADDRESS, SECRET_ACCESS, "-18.9139", "47.5217", "addressLine"].some((s) => publicJson.includes(s)), "aucune adresse, coordonnée ni instruction dans l'API publique");

  // ───────────────────────────────────────────── Tuteur
  step("6. Tuteur : accepte la salle, ouvre une plage « salles partenaires » (RoomService, AvailabilityService)");
  await AuthService.login({ email: "andry.rakoto@demo.eduloc.mg", password: "Demo12345!" });
  const tutorProfile = await TutorService.getMyProfile();
  const offers = await OfferService.getTutorOffers();
  const offer = offers.find((o) => o.format !== "online")!;
  ok(!!offer, "offre en présentiel du tuteur démo", offers.map((o) => o.format));
  const accepted = await RoomService.acceptRoom(room.id);
  ok(accepted.some((r) => r.id === room.id && r.bookable), "salle acceptée (liste du tuteur)", accepted.map((r) => r.id));
  for (const dow of [0, 1, 2, 3, 4, 5, 6]) {
    await AvailabilityService.createAvailability({ kind: "recurring", dayOfWeek: dow, startTime: "08:00", endTime: "18:00", placeId: "partner_room" });
  }
  const mine = await AvailabilityService.getAvailability();
  const roomRule = mine.find((a) => a.placeId === "partner_room");
  ok(!!roomRule && roomRule.locationLabel === "Salles partenaires" && roomRule.format === "in_person", "plage « Salles partenaires » créée et relue", roomRule);
  ok(!tutorProfile.locations.some((l) => l.label === "Salles partenaires"), "le lieu symbolique n'apparaît pas dans les lieux du tuteur");
  await OfferService.updateOffer(offer.id, { durationOptions: [120] });
  const updated = (await OfferService.getTutorOffers()).find((o) => o.id === offer.id)!;
  ok(updated.durationOptions.length === 1 && updated.durationOptions[0] === 120, "durée supplémentaire configurée sur l'offre", updated.durationOptions);

  // Second tuteur : accepte aussi la salle (deux tuteurs peuvent viser le même créneau, aucune réservation n'existe encore).
  await AuthService.logout();
  await AuthService.login({ email: "hery.rasolofo@demo.eduloc.mg", password: "Demo12345!" });
  const heryOffer = (await OfferService.getTutorOffers()).find((o) => o.format !== "online");
  ok(!!heryOffer, "second tuteur démo : offre en présentiel");
  await RoomService.acceptRoom(room.id);
  for (const dow of [0, 1, 2, 3, 4, 5, 6]) {
    await AvailabilityService.createAvailability({ kind: "recurring", dayOfWeek: dow, startTime: "08:00", endTime: "18:00", placeId: "partner_room" });
  }

  // ───────────────────────────────────────────── Demandeur
  step("7. Demandeur : options, créneaux, demande en salle (RoomService, BookingService)");
  await AuthService.logout();
  await signUp(requesterEmail, PASSWORD, "Demandeur");
  const beneficiary = await BeneficiaryService.createBeneficiary({ firstName: "Tiana", lastName: "E2E", relationship: "child", levelId: null });
  const options = await RoomService.getBookingOptions(offer.id);
  ok(options.modes.includes("partner_room") && options.rooms.some((r) => r.id === room.id), "options : mode salle partenaire + la salle acceptée", options.modes);
  ok(options.durations.length === 2 && options.durations[1].minutes === 120 && options.minNoticeHours >= 1, "durées proposées avec leur prix", options.durations);
  ok(!JSON.stringify(options).includes(SECRET_ADDRESS), "options sans adresse exacte");
  const slots = await RoomService.getDaySlots(offer.id, { date: testDate, mode: "partner_room", roomId: room.id, durationMinutes: 120 });
  ok(slots.length > 0 && slots.every((s) => s.teachingMode === "partner_room" && s.date === testDate), "créneaux du jour pour 2 h", slots.slice(0, 2));
  const slot = slots.find((s) => s.startTime === "10:00") ?? slots[0];
  void testDow;

  const requestBody = {
    offerId: offer.id, slot: { availabilityId: slot.availabilityId, startAt: slot.startAt, placeId: null }, beneficiaryId: beneficiary.id,
    teachingMode: "partner_room" as const, roomId: room.id, durationMinutes: 120, participantsCount: 2, requiredEquipment: ["Tableau"],
  };
  await expectError(() => BookingService.createBooking({ ...requestBody, roomId: undefined }), "ROOM_REQUIRED", "mode salle sans salle refusé");
  await expectError(() => BookingService.createBooking({ ...requestBody, participantsCount: 9 }), "ROOM_CAPACITY_EXCEEDED", "effectif supérieur à la capacité refusé");
  const booking = await BookingService.createBooking({ ...requestBody, idempotencyKey: `room-${stamp}` });
  ok(booking.status === "pending" && booking.teachingMode === "partner_room" && booking.room?.zoneLabel === "Analakely", "demande PENDING avec la salle (zone)", booking.room);
  ok(booking.locationAddress === null && booking.accessInstructions === null && booking.participantsCount === 2 && booking.roomFeeLabel?.replace(/\s/g, "") === "10000Ar", "adresse et accès masqués avant confirmation, tarif de la salle", { address: booking.locationAddress, fee: booking.roomFeeLabel });
  ok(!JSON.stringify(booking).includes(SECRET_ADDRESS), "réponse de réservation sans adresse exacte");

  // Une seconde demande (autre demandeur, même créneau) est possible : aucun blocage temporaire.
  await AuthService.logout();
  await signUp(requester2Email, PASSWORD, "Demandeur2");
  const beneficiary2 = await BeneficiaryService.createBeneficiary({ firstName: "Mia", lastName: "E2E", relationship: "child", levelId: null });
  const second = await BookingService.createBooking({ ...requestBody, beneficiaryId: beneficiary2.id, idempotencyKey: `room2-${stamp}` });
  ok(second.status === "pending", "seconde demande sur le même créneau acceptée (PENDING ne bloque pas)", second.status);
  const heryBooking = await BookingService.createBooking({
    offerId: heryOffer!.id, slot: { availabilityId: slot.availabilityId, startAt: slot.startAt, placeId: null }, beneficiaryId: beneficiary2.id,
    teachingMode: "partner_room", roomId: room.id, idempotencyKey: `room3-${stamp}`, durationMinutes: heryOffer!.durationMinutes,
  });
  ok(heryBooking.status === "pending", "demande vers un second tuteur, même salle et même créneau, enregistrée (aucun blocage)", heryBooking.status);

  // ───────────────────────────────────────────── Acceptation
  step("8. Acceptation : séance et salle confirmées ensemble, adresse révélée, conflit tracé");
  await AuthService.logout();
  await AuthService.login({ email: "andry.rakoto@demo.eduloc.mg", password: "Demo12345!" });
  const view = (await BookingService.getTutorBookings(["pending"])).find((b) => b.id === booking.id)!;
  ok(!!view && view.locationAddress === null, "demande reçue par le tuteur, adresse masquée", view?.locationAddress);
  const confirmed = await BookingService.acceptBooking(booking.id);
  ok(confirmed.status === "confirmed" && confirmed.locationAddress?.includes(SECRET_ADDRESS) === true && confirmed.accessInstructions === SECRET_ACCESS, "CONFIRMED : adresse exacte et instructions révélées", { a: confirmed.locationAddress, i: confirmed.accessInstructions });
  // La seconde demande vise le même tuteur et le même horaire : le tuteur ne peut pas l'accepter (créneau pris).
  await expectError(() => BookingService.acceptBooking(second.id), "invalid_state", "demande concurrente du même tuteur : auto-refusée à la confirmation");

  // Autre cas : même salle, AUTRE tuteur — conflit de salle, la demande reste en attente.
  step("9. Conflit de salle avec un autre tuteur : 409, demande en attente, non confirmée");
  await AuthService.logout();
  await AuthService.login({ email: "hery.rasolofo@demo.eduloc.mg", password: "Demo12345!" });
  await expectError(() => BookingService.acceptBooking(heryBooking.id), "slot_unavailable", "acceptation refusée : salle déjà prise");
  const still = (await BookingService.getTutorBookings(["pending"])).find((b) => b.id === heryBooking.id);
  ok(!!still && still.status === "pending" && still.locationAddress === null && still.accessInstructions === null, "la demande reste PENDING, sans adresse", still?.status);
  const { rows } = await db.query('SELECT type FROM conflicts WHERE "bookingId" = $1', [heryBooking.id]);
  ok(rows.length === 1 && rows[0].type === "ROOM_UNAVAILABLE", "conflit ROOM_UNAVAILABLE tracé", rows);
  await AuthService.logout();
  await AuthService.login({ email: requester2Email, password: PASSWORD });
  const requesterView = await BookingService.getBookingById(heryBooking.id);
  ok(requesterView.status === "pending" && requesterView.slot.startAt === slot.startAt, "côté demandeur : toujours en attente, rien n'a été déplacé", requesterView.status);

  // ───────────────────────────────────────────── Gestionnaire : suivi
  step("10. Gestionnaire : séances confirmées, sans données du bénéficiaire");
  await AuthService.logout();
  await AuthService.login({ email: managerEmail, password: PASSWORD });
  const reservations = await PartnerService.listReservations(room.id);
  const mineRes = reservations.find((r) => r.id === booking.id);
  ok(!!mineRes && mineRes.status === "confirmed" && mineRes.participantsCount === 2 && mineRes.roomName.includes("Jasmin"), "séance confirmée visible du Gestionnaire", mineRes);
  ok(!JSON.stringify(reservations).includes("Tiana"), "aucun nom de bénéficiaire exposé");
  const block = await PartnerService.addBlock(room.id, { startAt: slot.startAt, endAt: slot.endAt, reason: "Test" }).catch((e) => e as { code?: string; problemCode?: string });
  ok("problemCode" in (block as object) && (block as { problemCode?: string }).problemCode === "BLOCK_OVERLAPS_CONFIRMED_BOOKING", "fermeture sur une séance confirmée refusée", block);
  const status = await SearchService.getLevels().then(() => "ok");
  void status;

  console.log(`\n${passed} réussis, ${failed} échoués`);
  await db.end();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error("ÉCHEC", e);
  await db.end().catch(() => undefined);
  process.exit(1);
});
