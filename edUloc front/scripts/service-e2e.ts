/**
 * Test d'intégration de la couche de services du FRONT (services + mappers + contrat) contre l'API réelle.
 * Parcourt le workflow du schéma « Parcours V2 » : demandeur (recherche → réservation → séance → avis)
 * et tuteur (candidature → validation admin → demandes → acceptation → séance).
 *
 *   # API démarrée (backend : npm run start:dev) et base initialisée (npm run db:seed)
 *   EXPO_PUBLIC_API_URL=http://localhost:3003/api npx tsx scripts/service-e2e.ts
 *
 * Les codes e-mail sont retrouvés depuis leur empreinte en base (DATABASE_URL du backend).
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";

process.env.EXPO_PUBLIC_API_MODE = "http";

import { api } from "@/api/http";
import { Session } from "@/api/session";
import { AuthService } from "@/services/auth.service";
import { AvailabilityService } from "@/services/availability.service";
import { BeneficiaryService } from "@/services/beneficiary.service";
import { BookingService } from "@/services/booking.service";
import { CategoryService } from "@/services/category.service";
import { normalizeAudioMime } from "@/api/upload";
import { ConversationService } from "@/services/conversation.service";
import { NotificationService } from "@/services/notification.service";
import { OfferService } from "@/services/offer.service";
import { ReviewService } from "@/services/review.service";
import { SearchService } from "@/services/search.service";
import { TutorApplicationService } from "@/services/tutor-application.service";
import { TutorService } from "@/services/tutor.service";

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
    console.log(`  ✗ ${label}`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 300));
  }
}
const step = (t: string) => console.log(`\n${t}`);
async function expectError(fn: () => Promise<unknown>, code: string, label: string) {
  try {
    await fn();
    ok(false, `${label} (aucune erreur levée)`);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    ok(err.code === code, `${label} → ${code}`, { code: err.code, message: err.message });
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

/** « Fichier local » sans disque : une data: URL (fetch(uri) fonctionne comme pour un vrai URI d'appareil). */
const dataFile = (mimeType: string, content: string, fileName?: string) => {
  const bytes = Buffer.from(content);
  return { uri: `data:${mimeType};base64,${bytes.toString("base64")}`, mimeType, sizeBytes: bytes.length, fileName };
};

