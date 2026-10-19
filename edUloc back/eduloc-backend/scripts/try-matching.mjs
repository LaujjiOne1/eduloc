/**
 * Essai guidé de la recherche de matching, avec les comptes de démonstration du seed. Aucun accès direct à la base :
 * uniquement l'API (le script évite aussi les problèmes d'accents d'un terminal Windows avec curl).
 *
 *   npm run db:seed                       # une fois : catalogue, admin, demandeur et tuteurs de démo
 *   npm run start:dev                     # l'API doit tourner (et Ollama pour la partie universitaire)
 *   npm run try:matching                  # API_URL_TRY=http://localhost:3003/api par défaut (PORT du .env)
 *
 * Étape 1 : niveau lycée (Terminale), SANS Ollama ni niveau validé : recherche classique.
 * Étape 2 : niveau universitaire : l'admin VALIDE d'abord le niveau académique de deux tuteurs de démo (sans niveau
 *           validé, un tuteur n'est jamais éligible à l'université), l'indexation se fait en tâche de fond, puis la recherche.
 */
import 'dotenv/config';

const API = process.env.API_URL_TRY ?? `http://localhost:${process.env.PORT ?? 3003}/api`;
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@eduloc.mg', password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin12345!' };
const REQUESTER = { email: 'demo@eduloc.mg', password: 'Demo12345!' };

async function http(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}
const must = (r, what) => {
  if (r.status >= 300) throw new Error(`${what} : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  return r.body;
};
const login = async (account) => must(await http('POST', '/auth/login', { body: account }), `connexion ${account.email}`).accessToken;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const title = (t) => console.log(`\n=== ${t}`);

const requesterToken = await login(REQUESTER);
const adminToken = await login(ADMIN);

const levels = must(await http('GET', '/catalog/education-levels'), 'niveaux');
const subjects = must(await http('GET', '/catalog/subjects'), 'matières');
const level = (name) => levels.find((l) => l.name === name)?.id ?? (() => { throw new Error(`Niveau « ${name} » absent : lancez npm run db:seed`); })();
const subject = (name) => subjects.find((s) => s.name === name)?.id ?? (() => { throw new Error(`Matière « ${name} » absente : lancez npm run db:seed`); })();

async function beneficiary(levelName) {
  const existing = must(await http('GET', '/beneficiaries', { token: requesterToken }), 'bénéficiaires');
  const found = existing.find((b) => b.firstName === `Essai ${levelName}`);
  if (found) return found.id;
  return must(await http('POST', '/beneficiaries', {
    token: requesterToken, body: { firstName: `Essai ${levelName}`, relationship: 'CHILD', educationLevelId: level(levelName) },
  }), 'création du bénéficiaire').id;
}

function show(result) {
  console.log(`  mode : ${result.mode ?? 'SÉMANTIQUE'}   résultats : ${result.results.length}${result.reason ? `   raison : ${result.reason}` : ''}`);
  for (const r of result.results) {
    const name = r.displayName ?? r.tutor?.displayName;
    const why = r.matchReasons ? ` — ${r.matchReasons.join(' | ')}` : ` — ${r.offers.map((o) => o.title).join(' | ')}`;
    const slots = r.nextSlots ? ` — créneaux : ${r.nextSlots.length}` : '';
    console.log(`   • ${name}${why}${slots}`);
  }
}

// --- Étape 1 : niveau lycée --------------------------------------------------------------------------------------
title('1. Niveau lycée (Terminale), matière Mathématiques : recherche classique');
const terminale = await beneficiary('Terminale');
const school = must(await http('POST', '/matching/search', {
  token: requesterToken,
  body: { beneficiaryId: terminale, subjectId: subject('Mathématiques'), needDescription: 'Préparation du BAC, révisions d’algèbre et d’analyse.' },
}), 'recherche lycée');
show(school);
if (school.results.length === 0) {
  console.log('  → Aucun résultat. Vérifiez : npm run db:seed (tuteurs de démo), tuteur « visible » (dossier approuvé),');
  console.log('    offre active pour ce niveau, et format : le présentiel exige des coordonnées que le matching n’envoie pas.');
}

// --- Étape 2 : niveau universitaire -------------------------------------------------------------------------------
title('2. Niveau universitaire (Licence 2) : préparation par l’admin');
const applications = must(await http('GET', '/admin/tutor-applications?status=APPROVED', { token: adminToken }), 'dossiers');
const byEmail = new Map(applications.map((a) => [a.tutorProfile.user.email, a.tutorProfileId]));
// Nina Rabe (Licence 1-3) et Hery Rasolofo (Licence 1) : niveaux validés au-dessus de ceux qu'ils enseignent.
const validations = [
  ['nina.rabe@demo.eduloc.mg', 'Master 1', 'Essai : tuteur de démo validé M1'],
  ['hery.rasolofo@demo.eduloc.mg', 'Licence 3', 'Essai : étudiant de L3 validé à son niveau en cours'],
];
for (const [email, levelName, note] of validations) {
  const id = byEmail.get(email);
  if (!id) { console.log(`  ! ${email} introuvable parmi les dossiers approuvés (npm run db:seed ?)`); continue; }
  must(await http('PUT', `/admin/tutors/${id}/academic-level`, { token: adminToken, body: { academicLevelId: level(levelName), note } }), `niveau de ${email}`);
  console.log(`  ✓ ${email} : niveau académique validé = ${levelName}`);
}

// Les tuteurs créés par le seed n'ont jamais été indexés : on demande la réindexation (calculée en tâche de fond).
const queued = must(await http('POST', '/admin/matching/reindex', { token: adminToken }), 'réindexation');
console.log(`  ✓ réindexation demandée pour ${queued.queued} tuteur(s) approuvé(s)`);

title('3. Recherche universitaire (Licence 2) — l’indexation est faite en tâche de fond (Ollama requis)');
const licence2 = await beneficiary('Licence 2');
const query = {
  beneficiaryId: licence2,
  subjectText: 'Programmation',
  needDescription: 'Je veux apprendre la programmation en Python et comprendre les bases de l’algorithmique pour mon cours de licence.',
};
let semantic;
for (let attempt = 1; attempt <= 24; attempt += 1) {
  const r = await http('POST', '/matching/search', { token: requesterToken, body: query });
  if (r.status === 503) {
    console.log('  ✗ 503 MATCHING_UNAVAILABLE : Ollama est arrêté ou le modèle n’est pas téléchargé');
    console.log('    → docker compose up -d --no-deps ollama ollama-init   (puis relancez ce script)');
    process.exit(1);
  }
  semantic = must(r, 'recherche universitaire');
  if (semantic.results.length > 0) break;
  if (attempt === 1) console.log('  … aucun tuteur indexé pour l’instant, attente de l’indexation (cron 5 s)…');
  await sleep(5000);
}
show(semantic);
if (semantic.results.length === 0) {
  console.log('  → Toujours vide. Causes possibles :');
  console.log('    • indexation non faite : `npm run matching:reindex-all` (ou l’API ne tourne pas avec les crons) ;');
  console.log('    • aucun tuteur de rang strictement supérieur à la demande (Licence 2) avec cette matière déclarée à ce niveau.');
}

title('4. Contre-épreuve : un niveau trop bas n’a aucun tuteur éligible');
const master2 = await beneficiary('Master 2');
show(must(await http('POST', '/matching/search', { token: requesterToken, body: { ...query, beneficiaryId: master2 } }), 'recherche Master 2'));
console.log('  (attendu : 0 résultat, raison NO_TUTOR_FOR_LEVEL — aucun tuteur de démo n’est de niveau Doctorat)');
