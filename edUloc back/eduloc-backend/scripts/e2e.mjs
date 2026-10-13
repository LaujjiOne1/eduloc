/**
 * Test de bout en bout de l'API contre un serveur qui tourne (docker compose + `npm run start:dev`).
 * Parcours complet : demandeur ET tuteur, de l'inscription à l'évaluation.
 *
 *   npm run db:seed        # une fois (catalogue, admin, tuteurs démo)
 *   npm run e2e            # API_URL=http://localhost:3003/api par défaut
 *
* Les codes e-mail sont retrouvés depuis leur empreinte en base : aucun fournisseur d e-mail requis.
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import pg from 'pg';
import Redis from 'ioredis';

const API = process.env.API_URL_E2E ?? `http://localhost:${process.env.PORT ?? 3003}/api`;
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

let passed = 0;
let failed = 0;
const ok = (cond, label, extra) => {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}`, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400));
  }
};
const step = (title) => console.log(`\n${title}`);

async function http(method, path, { token, body, headers, raw } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      // Pas de connexion réutilisée : la recherche du code e-mail bloque la boucle plusieurs secondes,
      // le serveur ferme alors la connexion inactive (ECONNRESET à la requête suivante).
      connection: 'close',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

/**
 * Code e-mail en cours pour cette adresse. L'outbox purge le code une fois l'e-mail envoyé, et un
 * autre process (watcher de dev) peut le faire avant nous : on retrouve donc le code depuis son
 * empreinte SHA-256(email:code) — 6 chiffres, soit 1 M d'essais (~1 s).
 */
async function emailCode(email, eventType) {
  const column = eventType === 'user.password_reset_requested' ? 'passwordResetTokenHash' : 'emailVerificationTokenHash';
  const { rows } = await db.query(`SELECT "${column}" AS hash FROM users WHERE email = $1`, [email]);
  const hash = rows[0]?.hash;
  if (!hash) throw new Error(`aucun code en attente pour ${email}`);
  for (let n = 0; n < 1_000_000; n += 1) {
    const code = String(n).padStart(6, '0');
    if (createHash('sha256').update(`${email}:${code}`).digest('hex') === hash) return code;
  }
  throw new Error(`code introuvable pour ${email}`);
}

const stamp = Date.now();
const requesterEmail = `parent.${stamp}@e2e.test`;
const newTutorEmail = `tuteur.${stamp}@e2e.test`;
const PASSWORD = 'Motdepasse123!';

// ───────────────────────────────────────────────────────────── 1. Catalogue
step('1. Catalogue & recherche publique');
const subjects = (await http('GET', '/catalog/subjects')).body;
const levels = (await http('GET', '/catalog/education-levels')).body;
ok(Array.isArray(subjects) && subjects.length > 0, 'matières disponibles', subjects);
ok(Array.isArray(levels) && levels.length > 0, 'niveaux disponibles', levels);
const maths = subjects.find((s) => s.name === 'Mathématiques');
const level3e = levels.find((l) => l.name === '3ème');
const levelTerminale = levels.find((l) => l.name === 'Terminale');

const AT = { lat: -18.9082, lng: 47.5242 }; // Analakely — coordonnées décimales (régression : IsInt)
const inPerson = await http('GET', `/search/offers?subjectId=${maths.id}&lat=${AT.lat}&lng=${AT.lng}&format=IN_PERSON&limit=10`);
ok(inPerson.status === 200 && inPerson.body.length > 0, 'recherche présentiel avec coordonnées décimales', inPerson);
const tutorHit = inPerson.body.find((r) => r.tutor.displayName?.includes('Andry'));
ok(!!tutorHit, 'le tuteur Andry est trouvé à proximité', inPerson.body.map((r) => r.tutor.displayName));
ok(tutorHit && tutorHit.distanceMeters !== null && tutorHit.distanceMeters < 1000, 'distance calculée (PostGIS)', tutorHit?.distanceMeters);
ok(tutorHit?.nextSlotAt, 'prochain créneau renseigné', tutorHit);

const online = await http('GET', `/search/offers?subjectId=${maths.id}&format=ONLINE`);
ok(online.status === 200 && online.body.length > 0, 'recherche en ligne SANS coordonnées', online);
const noCoords = await http('GET', `/search/offers?subjectId=${maths.id}&format=IN_PERSON`);
ok(noCoords.status === 400 && noCoords.body.code === 'VALIDATION_FAILED', 'présentiel sans coordonnées → 400 VALIDATION_FAILED', noCoords.body);

const tutorId = tutorHit.tutor.id;
const offerSummary = tutorHit.offers.find((o) => o.title.includes('BAC')) ?? tutorHit.offers[0];
const offer = (await http('GET', `/search/offers/${offerSummary.id}`)).body;
ok(offer.id === offerSummary.id && offer.places.length > 0, 'détail d\'offre public', offer);
const profile = (await http('GET', `/search/tutors/${tutorId}`)).body;
const reviewsBefore = profile.reviewsCount;
ok(profile.id === tutorId && profile.offers.length >= 2, 'profil public du tuteur', profile);

const today = new Date().toISOString().slice(0, 10);
const in10 = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
const slotsRes = await http('GET', `/search/tutors/${tutorId}/slots?offerId=${offer.id}&from=${today}&to=${in10}&duration=${offer.durationMinutes}`);
const slots = slotsRes.body;
ok(slotsRes.status === 200 && slots.length > 0, 'créneaux calculés sur 10 jours', slotsRes);
ok(slots.every((s) => new Date(s.startAt).getTime() >= Date.now() + 2 * 3_600_000 - 60_000), 'aucun créneau dans le délai de prévenance (2 h)');
ok(slots.every((s) => new Date(s.startAt).getUTCMinutes() % 30 === 0), 'créneaux alignés sur :00 / :30');
const badRange = await http('GET', `/search/tutors/${tutorId}/slots?offerId=${offer.id}&from=2026-01-01T00:00:00Z&to=2026-01-02`);
ok(badRange.status === 400, 'période mal formée → 400');

// ───────────────────────────────────────────────────────────── 2. Compte demandeur
step('2. Inscription, vérification par code, session');
const reg = await http('POST', '/auth/register', { body: { firstName: 'Parent', lastName: 'E2E', email: requesterEmail, password: PASSWORD, phone: '+261 34 12 345 67' } });
ok(reg.status === 201 && reg.body.status === 'PENDING_VERIFICATION', 'inscription → PENDING_VERIFICATION', reg);
const dup = await http('POST', '/auth/register', { body: { firstName: 'Parent', lastName: 'E2E', email: requesterEmail, password: PASSWORD } });
ok(dup.status === 201, 'ré-inscription d\'un compte non vérifié → reprise (code renvoyé)', dup);
const early = await http('POST', '/auth/login', { body: { email: requesterEmail, password: PASSWORD } });
ok(early.status === 403 && early.body.code === 'EMAIL_NOT_VERIFIED', 'connexion avant vérification → 403 EMAIL_NOT_VERIFIED', early.body);
const wrong = await http('POST', '/auth/verify-email', { body: { email: requesterEmail, code: '000000' } });
ok(wrong.status === 422 && wrong.body.code === 'VERIFICATION_INVALID', 'mauvais code → 422 VERIFICATION_INVALID', wrong.body);
const code = await emailCode(requesterEmail, 'user.verification_requested');
ok(/^\d{6}$/.test(code), 'code à 6 chiffres reçu', code);
const verified = await http('POST', '/auth/verify-email', { body: { email: requesterEmail, code } });
ok(verified.status === 201 && verified.body.accessToken && verified.body.refreshToken, 'vérification → session ouverte (pas de reconnexion)', verified.body);
let requesterToken = verified.body.accessToken;
let requesterRefresh = verified.body.refreshToken;

