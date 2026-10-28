/**
 * Parcours de bout en bout de l'administrateur, à travers le VRAI client du back-office
 * (eduloc-admin/src/lib : `http.ts` pour les jetons, `api.ts` pour les appels) contre une API qui tourne.
 * Le script prépare ses données directement en base (tuteur, dossier, offre, réservation, structure, salle),
 * puis exécute chaque action de l'administrateur comme le fait l'interface et contrôle le résultat.
 *
 *   npm run db:seed        # une fois : catalogue + compte administrateur
 *   npm run e2e:admin      # ADMIN_E2E_API=http://localhost:3003/api par défaut
 *
 * ÉCRIT EN BASE (lignes « Flow » préfixées d'un identifiant d'exécution, jamais supprimées) : à lancer sur une
 * base jetable. Pour en cibler une, surcharger DATABASE_URL ET DIRECT_URL (sinon Prisma prend DIRECT_URL du .env)
 * et démarrer l'API sur cette même base (voir README, section Tests).
 *
 * Variables : ADMIN_E2E_API (URL de l'API ciblée), ADMIN_E2E_EMAIL / ADMIN_E2E_PASSWORD (compte du seed),
 * ADMIN_CLIENT_DIR (dossier src/lib du back-office, par défaut ../../../eduloc-admin/src/lib).
 */
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

if (process.env.NODE_ENV === 'production') {
  console.error('admin-e2e écrit des données de test : refusé avec NODE_ENV=production.');
  process.exit(2);
}

const ADMIN_EMAIL = process.env.ADMIN_E2E_EMAIL ?? 'admin@eduloc.mg';
const ADMIN_PASSWORD = process.env.ADMIN_E2E_PASSWORD ?? 'Admin12345!';
const CLIENT_DIR = resolve(__dirname, process.env.ADMIN_CLIENT_DIR ?? '../../../eduloc-admin/src/lib');
const TARGET_API = process.env.ADMIN_E2E_API?.replace(/\/$/, '');

// Le client du back-office n'a pas de navigateur ici : un stockage en mémoire remplace localStorage.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

let clientApiUrl = '';
const realFetch = globalThis.fetch;
// Si on vise une autre API que celle par défaut du client, on redirige ses appels.
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  return realFetch(TARGET_API && clientApiUrl && url.startsWith(clientApiUrl) ? TARGET_API + url.slice(clientApiUrl.length) : url, init);
}) as typeof fetch;

