/**
 * Données de TEST du matching universitaire, pour l'essayer à la main (front ou API) : 29 tuteurs fictifs approuvés,
 * visibles, au niveau académique VALIDÉ (L3, M1, M2, Doctorat, un expert), avec matières, expériences, offres et
 * disponibilités en ligne. Ce sont les mêmes que le jeu d'évaluation (eval/dataset.ts).
 *
 *   npm run db:seed            # d'abord : catalogue, admin, demandeur de démo
 *   npm run db:seed:matching   # puis ceci (idempotent)
 *
 * Écrit aussi MATCHING-TEST-DATA.md (comptes + scénarios à essayer). L'indexation sémantique est demandée à l'outbox :
 * elle se fait en tâche de fond quand l'API tourne avec Ollama (sinon : npm run matching:reindex-all).
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import argon2 from 'argon2';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { enqueueTutorReindex } from '../src/modules/matching/indexing/reindex-events';
import { QUERIES, TUTORS, declaredLevels, type EvalTutor } from '../eval/dataset';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

export const PASSWORD = 'Demo12345!';
const NAMES: Record<string, [string, string, 'MALE' | 'FEMALE']> = {
  T01: ['Haja', 'Andrianina', 'MALE'], T02: ['Voahangy', 'Ratsimbazafy', 'FEMALE'], T03: ['Tahiry', 'Rakotoarison', 'MALE'],
  T04: ['Fanja', 'Razafindrakoto', 'FEMALE'], T05: ['Mamy', 'Rasolonjatovo', 'MALE'], T06: ['Lalaina', 'Rabemananjara', 'FEMALE'],
  T07: ['Toky', 'Randrianasolo', 'MALE'], T08: ['Hasina', 'Rakotomalala', 'MALE'], T09: ['Ny Aina', 'Rajaonarison', 'FEMALE'],
  T10: ['Faniry', 'Andriamihaja', 'MALE'], T11: ['Njaka', 'Ravelomanana', 'MALE'], T12: ['Mihaja', 'Rasoanaivo', 'FEMALE'],
  T13: ['Rivo', 'Andrianjafy', 'MALE'], T14: ['Santatra', 'Ramaroson', 'MALE'], T15: ['Lova', 'Ranaivoson', 'MALE'],
  T16: ['Soa', 'Rakotonirina', 'FEMALE'], T17: ['Fidy', 'Rabenja', 'MALE'], T18: ['Nirina', 'Raharimanana', 'MALE'],
  T19: ['Tsiory', 'Razanamahefa', 'FEMALE'], T20: ['Miora', 'Andriamanalina', 'FEMALE'], T21: ['Zo', 'Rasamoelina', 'MALE'],
  T22: ['Hanta', 'Rakotovao', 'FEMALE'], T23: ['Joel', 'Randrianarivelo', 'MALE'], T24: ['Eric', 'Rajoelina', 'MALE'],
  T25: ['Andry', 'Ratovoson', 'MALE'], T26: ['Sarah', 'Rakotoson', 'FEMALE'], T27: ['Mirana', 'Ramanantsoa', 'FEMALE'],
  T28: ['Kanto', 'Randria', 'FEMALE'], T29: ['Ando', 'Rasolofoniaina', 'MALE'],
};
const SUBJECT_CATEGORY: Record<string, string> = {
  'Algèbre linéaire': 'Sciences', 'Algèbre abstraite': 'Sciences', 'Analyse réelle': 'Sciences', 'Probabilités et statistiques': 'Sciences',
  'Traitement du signal': 'Sciences', Thermodynamique: 'Sciences', 'Chimie organique': 'Sciences', 'Analyse numérique': 'Sciences',
  Automatique: 'Sciences', 'Biologie cellulaire et génétique': 'Sciences', 'Bases de données': 'Numérique', Cryptographie: 'Numérique',
  Programmation: 'Numérique', 'Algorithmique avancée': 'Numérique', 'Réseaux informatiques': 'Numérique',
  'Apprentissage automatique': 'Numérique', 'Systèmes d’exploitation': 'Numérique', Macroéconomie: 'Gestion', Microéconomie: 'Gestion',
  'Finance d’entreprise': 'Gestion', Comptabilité: 'Gestion', 'Droit des affaires': 'Gestion', 'Droit civil': 'Gestion',
  Marketing: 'Gestion', 'Gestion de projet': 'Gestion', Économétrie: 'Gestion', Anglais: 'Langues',
};
const LEVEL_NAME = { L3: 'Licence 3', M1: 'Master 1', M2: 'Master 2', DOCTORAT: 'Doctorat' } as const;

const email = (t: EvalTutor) => `${t.key.toLowerCase()}@matching.eduloc.mg`;
const fullName = (t: EvalTutor) => NAMES[t.key].slice(0, 2).join(' ');

async function main() {
  const levels = new Map((await prisma.educationLevel.findMany()).map((l) => [l.name, l.id]));
  if (!levels.has('Master 2') || !levels.has('Doctorat')) {
    throw new Error('Niveaux « Master 2 » / « Doctorat » absents : appliquez la migration puis `npm run db:seed`.');
  }
  const password = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  const subjectIds = new Map<string, string>();
  for (const name of new Set(TUTORS.flatMap((t) => t.subjects.map((s) => s.name)))) {
    const subject = await prisma.subject.upsert({
      where: { name },
      update: {},
      create: { name, category: SUBJECT_CATEGORY[name] ?? 'Sciences', description: null, levelCategories: ['Université'], isVerified: true },
    });
    subjectIds.set(name, subject.id);
  }

  let created = 0;
  for (const t of TUTORS) {
    const [firstName, lastName, gender] = NAMES[t.key];
    const user = await prisma.user.upsert({
      where: { email: email(t) },
      update: {},
      create: { email: email(t), password, firstName, lastName, phone: `+261 34 20 ${t.key.slice(1)} 00`, status: 'ACTIVE', emailVerified: true },
    });
    const existing = await prisma.tutorProfile.findUnique({ where: { userId: user.id } });
    if (existing) {
      await enqueueTutorReindex(prisma, existing.id); // idempotent : on redemande seulement l'indexation
      continue;
    }
    const profile = await prisma.tutorProfile.create({
      data: {
        userId: user.id, displayName: `${firstName} ${lastName}`, gender, isVisible: true,
        bio: `${t.degreeTitle} — ${t.specialization}.`, highestDegree: t.highestDegree, degreeTitle: t.degreeTitle,
        fieldOfStudy: t.fieldOfStudy, specialization: t.specialization, degreeInstitution: t.institution,
        academicLevelId: levels.get(LEVEL_NAME[t.level])!, academicLevelValidatedAt: new Date(),
        academicLevelNote: t.expert ? 'Expert professionnel (données de test du matching)' : null,
      },
    });
    await prisma.tutorApplication.create({ data: { tutorProfileId: profile.id, status: 'APPROVED', submittedAt: new Date(), reviewedAt: new Date() } });
    for (const s of t.subjects) {
      for (const level of declaredLevels(t.level)) {
        await prisma.tutorSubject.create({
          data: { tutorProfileId: profile.id, subjectId: subjectIds.get(s.name)!, educationLevelId: levels.get(level)!, competenceDescription: s.competence },
        });
      }
    }
    for (const e of t.experiences) {
      await prisma.tutorExperience.create({ data: { tutorProfileId: profile.id, ...e } });
    }
    for (const o of t.offers) {
      await prisma.offer.create({
        data: { tutorProfileId: profile.id, subjectId: subjectIds.get(o.subject)!, educationLevelId: null, title: o.title, description: o.description, format: 'BOTH', durationMinutes: 60, price: 20000 + (Number(t.key.slice(1)) % 5) * 2500 },
      });
    }
    const online = await prisma.place.create({ data: { tutorProfileId: profile.id, label: 'En ligne', type: 'ONLINE' } });
    // Lundi à vendredi 14:00-18:00 et samedi 09:00-12:00 (heure de Madagascar) : des créneaux apparaissent dans les 14 jours.
    for (const [dayOfWeek, startTime, endTime] of [[1, '14:00', '18:00'], [2, '14:00', '18:00'], [3, '14:00', '18:00'], [4, '14:00', '18:00'], [5, '14:00', '18:00'], [6, '09:00', '12:00']] as const) {
      await prisma.availability.create({ data: { tutorProfileId: profile.id, dayOfWeek, startTime, endTime, placeId: online.id } });
    }
    await enqueueTutorReindex(prisma, profile.id);
    created += 1;
  }

  // Un bénéficiaire par niveau universitaire pour le demandeur de démo (utile pour l'API ; le front en crée un « pour moi »).
  const requester = await prisma.user.findUnique({ where: { email: 'demo@eduloc.mg' } });
  if (requester) {
    for (const name of ['Licence 1', 'Licence 2', 'Licence 3', 'Master 1', 'Master 2']) {
      const firstName = `Test ${name}`;
      if (!(await prisma.beneficiary.count({ where: { requesterId: requester.id, firstName } }))) {
        await prisma.beneficiary.create({ data: { requesterId: requester.id, firstName, relationship: 'CHILD', educationLevelId: levels.get(name)! } });
      }
    }
  }
  console.log(`Données de test du matching : ${created} tuteur(s) créé(s) (${TUTORS.length} au total), indexation demandée.`);

  writeFileSync(join(__dirname, '..', 'MATCHING-TEST-DATA.md'), renderDoc(), 'utf8');
  console.log('Scénarios et comptes : MATCHING-TEST-DATA.md');
}

function renderDoc(): string {
  const byKey = new Map(TUTORS.map((t) => [t.key, t]));
  const lines: string[] = [];
  lines.push('# Données de test du matching universitaire', '');
  lines.push('Généré par `npm run db:seed:matching`. Les 29 tuteurs ci-dessous sont **approuvés, visibles, au niveau académique validé** ;');
  lines.push('mot de passe de tous les comptes : `' + PASSWORD + '`. Demandeur de démo : `demo@eduloc.mg` (même mot de passe).', '');
  lines.push('## Règle à connaître', '');
  lines.push('Un tuteur n\'apparaît que si le **niveau validé** de son profil est **strictement supérieur** au niveau de la demande ');
  lines.push('(Licence 2 → tuteurs de Licence 3, Master 1, Master 2, Doctorat ; Master 2 → Doctorat uniquement) **et** s\'il a déclaré ce niveau ');
  lines.push('pour au moins une matière. Les tuteurs « Licence 3 » (étudiants) ne servent que les demandes de Licence 1 et 2.', '');
  lines.push('## Tuteurs', '', '| Clé | Nom | Compte | Niveau validé | Diplôme | Matières |', '|---|---|---|---|---|---|');
  for (const t of TUTORS) {
    lines.push(`| ${t.key} | ${fullName(t)}${t.expert ? ' (expert pro)' : ''} | ${email(t)} | ${LEVEL_NAME[t.level]} | ${t.degreeTitle} | ${t.subjects.map((s) => s.name).join(', ')} |`);
  }
  lines.push('', '## Scénarios à essayer', '');
  lines.push('Connectez-vous avec `demo@eduloc.mg`, choisissez le **niveau**, la **matière** (ou une matière proche), saisissez le **besoin** tel quel,');
  lines.push('puis vérifiez que les tuteurs attendus ressortent en premier (« très pertinent » d\'abord). Sans mots communs : Q04, Q21, Q22, Q23, Q41.', '');
  lines.push('| # | Niveau | Matière | Besoin à saisir | Attendus (très pertinents → pertinents) |', '|---|---|---|---|---|');
  for (const q of QUERIES) {
    const subject = 'catalog' in q.subject ? q.subject.catalog : q.subject.text;
    const expected = Object.entries(q.relevant).sort((a, b) => b[1] - a[1])
      .map(([key, rel]) => `${rel === 2 ? '**' : ''}${fullName(byKey.get(key)!)}${rel === 2 ? '**' : ''}`).join(', ');
    lines.push(`| ${q.id} | ${q.level} | ${subject} | ${q.need} | ${expected} |`);
  }
  lines.push('', '## Contre-épreuves (le niveau prime sur la pertinence)', '');
  lines.push('- Niveau **Master 2**, besoin « droit des affaires, sociétés commerciales » : seuls les docteurs et l\'expert sont éligibles. Le tuteur de droit des affaires (Master, niveau M2) ne doit **pas** apparaître, car il n\'est pas de rang supérieur ; c\'est le docteur en droit privé qui ressort.');
  lines.push('- Niveau **Formation pro** (hors échelle) : aucun tuteur éligible, quelle que soit la matière.');
  lines.push('- Avant l\'indexation (Ollama arrêté ou API éteinte) : la recherche universitaire répond `503 MATCHING_UNAVAILABLE`.', '');
  return lines.join('\n');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