const me = (await http('GET', '/users/me', { token: requesterToken })).body;
ok(me.email === requesterEmail && me.emailVerified === true && me.status === 'ACTIVE', '/users/me : compte actif', me);
ok(me.tutor === null && me.selfBeneficiaryId === null && !('password' in me), '/users/me : tutor=null, selfBeneficiaryId=null, aucun secret', me);

const refreshed = await http('POST', '/auth/refresh', { body: { refreshToken: requesterRefresh } });
ok(refreshed.status === 201 && refreshed.body.accessToken && refreshed.body.refreshToken !== requesterRefresh, 'rotation du refresh token', refreshed.body);
const reuse = await http('POST', '/auth/refresh', { body: { refreshToken: requesterRefresh } });
ok(reuse.status === 401 && reuse.body.code === 'REFRESH_REUSE_DETECTED', 'réutilisation d\'un refresh token détectée', reuse.body);
const relog = await http('POST', '/auth/login', { body: { email: requesterEmail, password: PASSWORD } });
ok(relog.status === 201, 'connexion par mot de passe', relog.body);
requesterToken = relog.body.accessToken;
requesterRefresh = relog.body.refreshToken;

// ───────────────────────────────────────────────────────────── 3. Bénéficiaire & réservation
step('3. Bénéficiaire et demande de réservation');
const child = await http('POST', '/beneficiaries', {
  token: requesterToken,
  body: { firstName: 'Tiana', lastName: 'E2E', relationship: 'CHILD', educationLevelId: levelTerminale.id, objective: 'REMEDIAL', difficultyType: 'METHODOLOGICAL' },
});
ok(child.status === 201 && child.body.id, 'création du bénéficiaire', child);
const benef = child.body;
const selfA = await http('POST', '/beneficiaries/self', { token: requesterToken, body: { educationLevelId: levelTerminale.id } });
const selfB = await http('POST', '/beneficiaries/self', { token: requesterToken, body: {} });
const selfC = await http('POST', '/beneficiaries', { token: requesterToken, body: { firstName: 'Autre', relationship: 'SELF' } });
ok(selfA.status === 201 && selfA.body.relationship === 'SELF' && selfA.body.firstName === 'Parent' && selfA.body.educationLevelId === levelTerminale.id, '« Pour moi » : bénéficiaire créé depuis le compte (aucune saisie)', selfA.body);
ok(selfB.body.id === selfA.body.id && selfC.body.id === selfA.body.id, '« Pour moi » : idempotent, un seul « moi-même » par compte', [selfB.body.id, selfC.body.id]);
const list = await http('GET', '/beneficiaries', { token: requesterToken });
ok(list.body.length === 2 && list.body.filter((b) => b.relationship === 'SELF').length === 1, 'liste des bénéficiaires (enfant + moi-même)', list.body.length);

const slot = slots.find((s) => s.teachingMode === 'AT_HOME_BENEFICIARY') ?? slots[0];
const bookingBody = {
  offerId: offer.id,
  beneficiaryId: benef.id,
  startAt: slot.startAt,
  teachingMode: slot.teachingMode,
  placeId: slot.placeId ?? undefined,
  requesterNote: 'Difficultés en probabilités.',
  ...(slot.teachingMode === 'AT_HOME_BENEFICIARY' ? { beneficiaryAddress: 'Lot II B 12, Ankorondrano' } : {}),
};
const idem = `e2e-${stamp}-booking`;
const booking = await http('POST', '/bookings', { token: requesterToken, body: bookingBody, headers: { 'idempotency-key': idem } });
ok(booking.status === 201 && booking.body.status === 'PENDING', 'réservation → PENDING', booking);
const again = await http('POST', '/bookings', { token: requesterToken, body: bookingBody, headers: { 'idempotency-key': idem } });
ok(again.status === 201 && again.body.id === booking.body.id, 'Idempotency-Key : même réponse, pas de doublon', again.body);
const bk = booking.body;
ok(bk.viewerRole === 'REQUESTER' && bk.conversationId, 'réservation : viewerRole + conversationId', bk);
ok(bk.price.amount && bk.price.currency === 'MGA', 'prix figé (snapshot)', bk.price);

const tooSoon = await http('POST', '/bookings', { token: requesterToken, body: { ...bookingBody, startAt: new Date(Date.now() + 3_600_000).toISOString() } });
ok([422].includes(tooSoon.status) && ['SLOT_TOO_SOON', 'SLOT_OUTSIDE_AVAILABILITY'].includes(tooSoon.body.code), 'créneau trop proche refusé', tooSoon.body);
const unauth = await http('POST', '/bookings', { body: bookingBody });
ok(unauth.status === 401, 'réservation sans jeton → 401', unauth.body);

// ───────────────────────────────────────────────────────────── 4. Tuteur
step('4. Tuteur : demande reçue, notification, acceptation');
const tLogin = await http('POST', '/auth/login', { body: { email: 'andry.rakoto@demo.eduloc.mg', password: 'Demo12345!' } });
ok(tLogin.status === 201, 'connexion du tuteur démo', tLogin.body);
const tutorToken = tLogin.body.accessToken;
const tutorMe = (await http('GET', '/users/me', { token: tutorToken })).body;
ok(tutorMe.tutor?.applicationStatus === 'APPROVED' && tutorMe.tutor.isVisible === true && tutorMe.tutor.tutorProfileId === tutorId, '/users/me : rôle tuteur approuvé', tutorMe.tutor);

const pendingList = await http('GET', '/bookings?role=tutor&status=PENDING', { token: tutorToken });
ok(pendingList.body.some((b) => b.id === bk.id), 'demande visible dans la liste « en attente » du tuteur', pendingList.body.map((b) => b.id));
const tView = (await http('GET', `/bookings/${bk.id}`, { token: tutorToken })).body;
ok(tView.viewerRole === 'TUTOR' && tView.locationAddress === null, 'adresse du bénéficiaire masquée tant que PENDING', tView.locationAddress);
const multi = await http('GET', '/bookings?role=tutor&status=PENDING,CONFIRMED', { token: tutorToken });
ok(multi.status === 200, 'filtre multi-statuts (PENDING,CONFIRMED)', multi.body);

const forbidden = await http('POST', `/bookings/${bk.id}/accept`, { token: requesterToken });
ok(forbidden.status === 403 && forbidden.body.code === 'TUTOR_NOT_APPROVED', 'le demandeur ne peut pas accepter', forbidden.body);

await new Promise((r) => setTimeout(r, 6500)); // laisse le relay créer les notifications
const tNotifs = await http('GET', '/notifications', { token: tutorToken });
ok(tNotifs.body.some((n) => n.type === 'BOOKING_REQUEST' && n.data?.bookingId === bk.id), 'notification « nouvelle demande » persistée', tNotifs.body.slice(0, 2));

const accepted = await http('POST', `/bookings/${bk.id}/accept`, { token: tutorToken });
ok(accepted.status === 201 && accepted.body.status === 'CONFIRMED', 'acceptation → CONFIRMED', accepted);
const second = await http('POST', `/bookings/${bk.id}/accept`, { token: tutorToken });
ok(second.status === 409 && second.body.code === 'INVALID_TRANSITION', 'double acceptation → 409 INVALID_TRANSITION', second.body);
const otp = await http('GET', `/bookings/${bk.id}/otp`, { token: requesterToken });
ok(/^\d{6}$/.test(otp.body.otp), 'le demandeur lit le code de séance', otp.body);
const otpTutor = await http('GET', `/bookings/${bk.id}/otp`, { token: tutorToken });
ok(otpTutor.status === 404, 'le tuteur ne peut PAS lire le code', otpTutor.body);