const run = randomUUID().slice(0, 6);
let passed = 0;
let failures = 0;
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) passed++; else failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || extra === undefined ? '' : `  → ${JSON.stringify(extra)}`}`);
};
const rejects = async (label: string, p: Promise<unknown>, code?: string) => {
  try { await p; check(label, false, 'aucune erreur'); } catch (e) {
    const err = e as { code?: string; message?: string };
    check(label, code ? err.code === code : true, { code: err.code, message: err.message });
  }
};

async function main() {
  const load = (name: string) => import(pathToFileURL(resolve(CLIENT_DIR, name)).href);
  const { adminApi } = await load('api.ts');
  const http = await load('http.ts');
  clientApiUrl = http.API_URL;
  console.log(`API visée : ${TARGET_API ?? clientApiUrl}\n`);

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  // ---------------------------------------------------------------- données
  const mkUser = (tag: string) => prisma.user.create({
    data: { firstName: tag, lastName: `Flow${run}`, email: `${tag.toLowerCase()}-${run}@example.mg`, password: 'x', status: 'ACTIVE', emailVerified: true },
  });
  const manager = await mkUser('Manager');
  const venue = await prisma.partnerVenue.create({
    data: {
      managerId: manager.id, name: `Centre Flow ${run}`, type: 'TRAINING_CENTER', status: 'SUBMITTED', submittedAt: new Date(),
      nif: '1234567890', stat: '9876543210', contactEmail: 'c@example.mg',
      documents: { create: [{ type: 'OWNERSHIP_PROOF', storagePath: `venue/${run}.pdf`, mimeType: 'application/pdf', sizeBytes: 100, fileName: 'preuve.pdf' }] },
    },
  });
  const room = await prisma.room.create({
    data: { venueId: venue.id, name: `Salle Flow ${run}`, addressLine: '1 rue Test', city: 'Tana', capacity: 4, status: 'SUBMITTED', submittedAt: new Date(), pricePerHour: 5000 },
  });

  const tutorUser = await mkUser('Tutor');
  const profile = await prisma.tutorProfile.create({
    data: {
      userId: tutorUser.id, displayName: `Tuteur Flow ${run}`, highestDegree: 'OTHER', degreeTitle: `DUT Flow ${run}`,
      degreeCountry: 'France', fieldOfStudy: 'Génie', isVisible: false,
    },
  });
  const application = await prisma.tutorApplication.create({
    data: {
      tutorProfileId: profile.id, status: 'PENDING', submittedAt: new Date(),
      documents: { create: [
        { type: 'DIPLOMA', storagePath: `applications/${run}/dip.pdf`, mimeType: 'application/pdf', sizeBytes: 100, fileName: 'diplome.pdf' },
        { type: 'CV', storagePath: `applications/${run}/cv.pdf`, mimeType: 'application/pdf', sizeBytes: 100, fileName: 'cv.pdf' },
      ] },
    },
    include: { documents: true },
  });
  await prisma.tutorExperience.create({
    data: { tutorProfileId: profile.id, type: 'TEACHING', title: 'Répétiteur', organization: 'Lycée', period: '2022-2024' },
  });
  const subject = await prisma.subject.create({ data: { name: `Matière Flow ${run}` } });
  const offer = await prisma.offer.create({
    data: { tutorProfileId: profile.id, subjectId: subject.id, title: `Offre Flow ${run}`, description: 'd', price: 15000 },
  });
  const requester = await mkUser('Requester');
  const beneficiary = await prisma.beneficiary.create({ data: { requesterId: requester.id, firstName: 'Élève', relationship: 'SELF' } });
  const booking = await prisma.booking.create({
    data: {
      requesterId: requester.id, beneficiaryId: beneficiary.id, tutorProfileId: profile.id, offerId: offer.id,
      startAt: new Date(Date.now() + 3 * 86_400_000), endAt: new Date(Date.now() + 3 * 86_400_000 + 3_600_000),
      status: 'CONFIRMED', teachingMode: 'ONLINE', price: 15000, offerTitle: offer.title, totalAmount: 16500, serviceFee: 1500,
    },
  });

  // ---------------------------------------------------------------- connexion
  await rejects('connexion : mauvais mot de passe refusée', http.login(ADMIN_EMAIL, 'mauvais'), 'INVALID_CREDENTIALS');
  const session = await http.login(ADMIN_EMAIL, ADMIN_PASSWORD);
  check('connexion admin', session.user.isAdmin && http.tokenStore.hasSession());
  await rejects('connexion : compte ordinaire refusé par le back-office', (async () => {
    // Le compte « Manager » reçoit le mot de passe de l'admin : il peut s'authentifier mais n'est pas administrateur.
    await prisma.user.update({ where: { id: manager.id }, data: { password: (await prisma.user.findFirstOrThrow({ where: { isAdmin: true } })).password } });
    return http.login(manager.email, ADMIN_PASSWORD);
  })(), 'ADMIN_REQUIRED');
  await http.login(ADMIN_EMAIL, ADMIN_PASSWORD);

  // ---------------------------------------------------------------- tableau de bord
  const dash = await adminApi.dashboard();
  check('dashboard : un dossier en attente', dash.pendingApplications >= 1, dash);

  // ---------------------------------------------------------------- dossier tuteur
  const apps = await adminApi.applications('PENDING');
  const mine = apps.find((a: any) => a.id === application.id);
  check('dossier PENDING listé avec expériences et justificatifs', !!mine && mine.tutorProfile.experiences.length === 1 && mine.documents.length === 2);
  check('approvalMeaning fourni', !!mine?.documents.every((d: any) => d.approvalMeaning.length > 0));
  const diploma = mine!.documents.find((d: any) => d.type === 'DIPLOMA')!;
  const cv = mine!.documents.find((d: any) => d.type === 'CV')!;

  const url = await adminApi.documentUrl(diploma.id);
  check('lien de lecture du justificatif', typeof url.url === 'string' && url.mimeType === 'application/pdf', url);
  await rejects('approuver un diplôme sans attestation : refusé', adminApi.reviewDocument(diploma.id, { status: 'APPROVED' }), 'AUTHENTICITY_CONFIRMATION_REQUIRED');
  await adminApi.reviewDocument(diploma.id, { status: 'APPROVED', confirmAuthenticity: true });
  await adminApi.reviewDocument(cv.id, { status: 'REJECTED', rejectionReason: 'Illisible' });
  const reread = (await adminApi.applications('PENDING')).find((a: any) => a.id === application.id)!;
  check('statuts des justificatifs mis à jour',
    reread.documents.find((d: any) => d.type === 'DIPLOMA')!.status === 'APPROVED' && reread.documents.find((d: any) => d.type === 'CV')!.rejectionReason === 'Illisible');

  // équivalence puis niveau
  const levels = await adminApi.educationLevels();
  const licence = levels.find((l: any) => l.isActive && l.academicRank === 6)!;
  check('niveaux du catalogue (L3 trouvé)', !!licence);
  const eq = await adminApi.createEquivalence({
    status: 'VALIDATED', equivalentDegree: 'LICENCE', equivalentLevelId: licence.id,
    degreeTitle: mine!.tutorProfile.degreeTitle!, country: 'France', specialty: 'Génie', notes: 'DUT + 1 an',
  });
  check('équivalence créée VALIDATED', eq.status === 'VALIDATED');
  const withSuggestion = (await adminApi.applications('PENDING')).find((a: any) => a.id === application.id)!;
  check('suggestion d’équivalence proposée sur le dossier', withSuggestion.degreeEquivalenceSuggestion?.id === eq.id);
  await adminApi.applyEquivalence(application.id, eq.id);
  const applied = (await adminApi.applications('PENDING')).find((a: any) => a.id === application.id)!;
  check('équivalence appliquée → plus haut diplôme et niveau validé', applied.tutorProfile.highestDegree === 'LICENCE' && applied.tutorProfile.academicLevel?.id === licence.id, {
    deg: applied.tutorProfile.highestDegree, lvl: applied.tutorProfile.academicLevel,
  });
  const m2 = levels.find((l: any) => l.isActive && l.academicRank === 8)!;
  await adminApi.setAcademicLevel(profile.id, m2.id, 'Master en cours');
  check('niveau académique modifié', (await adminApi.applications('PENDING')).find((a: any) => a.id === application.id)!.tutorProfile.academicLevel?.id === m2.id);
  const doctorat = levels.find((l: any) => l.isActive && l.academicRank === 9)!;
  await rejects('niveau Doctorat sans note : refusé', adminApi.setAcademicLevel(profile.id, doctorat.id), 'ACADEMIC_LEVEL_NOTE_REQUIRED');
  await adminApi.revokeAcademicLevel(profile.id);
  check('validation du niveau retirée', (await adminApi.applications('PENDING')).find((a: any) => a.id === application.id)!.tutorProfile.academicLevel === null);
  await adminApi.setAcademicLevel(profile.id, m2.id, 'Master en cours');

  await adminApi.approveApplication(application.id, {});
  check('dossier approuvé', (await adminApi.applications('APPROVED')).some((a: any) => a.id === application.id));
  await rejects('approuver deux fois : refusé', adminApi.approveApplication(application.id, {}), 'APPLICATION_NOT_PENDING');

  // ---------------------------------------------------------------- offres, suspension, conflits
  const offers = await adminApi.offers({ search: `Flow ${run}`, page: 1 });
  check('offre trouvée par recherche', offers.length === 1 && offers[0].id === offer.id && offers[0].tutorProfile.displayName === `Tuteur Flow ${run}`);
  await adminApi.moderateOffer(offer.id, 'disable');
  check('offre retirée', (await adminApi.offers({ state: 'DISABLED_BY_ADMIN', search: `Flow ${run}`, page: 1 })).length === 1);
  await adminApi.moderateOffer(offer.id, 'enable');
  check('offre rétablie', (await adminApi.offers({ state: 'ACTIVE', search: `Flow ${run}`, page: 1 })).length === 1);

  const bookings = await adminApi.bookings({ page: 1 });
  const b = bookings.find((x: any) => x.id === booking.id);
  check('réservation listée avec les noms et montants', !!b && b.requester.firstName === 'Requester' && b.tutorProfile.displayName === `Tuteur Flow ${run}` && b.totalAmount === '16500' && b.openConflicts === 0, b);
  check('filtre de statut des réservations', (await adminApi.bookings({ status: 'CONFIRMED', page: 1 })).some((x: any) => x.id === booking.id));

  const suspended = await adminApi.suspendTutor(profile.id, 'Plainte');
  check('suspension : une séance à venir signalée', suspended.affectedBookings === 1, suspended);
  const conflicts = await adminApi.conflicts('OPEN');
  const conflict = conflicts.find((c: any) => c.booking.id === booking.id);
  check('conflit TUTOR_SUSPENDED ouvert', conflict?.type === 'TUTOR_SUSPENDED' && conflict.booking.offerTitle === offer.title, conflict);
  check('réservation : conflit compté', (await adminApi.bookings({ page: 1 })).find((x: any) => x.id === booking.id)!.openConflicts === 1);
  await adminApi.resolveConflict(conflict!.id, 'Séance reprogrammée avec un autre tuteur');
  const resolved = (await adminApi.conflicts('RESOLVED')).find((c: any) => c.id === conflict!.id);
  check('conflit résolu avec note et auteur', resolved?.resolution?.startsWith('Séance') === true && resolved.resolvedBy?.firstName === 'Admin', resolved);
  check('tuteur suspendu visible', (await adminApi.applications('APPROVED')).find((a: any) => a.id === application.id)!.tutorProfile.suspendedAt !== null);
  check('réindexation d’un tuteur', (await adminApi.reindexTutor(profile.id)).queued === 1);
  const lifted = await adminApi.reinstateTutor(profile.id, 'Plainte non fondée');
  check('suspension levée (le conflit déjà résolu n’est pas touché)', lifted.ok === true && lifted.dismissedConflicts === 0, lifted);
  check('tuteur de nouveau actif', (await adminApi.applications('APPROVED')).find((a: any) => a.id === application.id)!.tutorProfile.suspendedAt === null);
  await rejects('lever une suspension inexistante : refusé', adminApi.reinstateTutor(profile.id), 'TUTOR_NOT_SUSPENDED');

  // ---------------------------------------------------------------- utilisateurs
  const found = await adminApi.users({ search: `requester-${run}`, page: 1 });
  check('utilisateur trouvé par recherche', found.length === 1 && found[0].firstName === 'Requester');
  await adminApi.setUserStatus(requester.id, 'SUSPENDED');
  check('compte suspendu', (await adminApi.users({ status: 'SUSPENDED', search: `requester-${run}`, page: 1 })).length === 1);
  await adminApi.setUserStatus(requester.id, 'ACTIVE');

  // ---------------------------------------------------------------- lieux partenaires
  const vlist = await adminApi.venues('SUBMITTED');
  check('structure soumise listée', vlist.some((v: any) => v.id === venue.id && v.roomsCount === 1 && v.documentsCount === 1));
  const vd = await adminApi.venue(venue.id);
  check('fiche structure : justificatif avec lien, offre non choisie', vd.documents[0].url.length > 0 && vd.subscription.status === 'NOT_SELECTED', vd.subscription);
  await rejects('refuser sans motif : refusé', adminApi.reviewVenue(venue.id, 'REJECT'), 'REVIEW_NOTE_REQUIRED');
  await adminApi.reviewVenue(venue.id, 'START_REVIEW');
  const approvedVenue = await adminApi.reviewVenue(venue.id, 'APPROVE');
  check('structure validée', approvedVenue.status === 'APPROVED');

  const rd = await adminApi.room(room.id);
  check('fiche salle : adresse exacte, non réservable', rd.addressLine === '1 rue Test' && rd.bookable === 0, { addr: rd.addressLine, bookable: rd.bookable });
  const approvedRoom = await adminApi.reviewRoom(room.id, 'APPROVE');
  check('salle validée', approvedRoom.status === 'APPROVED');
  await prisma.room.update({ where: { id: room.id }, data: { publication: 'PUBLISHED' } });
  const unpublished = await adminApi.decidePublication(room.id, 'UNPUBLISH', 'Photos trompeuses');
  check('salle retirée de la publication', unpublished.publication === 'UNPUBLISHED_BY_ADMIN');
  const restored = await adminApi.decidePublication(room.id, 'RESTORE');
  check('retrait levé → non publiée', restored.publication === 'UNPUBLISHED');
  const suspendedRoom = await adminApi.reviewRoom(room.id, 'SUSPEND', 'Contrôle');
  check('salle suspendue', suspendedRoom.status === 'SUSPENDED');
  check('historique des décisions', suspendedRoom.history.length >= 3 && suspendedRoom.history.some((e: any) => e.note === 'Contrôle'));
  check('salle listée par statut', (await adminApi.rooms('SUSPENDED')).some((r: any) => r.id === room.id));
  check('réservations de salle (liste vide, forme OK)', Array.isArray(await adminApi.roomReservations()));
  check('avis (liste vide, forme OK)', Array.isArray(await adminApi.roomReviews(false)));

  const plan = await adminApi.createPlan({ code: `FLOW_${run.toUpperCase()}`, name: 'Plan Flow', priceAmount: 50000, durationDays: 30, isActive: true });
  check('plan créé', plan.price.amount === '50000');
  const updated = await adminApi.updatePlan(plan.id, { isActive: false, name: 'Plan Flow 2' });
  check('plan modifié', updated.isActive === false && updated.name === 'Plan Flow 2');

  // ---------------------------------------------------------------- session
  const before = JSON.parse(store.get('eduloc_admin_session')!);
  check('session conservée', before.firstName === 'Admin');
  store.set('eduloc_admin_access', 'jeton-invalide');
  check('jeton expiré renouvelé automatiquement', (await adminApi.dashboard()).requesters >= 0);
  await http.logout();
  check('déconnexion : jetons effacés', !http.tokenStore.hasSession());

  await prisma.$disconnect();
  await pool.end();
  console.log(failures === 0 ? `\nTOUT EST OK (${passed} vérifications)` : `\n${failures} ÉCHEC(S) sur ${passed + failures} vérifications`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