async function main() {
  await db.connect();
  const stamp = Date.now();
  const requesterEmail = `front.parent.${stamp}@e2e.test`;
  const tutorEmail = `front.tuteur.${stamp}@e2e.test`;
  const PASSWORD = "Motdepasse123!";

  // ───────────────────────────────────────────── Recherche (public)
  step("1. Recherche publique (CategoryService, SearchService, TutorService, OfferService)");
  const categories = await CategoryService.getCategories();
  ok(categories.length >= 10, "matières chargées", categories.length);
  const maths = categories.find((c) => c.label === "Mathématiques")!;
  const levels = await SearchService.getLevels();
  ok(levels.length >= 10 && levels[0].id && levels[0].label, "niveaux chargés", levels[0]);
  const terminale = levels.find((l) => l.label === "Terminale")!;

  const coordinates = { latitude: -18.9082, longitude: 47.5242 };
  const tutors = await TutorService.searchTutors({ subjectId: maths.id, levelId: undefined, coordinates, format: "in_person", radiusKm: 10 });
  ok(tutors.length > 0, "recherche présentiel (coordonnées décimales)", tutors.length);
  const andry = tutors.find((t) => t.firstName === "Andry");
  ok(!!andry && andry.location.distanceKm !== null && andry.location.distanceKm < 1.5, "Andry trouvé, distance en km", andry?.location);
  ok(andry!.offers.length > 0 && andry!.offers[0].priceLabel.endsWith("Ar"), "offres résumées avec prix en Ar", andry?.offers);
  const online = await TutorService.searchTutors({ subjectId: maths.id, coordinates: null, format: "online" });
  ok(online.length > 0, "recherche en ligne sans coordonnées", online.length);
  await expectError(() => TutorService.searchTutors({ subjectId: maths.id, coordinates: null, format: "in_person" }), "validation_error", "présentiel sans position refusé côté client");

  const profile = await TutorService.getTutorById(andry!.id);
  ok(profile.subjectLevels && profile.subjectLevels.length >= 2, "profil public : matières × niveaux", profile.subjectLevels);
  const offerId = (await api.get<{ offers: { id: string; title: string }[] }>(`/search/tutors/${andry!.id}`, undefined, { auth: false })).offers.find((o) => o.title.includes("BAC"))!.id;
  const offer = await OfferService.getOfferById(offerId);
  ok(offer.slots.length > 0 && offer.price.amount > 0 && offer.priceLabel.includes("Ar"), "offre + créneaux (VM)", { slots: offer.slots.length, price: offer.priceLabel });
  const slot = offer.slots.find((s) => s.teachingMode === "at_home_beneficiary") ?? offer.slots[0];
  ok(!!slot.teachingMode && !!slot.dateLabel && /^\d{2}:\d{2}$/.test(slot.startTime), "créneau : mode d'enseignement + libellés locaux", slot);
  ok(offer.places.some((p) => p.type === "online"), "lieu « en ligne » exposé par l'offre", offer.places);

  // ───────────────────────────────────────────── Compte demandeur
  step("2. Compte demandeur : inscription → code → session (AuthService)");
  const pending = await AuthService.signup({ firstName: "Parent", lastName: "Front", email: requesterEmail, password: PASSWORD, phone: "+261 34 12 345 67" });
  ok(pending.status === "pending_verification" && !pending.emailVerified, "signup → utilisateur en attente", pending);
  await expectError(() => AuthService.login({ email: requesterEmail, password: PASSWORD }), "email_not_verified", "connexion avant vérification");
  await expectError(() => AuthService.verifyEmail(requesterEmail, "000000"), "invalid_code", "mauvais code");
  await expectError(() => AuthService.verifyEmail(requesterEmail, "12"), "invalid_code", "code incomplet refusé côté client");
  await AuthService.resendVerification(requesterEmail);
  const code = await emailCode(requesterEmail);
  const user = await AuthService.verifyEmail(requesterEmail, code);
  ok(user.emailVerified && user.status === "active" && !!Session.getTokens()?.accessToken, "verifyEmail ouvre la session", user);
  ok(user.tutor === null && user.selfBeneficiaryId === null && user.phone === "+261 34 12 345 67", "profil : pas tuteur, téléphone conservé", user);
  await expectError(() => AuthService.signup({ firstName: "x", lastName: "y", email: "pas-un-email", password: PASSWORD }), "validation_error", "e-mail invalide");

  // ───────────────────────────────────────────── Bénéficiaire + réservation
  step("3. Bénéficiaire et réservation (BeneficiaryService, BookingService)");
  const beneficiary = await BeneficiaryService.createBeneficiary({
    firstName: "Tiana", lastName: "Front", relationship: "child", levelId: terminale.id, objective: "remedial", difficulty: "methodological",
  });
  ok(beneficiary.level?.label === "Terminale" && beneficiary.objective === "remedial" && beneficiary.difficulty === "methodological", "bénéficiaire créé (niveau résolu)", beneficiary);
  const mine = await BeneficiaryService.getMyBeneficiaries();
  ok(mine.length === 1 && mine[0].id === beneficiary.id, "liste des bénéficiaires");

  const idempotencyKey = `front-${stamp}`;
  const request = {
    idempotencyKey,
    offerId: offer.id,
    slot: { availabilityId: slot.availabilityId, startAt: slot.startAt, placeId: slot.placeId },
    beneficiaryId: beneficiary.id,
    teachingMode: slot.teachingMode!,
    beneficiaryAddress: slot.teachingMode === "at_home_beneficiary" ? "Lot II B 12, Ankorondrano" : undefined,
    note: "Difficultés en probabilités.",
  };
  const booking = await BookingService.createBooking(request);
  ok(booking.status === "pending" && booking.viewerRole === "requester" && booking.note === "Difficultés en probabilités.", "demande envoyée (PENDING)", booking.status);
  ok(booking.offer.priceLabel.includes("Ar") && booking.slot.teachingMode === slot.teachingMode && !!booking.conversationId, "réservation : prix, mode, conversation", booking.offer);
  const again = await BookingService.createBooking(request);
  ok(again.id === booking.id, "même Idempotency-Key → même réservation (retry sans doublon)");

  const myPending = await BookingService.getMyBookings(["pending"]);
  ok(myPending.some((b) => b.id === booking.id), "onglet « En attente » (une requête, filtre de statut)", myPending.map((b) => b.status));

  // ───────────────────────────────────────────── Tuteur : demande + acceptation
  step("4. Tuteur : demande reçue, acceptation, code (AuthService, BookingService)");
  await AuthService.logout();
  const tutorUser = await AuthService.login({ email: "andry.rakoto@demo.eduloc.mg", password: "Demo12345!" });
  ok(tutorUser.tutor?.applicationStatus === "approved" && tutorUser.tutor.isVisible, "connexion tuteur : rôle tuteur approuvé", tutorUser.tutor);
  const tutorPending = await BookingService.getTutorBookings(["pending"]);
  const received = tutorPending.find((b) => b.id === booking.id);
  ok(!!received && received.viewerRole === "tutor" && received.requester.firstName === "Parent" && received.locationAddress === null, "demande reçue (adresse masquée)", received?.locationAddress);
  const accepted = await BookingService.acceptBooking(booking.id);
  ok(accepted.status === "confirmed", "acceptation → CONFIRMED", accepted.status);
  await expectError(() => BookingService.acceptBooking(booking.id), "invalid_state", "double acceptation");

  await AuthService.logout();
  await AuthService.login({ email: requesterEmail, password: PASSWORD });
  // Le créneau est maintenant CONFIRMÉ : une nouvelle demande dessus est refusée (les PENDING, eux, ne bloquent pas).
  await expectError(
    () => BookingService.createBooking({ ...request, idempotencyKey: `${idempotencyKey}-bis` }),
    "slot_unavailable",
    "créneau confirmé : nouvelle demande refusée",
  );
  const otp = await BookingService.getSessionCode(booking.id);
  ok(/^\d{3} \d{3}$/.test(otp), "code de séance affiché « 482 913 »", otp);

  // ───────────────────────────────────────────── Messagerie
  step("5. Messagerie vocale et documents (ConversationService)");
  const conversation = await ConversationService.getConversationForBooking(booking.id);
  ok(conversation.canSend && conversation.canCall && conversation.counterpartName.includes("Andry"), "conversation résolue par réservation", conversation);
  const voice = await ConversationService.sendVoiceMessage(conversation.id, { file: dataFile("audio/webm", "voice".repeat(500)), durationMs: 4200, waveform: [0.1, 0.5, 0.9] });
  ok(voice.type === "voice" && voice.isMine && voice.durationLabel.endsWith("0:04"), "vocal envoyé (VM voice)", voice);
  // Appareils mobiles : un .m4a est typé « audio/x-m4a », « audio/mp4a-latm »… → ramené à audio/mp4 (accepté par le serveur).
  ok(
    normalizeAudioMime("audio/x-m4a", "file:///cache/vocal.m4a") === "audio/mp4" &&
      normalizeAudioMime("audio/mp4a-latm", "x.m4a") === "audio/mp4" &&
      normalizeAudioMime("", "file:///cache/vocal.m4a") === "audio/mp4" &&
      normalizeAudioMime("audio/webm;codecs=opus", "blob") === "audio/webm" &&
      normalizeAudioMime("audio/wav", "x.wav") === "audio/wav",
    "types audio des appareils normalisés (m4a → audio/mp4, wav inchangé)",
  );
  await expectError(
    () => ConversationService.sendVoiceMessage(conversation.id, { file: dataFile("audio/wav", "x"), durationMs: 3000 }),
    "validation_error",
    "type audio non accepté (wav) refusé côté client",
  );
  const messages = await ConversationService.getMessages(booking.id);
  ok(messages.some((m) => m.type === "system") && messages.some((m) => m.type === "voice"), "fil : message système + vocal", messages.map((m) => m.type));
  const voiceMessage = messages.find((m) => m.type === "voice");
  const url = await ConversationService.getAttachmentUrl((voiceMessage as { attachmentId: string }).attachmentId);
  const audio = await fetch(url);
  ok(audio.status === 200 && (await audio.arrayBuffer()).byteLength === 2500, "lecture via URL signée");

  await AuthService.logout();
  await AuthService.login({ email: "andry.rakoto@demo.eduloc.mg", password: "Demo12345!" });
  const tutorConversations = await ConversationService.getConversations();
  const tutorConversation = tutorConversations.find((c) => c.id === conversation.id);
  ok(tutorConversation?.viewerRole === "tutor" && tutorConversation.unreadCount === 1 && tutorConversation.counterpartName.includes("Parent"), "tuteur : 1 non lu, interlocuteur = demandeur", tutorConversation);
  const doc = await ConversationService.sendDocument(conversation.id, dataFile("application/pdf", "%PDF-1.4 exercices", "exercices.pdf"));
  ok(doc.type === "document" && doc.fileName === "exercices.pdf" && doc.fileSizeLabel.length > 0, "document envoyé (VM document)", doc);
  await ConversationService.markRead(conversation.id);

  // ───────────────────────────────────────────── Séance + avis
  step("6. Séance (démarrage par code), fin, avis (BookingService, ReviewService)");
  await expectError(() => BookingService.startTutorSession(booking.id, "123 456"), "outside_start_window", "démarrage hors fenêtre");
  await db.query(`UPDATE bookings SET "startAt" = now() - interval '5 minutes', "endAt" = now() + interval '55 minutes' WHERE id = $1`, [booking.id]);
  await expectError(() => BookingService.startTutorSession(booking.id, "000 000"), "otp_invalid", "mauvais code de séance");
  await expectError(() => BookingService.startTutorSession(booking.id, undefined), "validation_error", "code requis");
  const started = await BookingService.startTutorSession(booking.id, otp);
  ok(started.status === "in_progress" && !!started.sessionStartedAt, "séance démarrée avec le code", started.status);
  const completed = await BookingService.completeTutorSession(booking.id);
  ok(completed.status === "completed" && !!completed.sessionDurationLabel, "séance terminée", completed.sessionDurationLabel);

  await AuthService.logout();
  await AuthService.login({ email: requesterEmail, password: PASSWORD });
  const done = await BookingService.getMyBookingById(booking.id);
  ok(done.canReview && !done.hasReview, "demandeur : peut évaluer", { canReview: done.canReview });
  await expectError(() => ReviewService.submitReview(booking.id, { rating: 0 }), "validation_error", "note hors bornes refusée");
  const review = await ReviewService.submitReview(booking.id, { rating: 5, text: "Très pédagogue." });
  ok(review.rating === 5 && review.authorFirstName === "Parent", "avis enregistré (prénom de l'auteur)", review);
  const reviews = await ReviewService.getTutorReviews(andry!.id);
  ok(reviews.some((r) => r.id === review.id), "avis public listé");

  await new Promise((r) => setTimeout(r, 6500)); // relais outbox → notifications
  const notifications = await NotificationService.getMyNotifications();
  ok(notifications.some((n) => n.type === "booking_confirmed" && n.target?.bookingId === booking.id), "notification « réservation confirmée » avec cible de navigation", notifications.slice(0, 2));
  ok(notifications.every((n) => n.timeLabel && n.dateGroup), "notifications : libellés de date calculés");
  ok((await NotificationService.getUnreadCount()) >= 2, "compteur de non-lus");
  await NotificationService.markAllRead();
  ok((await NotificationService.getUnreadCount()) === 0, "tout marquer comme lu");

  // ───────────────────────────────────────────── Candidature tuteur
  step("7. Candidature tuteur complète (TutorApplicationService) + approbation admin");
  await AuthService.logout();
  await AuthService.signup({ firstName: "Lova", lastName: "Front", email: tutorEmail, password: PASSWORD, phone: "+261 33 00 000 02" });
  await AuthService.verifyEmail(tutorEmail, await emailCode(tutorEmail));
  const skills = await TutorApplicationService.getSkillCatalog();
  const physics = skills.find((s) => s.label === "Physique-Chimie")!;
  // Autocomplétion filtrée par diplôme + création libre
  const algeBac = await TutorApplicationService.suggestSkills("alge", "bac");
  const algeLicence = await TutorApplicationService.suggestSkills("alge", "licence");
  ok(!algeBac.some((s) => s.label === "Algèbre linéaire") && algeBac.some((s) => s.label === "Mathématiques"), "suggestSkills « alge » (bac) : sans matière universitaire", algeBac.map((s) => s.label));
  ok(algeLicence.some((s) => s.label === "Algèbre linéaire" && s.levelCategories.includes("Université")), "suggestSkills « alge » (licence) : Algèbre linéaire", algeLicence.map((s) => s.label));
  const customLabel = `Algorithmique quantique ${Date.now()}`;
  const custom = await TutorApplicationService.createSkill(customLabel);
  const customAgain = await TutorApplicationService.createSkill(customLabel.toUpperCase());
  ok(custom.created && !custom.skill.isVerified && customAgain.skill.id === custom.skill.id && !customAgain.created, "createSkill : compétence libre (idempotente)", custom);
  const application = await TutorApplicationService.submitApplication({
    firstName: "Lova", lastName: "Front", email: tutorEmail, phone: "+261 33 00 000 02",
    bio: "Physicien passionné.", birthDate: "1995-04-12", experience: "5 ans", educationBackground: "Master physique",
    experiences: [{ type: "PROFESSIONAL", title: "Professeur", organization: "Lycée Test", period: "2019-2024" }],
    highestDegree: "master",
    gender: "female",
    subjects: [{ skillId: physics.id, levelIds: [terminale.id], competenceDescription: "Mécanique" }, { skillId: custom.skill.id, levelIds: [terminale.id] }],
    offers: [{ subjectId: physics.id, educationLevelId: terminale.id, title: "Physique Terminale", description: "Cours complet.", format: "both", durationMinutes: 60, price: 21000, currency: "MGA" }],
    locations: [{ label: "Ivandry", kind: "beneficiary_home", radiusKm: 5, isPrimary: true, latitude: -18.8733, longitude: 47.5311 }],
    weeklyAvailability: [{ dayOfWeek: 2, slots: [{ startTime: "18:00", endTime: "21:00", format: "both", placeIndex: 0 }] }],
    documents: [{ kind: "identity", file: dataFile("application/pdf", "%PDF-1.4 cni", "cni.pdf") }],
    introVideo: { file: dataFile("video/mp4", "x".repeat(900), "intro.mp4"), durationMs: 45000 },
  });
  ok(application.status === "pending" && application.documents.length === 1, "dossier soumis (brouillon → pièces → vidéo → envoi)", application);
  const me = await AuthService.getMe();
  ok(me.tutor?.applicationStatus === "pending" && me.tutor.isVisible === false, "/users/me : candidature en attente", me.tutor);
  const mineApp = await TutorApplicationService.getMyApplication();
  ok(mineApp?.status === "pending", "getMyApplication");

  // Validation par l'administrateur (appel direct : pas d'écran admin dans l'app mobile)
  await AuthService.logout();
  const admin = await api.post<{ accessToken: string }>("/auth/login", { email: "admin@eduloc.mg", password: "Admin12345!" }, { auth: false });
  await api.post(`/admin/tutor-applications/${application.id}/approve`, undefined, { headers: { Authorization: `Bearer ${admin.accessToken}` }, auth: false });
  await AuthService.login({ email: tutorEmail, password: PASSWORD });
  const approvedMe = await AuthService.getMe();
  ok(approvedMe.tutor?.applicationStatus === "approved" && approvedMe.tutor.isVisible, "après approbation : tuteur visible", approvedMe.tutor);
  const profileSummary = await TutorService.getMyProfile();
  ok(profileSummary.applicationStatus === "approved" && profileSummary.subjects.length === 2 && profileSummary.locations.length === 1, "profil tuteur (VM)", profileSummary);

  // ───────────────────────────────────────────── Gestion tuteur
  step("8. Offres et disponibilités (OfferService, AvailabilityService)");
  const myOffers = await OfferService.getTutorOffers();
  ok(myOffers.length === 1 && myOffers[0].isActive, "mes offres", myOffers.length);
  const updated = await OfferService.updateOffer(myOffers[0].id, { title: "Physique — révisé", price: 23000 });
  ok(updated.title.includes("révisé") && updated.price.amount === 23000, "offre modifiée", updated.price);
  const off = await OfferService.updateOfferStatus(myOffers[0].id, false);
  const on = await OfferService.updateOfferStatus(myOffers[0].id, true);
  ok(!off.isActive && on.isActive, "désactiver / réactiver une offre");
  const created = await OfferService.createOffer({ title: "Mécanique", description: "Cinématique et dynamique.", subjectId: physics.id, levelId: terminale.id, format: "online", durationMinutes: 90, price: 30000 });
  ok(created.durationMinutes === 90 && created.format === "online", "nouvelle offre", created);

  const target = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const oneOff = await AvailabilityService.createAvailability({ kind: "one_off", date: target, startTime: "14:00", endTime: "16:00", placeId: null });
  ok(oneOff.kind === "one_off" && oneOff.format === "online" && oneOff.date === target, "disponibilité ponctuelle « en ligne »", oneOff);
  const recurring = await AvailabilityService.createAvailability({ kind: "recurring", dayOfWeek: 4, startTime: "10:00", endTime: "12:00", placeId: null });
  ok(recurring.kind === "recurring" && recurring.dayLabel.startsWith("Chaque"), "disponibilité récurrente", recurring.dayLabel);
  const all = await AvailabilityService.getAvailability();
  ok(all.length >= 3, "calendrier : règles actives", all.length);
  const calendar = AvailabilityService.expandCalendar(all, []);
  ok(calendar.some((o) => o.date === target && o.startTime === "14:00"), "calendrier déplié : la plage du jour apparaît");
  await AvailabilityService.deleteAvailability(oneOff.id);
  ok(!(await AvailabilityService.getAvailability()).some((a) => a.id === oneOff.id), "suppression : la plage disparaît");
  await expectError(() => AvailabilityService.createAvailability({ kind: "one_off", date: target, startTime: "16:00", endTime: "14:00", placeId: null }), "validation_error", "plage inversée refusée côté client");

  await AuthService.logout();
  // Nettoyage : la compétence de test ne doit pas rester dans le catalogue des suggestions.
  await db.query(`UPDATE subjects SET "isActive" = false WHERE name LIKE 'Algorithmique quantique %'`);
  await db.end();
  console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} vérifications réussies, ${failed} échec(s)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error("\nÉCHEC INATTENDU :", error);
  await db.end().catch(() => undefined);
  process.exit(2);
});