// ───────────────────────────────────────────────────────────── 5. Messagerie vocale
step('5. Conversation, vocal, document, non-lus');
const convs = (await http('GET', '/conversations', { token: requesterToken })).body;
const conv = convs.items.find((c) => c.id === bk.conversationId);
ok(conv && conv.viewerRole === 'REQUESTER' && conv.tutor.displayName && conv.canSend === true && conv.canCall === true, 'conversation enrichie (tuteur, canSend, canCall)', conv);
ok(conv?.lastMessagePreview, 'aperçu du dernier message', conv);

const upload = await http('POST', `/conversations/${conv.id}/uploads`, { token: requesterToken, body: { kind: 'VOICE', mimeType: 'audio/webm', sizeBytes: 2048, durationMs: 4200 } });
ok(upload.status === 201 && upload.body.signedUrl && upload.body.uploadId, 'ticket d\'upload', upload);
const wrongType = await http('POST', `/conversations/${conv.id}/uploads`, { token: requesterToken, body: { kind: 'VOICE', mimeType: 'application/pdf', sizeBytes: 100, durationMs: 1000 } });
ok(wrongType.status === 422 && wrongType.body.code === 'MIME_TYPE_NOT_ALLOWED', 'type MIME refusé', wrongType.body);
const noFile = await http('POST', `/conversations/${conv.id}/messages`, { token: requesterToken, body: { type: 'VOICE', uploadId: upload.body.uploadId, clientMessageId: crypto.randomUUID() } });
ok(noFile.status === 422 && noFile.body.code === 'UPLOAD_NOT_FOUND', 'envoi sans fichier téléversé refusé', noFile.body);
// upload consommé par l'essai ci-dessus → nouveau ticket
const upload2 = await http('POST', `/conversations/${conv.id}/uploads`, { token: requesterToken, body: { kind: 'VOICE', mimeType: 'audio/webm', sizeBytes: 2048, durationMs: 4200 } });
const bytes = Buffer.alloc(2048, 7);
const put = await fetch(upload2.body.signedUrl, { method: 'PUT', headers: { 'content-type': 'audio/webm' }, body: bytes });
ok(put.status === 200, 'PUT direct vers le stockage', put.status);
const clientMessageId = crypto.randomUUID();
const msgBody = { type: 'VOICE', uploadId: upload2.body.uploadId, clientMessageId, waveform: [0.1, 0.5, 0.9, 0.4] };
const sent = await http('POST', `/conversations/${conv.id}/messages`, { token: requesterToken, body: msgBody });
ok(sent.status === 201 && sent.body.isMine === true && sent.body.attachment?.durationMs === 4200 && sent.body.attachment.waveform.length === 4, 'vocal envoyé (DTO complet)', sent.body);
const retry = await http('POST', `/conversations/${conv.id}/messages`, { token: requesterToken, body: msgBody });
ok(retry.status === 201 && retry.body.id === sent.body.id, 'retry avec le même clientMessageId : même message', retry.body);

const tConvs = (await http('GET', '/conversations', { token: tutorToken })).body;
const tConv = tConvs.items.find((c) => c.id === conv.id);
ok(tConv && tConv.viewerRole === 'TUTOR' && tConv.unreadCount === 1, 'tuteur : 1 message non lu', tConv);
const msgs = (await http('GET', `/conversations/${conv.id}/messages`, { token: tutorToken })).body;
const voice = msgs.items.find((m) => m.type === 'VOICE');
ok(voice && voice.isMine === false && voice.senderFirstName === 'Parent', 'tuteur : vocal reçu (isMine=false, expéditeur)', voice);
ok(msgs.items.some((m) => m.type === 'SYSTEM'), 'message système conservé dans le fil');
// Appareils mobiles : un .m4a arrive typé « audio/x-m4a » / « audio/mp4a-latm » → ramené à audio/mp4.
const m4a = await http('POST', `/conversations/${conv.id}/uploads`, { token: requesterToken, body: { kind: 'VOICE', mimeType: 'audio/x-m4a', sizeBytes: 1500, durationMs: 2500 } });
const m4aPut = await fetch(m4a.body.signedUrl, { method: 'PUT', headers: { 'content-type': 'audio/mp4' }, body: Buffer.alloc(1500, 3) });
const m4aSent = await http('POST', `/conversations/${conv.id}/messages`, { token: requesterToken, body: { type: 'VOICE', uploadId: m4a.body.uploadId, clientMessageId: crypto.randomUUID() } });
ok(m4a.status === 201 && m4aPut.status === 200 && m4aSent.status === 201 && m4aSent.body.attachment?.mimeType === 'audio/mp4', 'vocal mobile (.m4a « audio/x-m4a ») accepté et enregistré en audio/mp4', [m4a.status, m4aPut.status, m4aSent.status, m4aSent.body.attachment?.mimeType]);
const onlyDocs = await http('GET', `/conversations/${conv.id}/messages?type=DOCUMENT`, { token: tutorToken });
ok(onlyDocs.status === 200 && onlyDocs.body.items.length === 0, 'filtre ?type=DOCUMENT accepté', onlyDocs.body);
const urlRes = await http('GET', `/attachments/${voice.attachment.id}/url`, { token: tutorToken });
ok(urlRes.status === 200 && typeof urlRes.body.url === 'string', 'URL de lecture signée ({url})', urlRes.body);
const audio = await fetch(urlRes.body.url);
ok(audio.status === 200 && (await audio.arrayBuffer()).byteLength === 2048, 'lecture du fichier via l\'URL signée');
const strangerAtt = await http('GET', `/attachments/${voice.attachment.id}/url`, { token: (await http('POST', '/auth/login', { body: { email: 'hery.rasolofo@demo.eduloc.mg', password: 'Demo12345!' } })).body.accessToken });
ok(strangerAtt.status === 404, 'un tiers ne peut pas lire la pièce jointe', strangerAtt.body);
const listened = await http('POST', `/messages/${voice.id}/listened`, { token: tutorToken });
ok(listened.status === 201 && listened.body.ok, 'accusé d\'écoute');
const read = await http('POST', `/conversations/${conv.id}/read`, { token: tutorToken });
const tConv2 = (await http('GET', '/conversations', { token: tutorToken })).body.items.find((c) => c.id === conv.id);
ok(read.status === 201 && tConv2.unreadCount === 0, 'marquage lu → non-lus à 0', tConv2);

const doc = await http('POST', `/conversations/${conv.id}/uploads`, { token: tutorToken, body: { kind: 'DOCUMENT', mimeType: 'application/pdf', sizeBytes: 300, fileName: 'exercices.pdf' } });
await fetch(doc.body.signedUrl, { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: Buffer.from('%PDF-1.4 test') });
const docMsg = await http('POST', `/conversations/${conv.id}/messages`, { token: tutorToken, body: { type: 'DOCUMENT', uploadId: doc.body.uploadId, clientMessageId: crypto.randomUUID() } });
ok(docMsg.status === 201 && docMsg.body.attachment.fileName === 'exercices.pdf', 'document envoyé par le tuteur', docMsg.body);
const docsOnly = await http('GET', `/conversations/${conv.id}/messages?type=DOCUMENT`, { token: requesterToken });
ok(docsOnly.body.items.length === 1, 'liste des documents', docsOnly.body);

const textMsg = await http('POST', `/conversations/${conv.id}/messages`, { token: requesterToken, body: { type: 'TEXT', content: 'salut', clientMessageId: crypto.randomUUID() } });
ok(textMsg.status === 400, 'les messages texte sont refusés (ADR-04)', textMsg.body);

// ───────────────────────────────────────────────────────────── 6. Séance
step('6. Démarrage par code, fin de séance, avis');
const early2 = await http('POST', `/bookings/${bk.id}/start`, { token: tutorToken, body: { otp: otp.body.otp } });
ok(early2.status === 422 && early2.body.code === 'SESSION_TOO_EARLY', 'démarrage hors fenêtre → SESSION_TOO_EARLY', early2.body);
// On « avance le temps » : la séance commence maintenant (la fenêtre de démarrage est testée ci-dessus).
await db.query(`UPDATE bookings SET "startAt" = now() - interval '5 minutes', "endAt" = now() + interval '55 minutes' WHERE id = $1`, [bk.id]);
const badOtp = await http('POST', `/bookings/${bk.id}/start`, { token: tutorToken, body: { otp: otp.body.otp === '123456' ? '654321' : '123456' } });
ok(badOtp.status === 422 && badOtp.body.code === 'OTP_INVALID', 'mauvais code → OTP_INVALID', badOtp.body);
const started = await http('POST', `/bookings/${bk.id}/start`, { token: tutorToken, body: { otp: otp.body.otp } });
ok(started.status === 201 && started.body.status === 'IN_PROGRESS' && started.body.startedAt, 'bon code → IN_PROGRESS', started.body);
const noOtpNow = await http('GET', `/bookings/${bk.id}/otp`, { token: requesterToken });
ok(noOtpNow.status === 422 && noOtpNow.body.code === 'OTP_NOT_AVAILABLE', 'code de séance consommé', noOtpNow.body);
const earlyReview = await http('POST', '/reviews', { token: requesterToken, body: { bookingId: bk.id, rating: 5 } });
ok(earlyReview.status === 422 && earlyReview.body.code === 'BOOKING_NOT_COMPLETED', 'avis avant la fin refusé', earlyReview.body);
const completed = await http('POST', `/bookings/${bk.id}/complete`, { token: tutorToken });
ok(completed.status === 201 && completed.body.status === 'COMPLETED', 'fin de séance → COMPLETED', completed.body);
const review = await http('POST', '/reviews', { token: requesterToken, body: { bookingId: bk.id, rating: 5, text: 'Très pédagogue.' } });
ok(review.status === 201 && review.body.rating === 5, 'avis enregistré', review.body);
const reviewAgain = await http('POST', '/reviews', { token: requesterToken, body: { bookingId: bk.id, rating: 1 } });
ok(reviewAgain.status === 201 && reviewAgain.body.id === review.body.id, 'avis idempotent (un seul par séance)', reviewAgain.body);
const reviews = await http('GET', `/reviews/tutors/${tutorId}`);
ok(reviews.body.some((r) => r.id === review.body.id && r.authorFirstName === 'Parent') && reviews.body.every((r) => !('requesterId' in r)), "avis publics : prénom de l'auteur, aucun identifiant de compte", reviews.body[0]);
const done = (await http('GET', `/bookings/${bk.id}`, { token: requesterToken })).body;
ok(done.hasReview === true && done.status === 'COMPLETED' && done.completedAt, 'réservation : hasReview, completedAt', done);

await new Promise((r) => setTimeout(r, 6500));
const pub = (await http('GET', `/search/tutors/${tutorId}`)).body;
ok(pub.reviewsCount === reviewsBefore + 1, "note agrégée du tuteur (cache invalidé par l'outbox)", { r: pub.rating, n: pub.reviewsCount, avant: reviewsBefore });
const rNotifs = (await http('GET', '/notifications', { token: requesterToken })).body;
const kinds = rNotifs.map((n) => n.type);
ok(kinds.includes('BOOKING_CONFIRMED') && kinds.includes('SESSION_STARTED') && kinds.includes('REVIEW_REQUEST'), 'notifications demandeur : confirmée, démarrée, avis demandé', kinds);
const unreadOnly = await http('GET', '/notifications?unread=true', { token: requesterToken });
ok(unreadOnly.body.length === rNotifs.length, 'filtre unread=true', unreadOnly.body.length);
const unreadBefore = await http('GET', '/notifications/unread-count', { token: requesterToken });
ok(unreadBefore.status === 200 && unreadBefore.body.count === rNotifs.filter((n) => !n.isRead).length && unreadBefore.body.count > 0, 'compteur de notifications non lues', unreadBefore.body);
const unreadAnon = await http('GET', '/notifications/unread-count');
ok(unreadAnon.status === 401, 'compteur : authentification requise', unreadAnon.status);
const devToken = `ExponentPushToken[e2e-${stamp}-device-token]`;
const devReg = await http('POST', '/devices', { token: requesterToken, body: { token: devToken, platform: 'ANDROID' } });
const devOther = await http('POST', '/devices/unregister', { token: tutorToken, body: { token: devToken } });
const devKept = (await db.query('SELECT 1 FROM device_tokens WHERE token = $1', [devToken])).rowCount;
const devUnreg = await http('POST', '/devices/unregister', { token: requesterToken, body: { token: devToken } });
const devLeft = (await db.query('SELECT 1 FROM device_tokens WHERE token = $1', [devToken])).rowCount;
ok(devReg.status === 201 && devOther.status === 201 && devKept === 1, "un autre compte ne peut pas retirer l'appareil", [devReg.status, devKept]);
ok(devUnreg.status === 201 && devLeft === 0, 'appareil retiré par son propriétaire (déconnexion)', [devUnreg.status, devLeft]);
const readOne = await http('POST', `/notifications/${rNotifs[0].id}/read`, { token: requesterToken });
const readAll = await http('POST', '/notifications/read', { token: requesterToken });
const afterRead = await http('GET', '/notifications?unread=true', { token: requesterToken });
ok(readOne.status === 201 && readAll.status === 201 && afterRead.body.length === 0, 'notifications marquées lues', afterRead.body.length);
const tNotifs2 = (await http('GET', '/notifications', { token: tutorToken })).body;
ok(tNotifs2.some((n) => n.title === 'Nouvel avis'), 'le tuteur est notifié de l\'avis (bon destinataire)', tNotifs2.map((n) => n.title));

// ───────────────────────────────────────────────────────────── 7. Refus & annulation
step('7. Refus, annulation, conflit d\'accord');
const slotB = slots.filter((s) => s.startAt !== slot.startAt)[3] ?? slots[5];
const bookingB = await http('POST', '/bookings', { token: requesterToken, body: { ...bookingBody, startAt: slotB.startAt, teachingMode: slotB.teachingMode, placeId: slotB.placeId ?? undefined, ...(slotB.teachingMode === 'AT_HOME_BENEFICIARY' ? { beneficiaryAddress: 'Ivandry' } : { beneficiaryAddress: undefined }) } });
ok(bookingB.status === 201, 'deuxième demande', bookingB.body);
const refused = await http('POST', `/bookings/${bookingB.body.id}/refuse`, { token: tutorToken, body: { reason: 'Indisponible ce jour-là.' } });
ok(refused.status === 201 && refused.body.status === 'REFUSED' && refused.body.refusalReason, 'refus motivé → REFUSED', refused.body);
const cancelRefused = await http('POST', `/bookings/${bookingB.body.id}/cancel`, { token: requesterToken, body: {} });
ok(cancelRefused.status === 409, 'annuler une demande refusée → 409', cancelRefused.body);
const bookingC = await http('POST', '/bookings', { token: requesterToken, body: { ...bookingBody, startAt: slotB.startAt, teachingMode: slotB.teachingMode, placeId: slotB.placeId ?? undefined, ...(slotB.teachingMode === 'AT_HOME_BENEFICIARY' ? { beneficiaryAddress: 'Ivandry' } : { beneficiaryAddress: undefined }) }, headers: { 'idempotency-key': `e2e-${stamp}-C` } });
const cancelled = await http('POST', `/bookings/${bookingC.body.id}/cancel`, { token: requesterToken, body: { reason: 'Changement de programme.' } });
ok(cancelled.status === 201 && cancelled.body.status === 'CANCELLED' && cancelled.body.cancelledBy === 'REQUESTER', 'annulation par le demandeur', cancelled.body);
const history = await http('GET', '/bookings?role=requester&status=COMPLETED,CANCELLED,REFUSED', { token: requesterToken });
ok(history.body.length === 3, 'historique : 3 réservations clôturées', history.body.map((b) => b.status));
const convOld = (await http('GET', `/bookings/${bk.id}`, { token: requesterToken })).body;
ok(convOld.conversationId === bk.conversationId, 'conversationId conservé sur une réservation plus ancienne', convOld.conversationId);

// Demandes concurrentes sur un même horaire : le tuteur est prévenu avant d'accepter.
const slotBody = { ...bookingBody, startAt: slotB.startAt, teachingMode: slotB.teachingMode, placeId: slotB.placeId ?? undefined, ...(slotB.teachingMode === 'AT_HOME_BENEFICIARY' ? { beneficiaryAddress: 'Ivandry' } : { beneficiaryAddress: undefined }) };
const bookingD = await http('POST', '/bookings', { token: requesterToken, body: slotBody, headers: { 'idempotency-key': `e2e-${stamp}-D` } });
const bookingE = await http('POST', '/bookings', { token: requesterToken, body: slotBody, headers: { 'idempotency-key': `e2e-${stamp}-E` } });
ok(bookingD.status === 201 && bookingE.status === 201, 'deux demandes en attente sur le même horaire', [bookingD.body, bookingE.body]);
const dTutor = (await http('GET', `/bookings/${bookingD.body.id}`, { token: tutorToken })).body;
const eTutor = (await http('GET', `/bookings/${bookingE.body.id}`, { token: tutorToken })).body;
ok(dTutor.competingRequests?.length === 1 && dTutor.competingRequests[0].id === bookingE.body.id && eTutor.competingRequests?.length === 1 && eTutor.competingRequests[0].id === bookingD.body.id, 'le tuteur voit les demandes concurrentes (réciproque)', [dTutor.competingRequests, eTutor.competingRequests]);
const dRequester = (await http('GET', `/bookings/${bookingD.body.id}`, { token: requesterToken })).body;
ok(Array.isArray(dRequester.competingRequests) && dRequester.competingRequests.length === 0, 'le demandeur ne voit pas les concurrentes', dRequester.competingRequests);
const listTutor = (await http('GET', '/bookings?role=tutor&status=PENDING', { token: tutorToken })).body;
ok(listTutor.find((b) => b.id === bookingD.body.id)?.competingRequests?.length === 1, 'la liste tuteur porte aussi les concurrentes', listTutor.map((b) => b.competingRequests?.length));
await new Promise((r) => setTimeout(r, 7000));
const tNotifsC = (await http('GET', '/notifications', { token: tutorToken })).body;
ok(tNotifsC.some((n) => /même horaire/.test(n.message) && /refusera automatiquement/.test(n.message)), 'notification : avertissement de créneau déjà demandé', tNotifsC.slice(0, 4).map((n) => n.message));
const acceptD = await http('POST', `/bookings/${bookingD.body.id}/accept`, { token: tutorToken });
const eAfter = (await http('GET', `/bookings/${bookingE.body.id}`, { token: requesterToken })).body;
ok(acceptD.status === 201 && eAfter.status === 'REFUSED', "accepter une demande refuse automatiquement l'autre", [acceptD.status, eAfter.status]);
// Alarme de cours : paramètre par compte (activée / délai) + rappel avant la séance pour chaque partie qui l'a activée.
ok(me.lessonAlarm?.enabled === true && me.lessonAlarm?.leadMinutes === 30, 'alarme de cours : activée, 30 min par défaut', me.lessonAlarm);
const badLead = await http('PATCH', '/users/me', { token: requesterToken, body: { lessonAlarmLeadMinutes: 7 } });
ok(badLead.status === 400, 'alarme : délai hors choix refusé', badLead.body);
const tutorOff = await http('PATCH', '/users/me', { token: tutorToken, body: { lessonAlarmEnabled: false } });
ok(tutorOff.status === 200 && tutorOff.body.lessonAlarm.enabled === false && tutorOff.body.lessonAlarm.leadMinutes === 30, 'alarme : le tuteur la désactive (son compte seulement)', tutorOff.body.lessonAlarm);
ok((await http('GET', '/users/me', { token: requesterToken })).body.lessonAlarm.enabled === true, "alarme : indépendante d'un compte à l'autre", null);
await db.query(`UPDATE bookings SET "startAt" = now() + interval '20 minutes', "endAt" = now() + interval '80 minutes' WHERE id = $1`, [bookingD.body.id]);
let reminder = null;
for (let i = 0; i < 16 && !reminder; i += 1) {
  await new Promise((r) => setTimeout(r, 5000));
  reminder = (await http('GET', '/notifications', { token: requesterToken })).body.find((n) => n.type === 'REMINDER' && n.data?.bookingId === bookingD.body.id);
}
ok(reminder && /Cours dans/.test(reminder.title), 'alarme : le demandeur reçoit le rappel avant la séance', reminder);
const tutorReminder = (await http('GET', '/notifications', { token: tutorToken })).body.find((n) => n.type === 'REMINDER' && n.data?.bookingId === bookingD.body.id);
ok(!tutorReminder, 'alarme : le tuteur (désactivée) ne reçoit rien', tutorReminder);
await new Promise((r) => setTimeout(r, 65_000));
const reminders = (await http('GET', '/notifications', { token: requesterToken })).body.filter((n) => n.type === 'REMINDER' && n.data?.bookingId === bookingD.body.id);
ok(reminders.length === 1, 'alarme : un seul rappel par séance', reminders.length);
await http('PATCH', '/users/me', { token: tutorToken, body: { lessonAlarmEnabled: true } });
// Séance de test proche de son début : on la clôt directement (l'annulation métier est hors sujet ici).
await db.query(`UPDATE bookings SET status = 'CANCELLED' WHERE id = $1`, [bookingD.body.id]);

// ───────────────────────────────────────────────────────────── 8. Candidature tuteur
step('8. Candidature tuteur complète + validation admin');
const tReg = await http('POST', '/auth/register', { body: { firstName: 'Lova', lastName: 'Nouveau', email: newTutorEmail, password: PASSWORD, phone: '+261 33 00 000 01' } });
const tCode = await emailCode(newTutorEmail, 'user.verification_requested');
const tVerified = await http('POST', '/auth/verify-email', { body: { email: newTutorEmail, code: tCode } });
ok(tReg.status === 201 && tVerified.status === 201, 'compte tuteur créé et vérifié', tVerified.body);
const nt = tVerified.body.accessToken;
const physics = subjects.find((s) => s.name === 'Physique-Chimie');
const oneOffDate = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
const appInput = {
  firstName: 'Lova', lastName: 'Nouveau', email: newTutorEmail, phone: '+261 33 00 000 01',
  bio: 'Physicien passionné.', gender: 'FEMALE', birthDate: '1995-04-12', experience: '5 ans', educationBackground: 'Master physique',
  experiences: [{ type: 'PROFESSIONAL', title: 'Professeur', organization: 'Lycée Test', period: '2019-2024' }],
  subjects: [{ subjectId: physics.id, educationLevelId: levelTerminale.id, competenceDescription: 'Mécanique' }],
  offers: [{ subjectId: physics.id, educationLevelId: levelTerminale.id, title: 'Physique Terminale', description: 'Cours complet.', format: 'BOTH', durationMinutes: 60, price: 21000, currency: 'MGA' }],
  places: [{ label: 'Ivandry', address: 'Ivandry', latitude: -18.8733, longitude: 47.5311, radiusMeters: 5000, type: 'BENEFICIARY_HOME', isPrimary: true }],
  availabilities: [
    { dayOfWeek: 2, startTime: '18:00', endTime: '21:00', format: 'BOTH', placeIndex: 0 },
    // Ponctuelle : un jour précis, une seule fois (en ligne uniquement).
    { dayOfWeek: new Date(`${oneOffDate}T00:00:00Z`).getUTCDay(), date: oneOffDate, startTime: '09:00', endTime: '11:00', format: 'ONLINE' },
  ],
};
// Compétences : autocomplétion filtrée par diplôme + création libre.
const levelLicence = levels.find((l) => l.name === 'Licence 1');
ok(levelLicence?.requiredDegree === 'LICENCE' && levelTerminale.requiredDegree === 'BAC', 'niveaux : diplôme requis exposé', [levelLicence?.requiredDegree, levelTerminale.requiredDegree]);
const sugBac = await http('GET', '/catalog/subjects/suggest?q=alge&degree=BAC', { token: nt });
const sugLic = await http('GET', '/catalog/subjects/suggest?q=alge&degree=LICENCE', { token: nt });
ok(sugBac.status === 200 && !sugBac.body.some((s) => s.name === 'Algèbre linéaire') && sugBac.body.some((s) => s.name === 'Mathématiques'), 'suggestions « alge » (Bac) : matières universitaires masquées', sugBac.body.map((s) => s.name));
ok(sugLic.body.some((s) => s.name === 'Algèbre linéaire') && sugLic.body.some((s) => s.name === 'Algèbre abstraite'), 'suggestions « alge » (Licence) : algèbre linéaire + abstraite', sugLic.body.map((s) => s.name));
const sugAccent = await http('GET', '/catalog/subjects/suggest?q=ALGEBRE%20LIN&degree=MASTER', { token: nt });
ok(sugAccent.body[0]?.name === 'Algèbre linéaire', 'recherche insensible à la casse et aux accents', sugAccent.body.map((s) => s.name));
const sugEmpty = await http('GET', '/catalog/subjects/suggest?degree=BAC', { token: nt });
ok(sugEmpty.body.length > 0 && sugEmpty.body.length <= 8, 'sans saisie : propositions du niveau (max 8)', sugEmpty.body.length);
const sugAnon = await http('GET', '/catalog/subjects/suggest?q=alge');
ok(sugAnon.status === 401, 'suggestions : authentification requise', sugAnon.status);
const customName = `Algorithmique quantique ${stamp}`;
const sugNone = await http('GET', `/catalog/subjects/suggest?q=${encodeURIComponent(customName)}&degree=MASTER`, { token: nt });
ok(sugNone.body.length === 0, "compétence rare : aucune suggestion (→ proposer l'ajout)", sugNone.body);
const created = await http('POST', '/catalog/subjects', { token: nt, body: { name: `  algorithmique   quantique ${stamp} ` } });
ok(created.status === 201 && created.body.created === true && created.body.subject.isVerified === false && created.body.subject.name === customName, "création libre d'une compétence (non vérifiée)", created.body);
const customId = created.body.subject.id;
const createdAgain = await http('POST', '/catalog/subjects', { token: nt, body: { name: customName.toUpperCase() } });
ok(createdAgain.body.created === false && createdAgain.body.subject.id === customId, 'création idempotente (casse ignorée)', createdAgain.body);
const dupVerified = await http('POST', '/catalog/subjects', { token: nt, body: { name: 'algebre LINEAIRE' } });
ok(dupVerified.body.created === false && dupVerified.body.subject.name === 'Algèbre linéaire', "nom proche d'une compétence du catalogue → réutilisée (accents ignorés)", dupVerified.body);
const badName = await http('POST', '/catalog/subjects', { token: nt, body: { name: '<script>' } });
ok(badName.status === 400, 'nom invalide refusé', badName.body);
const ownSuggest = await http('GET', `/catalog/subjects/suggest?q=${encodeURIComponent(customName)}&degree=BAC`, { token: nt });
const otherSuggest = await http('GET', `/catalog/subjects/suggest?q=${encodeURIComponent(customName)}&degree=BAC`, { token: requesterToken });
ok(ownSuggest.body.some((s) => s.id === customId) && !otherSuggest.body.some((s) => s.id === customId), 'compétence créée : visible de son auteur seulement', [ownSuggest.body.length, otherSuggest.body.length]);
const publicList = await http('GET', '/catalog/subjects');
ok(!publicList.body.some((s) => s.id === customId), 'catalogue public : compétence non vérifiée absente', publicList.body.length);

// Qualification : le diplôme borne les niveaux déclarables.
const algebra = subjects.find((s) => s.name === 'Algèbre linéaire');
const notQualified = await http('POST', '/tutor-applications', { token: nt, body: { ...appInput, highestDegree: 'BAC', subjects: [{ subjectId: physics.id, educationLevelId: levelLicence.id }], offers: [] } });
ok(notQualified.status === 422 && notQualified.body.code === 'LEVEL_NOT_QUALIFIED', 'bachelier : niveau universitaire refusé', notQualified.body);
const noDegreeUni = await http('POST', '/tutor-applications', { token: nt, body: { ...appInput, subjects: [{ subjectId: physics.id, educationLevelId: levelLicence.id }], offers: [] } });
ok(noDegreeUni.status === 422 && noDegreeUni.body.code === 'LEVEL_NOT_QUALIFIED', 'diplôme absent : plafond prudent (Bac)', noDegreeUni.body);
const wrongLevel = await http('POST', '/tutor-applications', { token: nt, body: { ...appInput, highestDegree: 'MASTER', subjects: [{ subjectId: algebra.id, educationLevelId: levelTerminale.id }], offers: [] } });
ok(wrongLevel.status === 422 && wrongLevel.body.code === 'SUBJECT_LEVEL_MISMATCH', 'matière universitaire déclarée au lycée → SUBJECT_LEVEL_MISMATCH', wrongLevel.body);

// Disponibilités ponctuelles : date cohérente avec le jour, à venir.
const slotOf = (patch) => ({ ...appInput, highestDegree: 'MASTER', availabilities: [{ dayOfWeek: 2, startTime: '18:00', endTime: '21:00', format: 'ONLINE', ...patch }] });
const wrongWeekday = await http('POST', '/tutor-applications', { token: nt, body: slotOf({ dayOfWeek: (new Date(`${oneOffDate}T00:00:00Z`).getUTCDay() + 1) % 7, date: oneOffDate }) });
const pastDate = await http('POST', '/tutor-applications', { token: nt, body: slotOf({ dayOfWeek: new Date('2020-01-07T00:00:00Z').getUTCDay(), date: '2020-01-07' }) });
const impossibleDate = await http('POST', '/tutor-applications', { token: nt, body: slotOf({ date: '2030-02-31' }) });
ok([wrongWeekday, pastDate, impossibleDate].every((r) => r.status === 422 && r.body.code === 'AVAILABILITY_DATE_INVALID'), 'date ponctuelle incohérente / passée / impossible refusée', [wrongWeekday.body.code, pastDate.body.code, impossibleDate.body.code]);

const draft = await http('POST', '/tutor-applications', { token: nt, body: { ...appInput, highestDegree: 'MASTER' } });
ok(draft.status === 201 && draft.body.status === 'DRAFT' && draft.body.highestDegree === 'MASTER', "brouillon enregistré (diplôme conservé ; un master enseigne aussi au lycée)", draft.body);
const appId = draft.body.id;
const foreignUse = await http('POST', '/tutor-applications', { token: requesterToken, body: { ...appInput, email: requesterEmail, highestDegree: 'MASTER', subjects: [{ subjectId: customId, educationLevelId: levelTerminale.id }], offers: [] } });
ok(foreignUse.status === 422 && foreignUse.body.code === 'UNKNOWN_SUBJECT', 'compétence privée inutilisable par un autre compte', foreignUse.body);
const noDegreeDraft = await http('PATCH', `/tutor-applications/${appId}`, { token: nt, body: appInput });
const noDegreeSubmit = await http('POST', `/tutor-applications/${appId}/submit`, { token: nt });
ok(noDegreeDraft.status === 200 && noDegreeSubmit.status === 422 && noDegreeSubmit.body.code === 'DEGREE_REQUIRED', 'envoi sans diplôme → DEGREE_REQUIRED', [noDegreeDraft.status, noDegreeSubmit.body]);
const customDraft = await http('PATCH', `/tutor-applications/${appId}`, {
  token: nt,
  body: { ...appInput, highestDegree: 'MASTER', subjects: [...appInput.subjects, { subjectId: customId, educationLevelId: levelTerminale.id, competenceDescription: 'Initiation' }] },
});
ok(customDraft.status === 200 && customDraft.body.subjects.some((x) => x.subject.id === customId), 'brouillon avec compétence libre', customDraft.body.subjects?.length);
// Sexe : exigé à l'envoi (avatar par défaut) ; valeur invalide refusée.
const badGender = await http('PATCH', `/tutor-applications/${appId}`, { token: nt, body: { ...appInput, highestDegree: 'MASTER', gender: 'AUTRE' } });
ok(badGender.status === 400, 'sexe invalide refusé', badGender.body);
const noGenderSave = await http('PATCH', `/tutor-applications/${appId}`, { token: nt, body: { ...appInput, gender: undefined, highestDegree: 'MASTER', subjects: customDraft.body.subjects.map((x) => ({ subjectId: x.subject.id, educationLevelId: x.educationLevel.id })) } });
const noGenderSubmit = await http('POST', `/tutor-applications/${appId}/submit`, { token: nt });
ok(noGenderSave.status === 200 && noGenderSubmit.status === 422 && noGenderSubmit.body.code === 'GENDER_REQUIRED', 'envoi sans sexe → GENDER_REQUIRED', [noGenderSave.status, noGenderSubmit.body.code]);
const genderRestore = await http('PATCH', `/tutor-applications/${appId}`, { token: nt, body: { ...appInput, highestDegree: 'MASTER', subjects: [...appInput.subjects, { subjectId: customId, educationLevelId: levelTerminale.id, competenceDescription: 'Initiation' }] } });
ok(genderRestore.status === 200 && genderRestore.body.gender === 'FEMALE', 'sexe conservé dans le brouillon', genderRestore.body.gender);
const mismatch = await http('POST', '/tutor-applications', { token: nt, body: { ...appInput, email: 'autre@e2e.test' } });
ok(mismatch.status === 422 && mismatch.body.code === 'ACCOUNT_EMAIL_MISMATCH', 'e-mail différent du compte refusé', mismatch.body);
const noVideo = await http('POST', `/tutor-applications/${appId}/submit`, { token: nt });
ok(noVideo.status === 422 && noVideo.body.code === 'INTRO_VIDEO_REQUIRED', 'envoi sans vidéo → INTRO_VIDEO_REQUIRED', noVideo.body);

const docTicket = await http('POST', `/tutor-applications/${appId}/documents/uploads`, { token: nt, body: { mimeType: 'application/pdf', sizeBytes: 400, fileName: 'cni.pdf' } });
await fetch(docTicket.body.signedUrl, { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: Buffer.from('%PDF-1.4 cni') });
const docReg = await http('POST', `/tutor-applications/${appId}/documents`, { token: nt, body: { uploadId: docTicket.body.uploadId, type: 'IDENTITY' } });
ok(docReg.status === 201 && docReg.body.type === 'IDENTITY', 'pièce d\'identité enregistrée', docReg.body);
const vidTicket = await http('POST', `/tutor-applications/${appId}/video/uploads`, { token: nt, body: { mimeType: 'video/mp4', sizeBytes: 900, fileName: 'intro.mp4', durationMs: 45000 } });
await fetch(vidTicket.body.signedUrl, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: Buffer.alloc(900, 1) });
const vidReg = await http('POST', `/tutor-applications/${appId}/video`, { token: nt, body: { uploadId: vidTicket.body.uploadId } });
ok(vidReg.status === 201, 'vidéo de présentation enregistrée', vidReg.body);
const submitted = await http('POST', `/tutor-applications/${appId}/submit`, { token: nt });
ok(submitted.status === 201 && submitted.body.status === 'PENDING', 'candidature soumise → PENDING', submitted.body);
const mine = await http('GET', '/tutor-applications/me', { token: nt });
ok(mine.body.status === 'PENDING' && mine.body.documents.length === 1 && mine.body.introVideo, 'candidature relue (documents + vidéo)', mine.body);
const ntMe = (await http('GET', '/users/me', { token: nt })).body;
ok(ntMe.tutor?.applicationStatus === 'PENDING' && ntMe.tutor.isVisible === false, '/users/me : candidature PENDING, non visible', ntMe.tutor);
const editPending = await http('PATCH', `/tutor-applications/${appId}`, { token: nt, body: appInput });
ok(editPending.status === 422, 'modification pendant l\'examen refusée', editPending.body);
const notYet = await http('GET', `/search/tutors/${ntMe.tutor.tutorProfileId}`);
ok(notYet.status === 404, 'profil invisible dans la recherche avant approbation', notYet.status);

const adminLogin = await http('POST', '/auth/login', { body: { email: 'admin@eduloc.mg', password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin12345!' } });
ok(adminLogin.status === 201 && adminLogin.body.user.isAdmin, 'connexion administrateur', adminLogin.body.user);
const adminToken = adminLogin.body.accessToken;
const notAdmin = await http('GET', '/admin/tutor-applications', { token: nt });
ok(notAdmin.status === 403, 'un non-admin ne peut pas lister les candidatures', notAdmin.body);
const approve = await http('POST', `/admin/tutor-applications/${appId}/approve`, { token: adminToken });
ok(approve.status === 201 && approve.body.ok, 'approbation par l\'admin', approve.body);
const ntMe2 = (await http('GET', '/users/me', { token: nt })).body;
ok(ntMe2.tutor.applicationStatus === 'APPROVED' && ntMe2.tutor.isVisible === true, '/users/me : tuteur approuvé et visible', ntMe2.tutor);
const publicAfter = await http('GET', '/catalog/subjects');
ok(publicAfter.body.some((s) => s.id === customId && s.isVerified), "approbation : la compétence libre entre au catalogue public", publicAfter.body.length);
const customCats = await http('GET', `/catalog/subjects/suggest?q=${encodeURIComponent(customName)}&degree=BAC`, { token: requesterToken });
ok(customCats.body.some((s) => s.id === customId && s.levelCategories.join() === 'Lycée'), 'compétence approuvée : niveaux (Lycée) déduits de ceux déclarés', customCats.body);
const found = await http('GET', `/search/offers?subjectId=${physics.id}&lat=-18.8733&lng=47.5311&format=IN_PERSON`);
ok(found.body.some((r) => r.tutor.id === ntMe2.tutor.tutorProfileId), 'le nouveau tuteur apparaît dans la recherche', found.body.map((r) => r.tutor.displayName));
const foundNew = found.body.find((r) => r.tutor.id === ntMe2.tutor.tutorProfileId);
const foundDemo = (await http('GET', `/search/offers?subjectId=${maths.id}&format=ONLINE`)).body.find((r) => r.tutor.displayName.includes('Andry'));
const publicProfile = await http('GET', `/search/tutors/${ntMe2.tutor.tutorProfileId}`);
ok(foundNew.tutor.gender === 'FEMALE' && foundDemo?.tutor.gender === 'MALE' && publicProfile.body.gender === 'FEMALE', 'le sexe est exposé (résultats de recherche + profil public) pour l\'avatar par défaut', [foundNew.tutor.gender, foundDemo?.tutor.gender, publicProfile.body.gender]);

// ───────────────────────────────────────────────────────────── 9. Gestion tuteur
step('9. Offres, lieux, disponibilités (tuteur approuvé)');
const myOffers = await http('GET', '/tutors/me/offers', { token: nt });
ok(myOffers.body.length === 1 && myOffers.body[0].price.amount, 'mes offres', myOffers.body);
const mass = await http('PATCH', `/tutors/me/offers/${myOffers.body[0].id}`, { token: nt, body: { disabledByAdminAt: null, title: 'Nouveau titre' } });
ok(mass.status === 400, 'PATCH : champ non autorisé rejeté (plus d\'affectation de masse)', mass.body);
const upd = await http('PATCH', `/tutors/me/offers/${myOffers.body[0].id}`, { token: nt, body: { title: 'Physique Terminale — révisé', price: 23000 } });
ok(upd.status === 200 && upd.body.title.includes('révisé') && upd.body.price.amount, 'modification d\'offre', upd.body);
const off = await http('POST', `/tutors/me/offers/${myOffers.body[0].id}/active`, { token: nt, body: { isActive: false } });
const on = await http('POST', `/tutors/me/offers/${myOffers.body[0].id}/active`, { token: nt, body: { isActive: 'true' } });
ok(off.body.isActive === false && on.body.isActive === true, 'activation / désactivation (booléen ou chaîne)', [off.body.isActive, on.body.isActive]);
const places = await http('GET', '/tutors/me/places', { token: nt });
ok(places.body.some((p) => p.type === 'BENEFICIARY_HOME' && p.radiusMeters === 5000), 'mes lieux (radiusMeters)', places.body);
const avOnline = await http('POST', '/tutors/me/availabilities', { token: nt, body: { dayOfWeek: 4, startTime: '10:00', endTime: '12:00', online: true } });
ok(avOnline.status === 201 && avOnline.body.place?.type === 'ONLINE', 'disponibilité « en ligne » rattachée au lieu En ligne', avOnline.body);
const target = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
const oneOff = await http('POST', '/tutors/me/availabilities', { token: nt, body: { dayOfWeek: new Date(`${target}T00:00:00Z`).getUTCDay(), startTime: '14:00', endTime: '16:00', online: true, validFrom: target, validUntil: target } });
ok(oneOff.status === 201 && oneOff.body.validFrom === target && oneOff.body.validUntil === target, 'disponibilité ponctuelle', oneOff.body);
const datedRows = (await http('GET', '/tutors/me/availabilities', { token: nt })).body.filter((a) => a.validFrom === oneOffDate && a.validUntil === oneOffDate);
const recurringRows = (await http('GET', '/tutors/me/availabilities', { token: nt })).body.filter((a) => a.dayOfWeek === 2 && !a.validFrom);
ok(datedRows.length === 1 && datedRows[0].place?.type === 'ONLINE' && recurringRows.length >= 1, 'dossier : disponibilité ponctuelle enregistrée avec sa date (et la récurrente reste sans validité)', [datedRows.length, recurringRows.length]);
const ntOffer = myOffers.body[0];
const ntSlots = (await http('GET', `/search/tutors/${ntMe2.tutor.tutorProfileId}/slots?offerId=${ntOffer.id}&from=${target}&to=${target}&duration=60`)).body;
ok(ntSlots.some((s) => s.teachingMode === 'ONLINE' && new Date(s.startAt).getUTCHours() === 11), 'la plage ponctuelle génère des créneaux le jour dit (14:00 locale = 11:00 UTC)', ntSlots.slice(0, 3));
const badTime = await http('POST', '/tutors/me/availabilities', { token: nt, body: { dayOfWeek: 1, startTime: '12:00', endTime: '10:00', online: true } });
ok(badTime.status === 422 && badTime.body.code === 'AVAILABILITY_TIME_INVALID', 'plage inversée refusée', badTime.body);
const del = await http('DELETE', `/tutors/me/availabilities/${oneOff.body.id}`, { token: nt });
const afterDel = await http('GET', '/tutors/me/availabilities', { token: nt });
ok(del.status === 200 && !afterDel.body.some((a) => a.id === oneOff.body.id), 'disponibilité supprimée : plus listée', afterDel.body.length);
const block = await http('POST', '/tutors/me/availabilities/blocks', { token: nt, body: { startAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), endAt: new Date(Date.now() + 6 * 86_400_000).toISOString(), reason: 'Congés' } });
const blocks = await http('GET', '/tutors/me/availabilities/blocks', { token: nt });
ok(block.status === 201 && blocks.body.length === 1, 'période bloquée', blocks.body);

// ───────────────────────────────────────────────────────────── 10. Divers
step('10. Géocodage, appels, sécurité');
const geo = await http('GET', '/geo/geocode?q=Analakely');
ok(geo.status === 200 && geo.body.length > 0 && typeof geo.body[0].latitude === 'number', 'géocodage d\'un quartier', geo.body[0]);
const call = await http('POST', '/calls', { token: requesterToken, body: { conversationId: conv.id, type: 'AUDIO' } });
ok(call.status === 422 && call.body.code === 'CALL_NOT_ALLOWED', 'appel refusé sans séance confirmée / en cours', call.body);
const rt = await http('GET', '/realtime/connection-token', { token: requesterToken });
ok(rt.status === 200 && rt.body.token, 'jeton Centrifugo de connexion', rt.body);
const foreign = await http('GET', `/realtime/subscription-token?channel=conv:${conv.id}`, { token: (await http('POST', '/auth/login', { body: { email: 'nina.rabe@demo.eduloc.mg', password: 'Demo12345!' } })).body.accessToken });
ok(foreign.status === 401, 'jeton d\'abonnement refusé à un non-participant', foreign.body);
const logout = await http('POST', '/auth/logout', { token: requesterToken, body: { refreshToken: requesterRefresh } });
const afterLogout = await http('POST', '/auth/refresh', { body: { refreshToken: requesterRefresh } });
ok(logout.status === 201 && afterLogout.status === 401, 'déconnexion : refresh token révoqué', afterLogout.status);
const reset = await http('POST', '/auth/password/request', { body: { email: requesterEmail } });
const resetCode = await emailCode(requesterEmail, 'user.password_reset_requested');
const resetDone = await http('POST', '/auth/password/reset', { body: { email: requesterEmail, code: resetCode, password: 'NouveauMdp456!' } });
const relogin = await http('POST', '/auth/login', { body: { email: requesterEmail, password: 'NouveauMdp456!' } });
ok(reset.status === 201 && resetDone.status === 201 && relogin.status === 201, 'réinitialisation du mot de passe par code', [reset.status, resetDone.status, relogin.status]);

await db.end();
console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} vérifications réussies, ${failed} échec(s)`);
process.exit(failed === 0 ? 0 : 1);
