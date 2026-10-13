/**
 * Données de départ.
 *   - Catalogue (matières, niveaux) : toujours, idempotent — l'app est inutilisable sans lui.
 *   - Compte administrateur : SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (obligatoire en production).
 *   - Données de démonstration (tuteurs approuvés, demandeur) : développement uniquement,
 *     ou SEED_DEMO=true.
 *
 * Usage : npm run db:seed
 */
import 'dotenv/config';
import argon2 from 'argon2';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const isProduction = process.env.NODE_ENV === 'production';
const seedDemo = process.env.SEED_DEMO ? process.env.SEED_DEMO === 'true' : !isProduction;

/** Diplôme minimal pour enseigner un niveau (voir degree-policy côté API). */
const requiredDegreeFor = (category: string, name: string): 'BAC' | 'LICENCE' | 'MASTER' =>
  category !== 'Université' ? 'BAC' : name === 'Master' ? 'MASTER' : 'LICENCE';

const LEVELS: { category: string; names: string[] }[] = [
  { category: 'Primaire', names: ['CP1', 'CP2', 'CE', 'CM1', 'CM2'] },
  { category: 'Collège', names: ['6ème', '5ème', '4ème', '3ème'] },
  { category: 'Lycée', names: ['Seconde', 'Première', 'Terminale'] },
  { category: 'Université', names: ['Licence 1', 'Licence 2', 'Licence 3', 'Master', 'Formation pro'] },
];

const SECONDARY_AND_UP = ['Lycée', 'Université'];
const UNIVERSITY = ['Université'];

/** levelCategories vide = enseignable à tous les niveaux. */
const SUBJECTS: { name: string; category: string; description: string; levelCategories?: string[] }[] = [
  { name: 'Mathématiques', category: 'Sciences', description: 'Algèbre, géométrie, analyse, probabilités.' },
  { name: 'Physique-Chimie', category: 'Sciences', description: 'Mécanique, électricité, chimie générale et organique.' },
  { name: 'SVT', category: 'Sciences', description: 'Biologie, géologie, écologie.' },
  { name: 'Informatique', category: 'Numérique', description: 'Bureautique, algorithmique, culture numérique.' },
  { name: 'Programmation', category: 'Numérique', description: 'Python, JavaScript, bases de données, web.', levelCategories: SECONDARY_AND_UP },
  { name: 'Français', category: 'Langues', description: 'Grammaire, expression écrite et orale, littérature.' },
  { name: 'Anglais', category: 'Langues', description: 'Conversation, grammaire, préparation aux examens.' },
  { name: 'Malagasy', category: 'Langues', description: 'Lecture, écriture, littérature malagasy.' },
  { name: 'Histoire-Géographie', category: 'Lettres', description: 'Histoire de Madagascar et du monde, géographie.' },
  { name: 'Philosophie', category: 'Lettres', description: 'Dissertation, explication de texte, grands auteurs.', levelCategories: SECONDARY_AND_UP },
  { name: 'Économie', category: 'Gestion', description: 'Microéconomie, macroéconomie, gestion.', levelCategories: SECONDARY_AND_UP },
  { name: 'Comptabilité', category: 'Gestion', description: 'Comptabilité générale, analytique, fiscalité.', levelCategories: SECONDARY_AND_UP },
  { name: 'Algèbre linéaire', category: 'Sciences', description: 'Espaces vectoriels, matrices, applications linéaires.', levelCategories: UNIVERSITY },
  { name: 'Algèbre abstraite', category: 'Sciences', description: 'Groupes, anneaux, corps.', levelCategories: UNIVERSITY },
  { name: 'Analyse réelle', category: 'Sciences', description: 'Suites, séries, intégration.', levelCategories: UNIVERSITY },
  { name: 'Probabilités et statistiques', category: 'Sciences', description: 'Variables aléatoires, estimation, tests.', levelCategories: UNIVERSITY },
  { name: 'Thermodynamique', category: 'Sciences', description: 'Principes, machines thermiques, entropie.', levelCategories: UNIVERSITY },
  { name: 'Chimie organique', category: 'Sciences', description: 'Mécanismes réactionnels, synthèse.', levelCategories: UNIVERSITY },
  { name: 'Bases de données', category: 'Numérique', description: 'SQL, modélisation, optimisation.', levelCategories: UNIVERSITY },
  { name: 'Algorithmique avancée', category: 'Numérique', description: 'Complexité, graphes, programmation dynamique.', levelCategories: UNIVERSITY },
  { name: 'Droit des affaires', category: 'Gestion', description: 'Sociétés, contrats commerciaux.', levelCategories: UNIVERSITY },
  { name: 'Macroéconomie', category: 'Gestion', description: 'Croissance, monnaie, politiques publiques.', levelCategories: UNIVERSITY },
];

async function seedCatalog() {
  let order = 0;
  for (const { category, names } of LEVELS) {
    for (const name of names) {
      order += 1;
      await prisma.educationLevel.upsert({
        where: { name_category: { name, category } },
        update: { displayOrder: order, isActive: true, requiredDegree: requiredDegreeFor(category, name) },
        create: { name, category, displayOrder: order, requiredDegree: requiredDegreeFor(category, name) },
      });
    }
  }
  for (const subject of SUBJECTS) {
    await prisma.subject.upsert({
      where: { name: subject.name },
      update: {
        category: subject.category,
        description: subject.description,
        isActive: true,
        isVerified: true,
        levelCategories: subject.levelCategories ?? [],
      },
      create: { ...subject, levelCategories: subject.levelCategories ?? [] },
    });
  }
  console.log(`Catalogue : ${SUBJECTS.length} matières, ${order} niveaux.`);
}

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@eduloc.mg').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? (isProduction ? '' : 'Admin12345!');
  if (!password) {
    console.log('Admin : SEED_ADMIN_PASSWORD absent — aucun administrateur créé.');
    return;
  }
  await prisma.user.upsert({
    where: { email },
    update: { isAdmin: true, status: 'ACTIVE', emailVerified: true },
    create: {
      email,
      password: await argon2.hash(password, { type: argon2.argon2id }),
      firstName: 'Admin',
      lastName: 'EduLoc',
      isAdmin: true,
      status: 'ACTIVE',
      emailVerified: true,
    },
  });
  console.log(`Admin : ${email}${isProduction ? '' : ` / ${password}`}`);
}

interface DemoTutor {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  bio: string;
  experience: string;
  education: string;
  degree: 'BAC' | 'LICENCE' | 'MASTER' | 'DOCTORAT';
  gender: 'MALE' | 'FEMALE';
  subjects: { subject: string; levels: string[]; description: string }[];
  offers: { subject: string; level: string | null; title: string; description: string; format: 'ONLINE' | 'IN_PERSON' | 'BOTH'; price: number }[];
  places: { label: string; address: string; lat: number; lng: number; radius: number | null; type: 'BENEFICIARY_HOME' | 'TUTOR_HOME' | 'PUBLIC_PLACE'; primary: boolean }[];
  /** [jour (0 = dimanche), début, fin, index du lieu | 'online'] */
  availability: [number, string, string, number | 'online'][];
}

const DEMO_TUTORS: DemoTutor[] = [
  {
    email: 'andry.rakoto@demo.eduloc.mg',
    firstName: 'Andry',
    lastName: 'Rakoto',
    phone: '+261 34 11 111 11',
    bio: 'Professeur de mathématiques et de physique depuis 8 ans. Je m’adapte au rythme de chaque élève.',
    experience: 'Enseignant en lycée privé (2017-2023), tuteur indépendant depuis 2023.',
    education: 'Master en mathématiques appliquées, Université d’Antananarivo.',
    degree: 'MASTER',
    gender: 'MALE',
    subjects: [
      { subject: 'Mathématiques', levels: ['3ème', 'Seconde', 'Première', 'Terminale'], description: 'Algèbre et analyse, préparation BEPC et BAC.' },
      { subject: 'Physique-Chimie', levels: ['Seconde', 'Première', 'Terminale'], description: 'Mécanique et électricité.' },
    ],
    offers: [
      { subject: 'Mathématiques', level: 'Terminale', title: 'Préparation au BAC — Mathématiques', description: 'Révision du programme, annales corrigées, méthode de rédaction.', format: 'BOTH', price: 25000 },
      { subject: 'Mathématiques', level: '3ème', title: 'Préparation au BEPC — Mathématiques', description: 'Reprendre les bases et réussir l’examen.', format: 'IN_PERSON', price: 20000 },
      { subject: 'Physique-Chimie', level: 'Terminale', title: 'Physique-Chimie — Terminale', description: 'Cours et exercices types BAC.', format: 'ONLINE', price: 22000 },
    ],
    places: [
      { label: 'Analakely & environs', address: 'Antananarivo — Analakely', lat: -18.9082, lng: 47.5242, radius: 8000, type: 'BENEFICIARY_HOME', primary: true },
    ],
    availability: [
      [1, '16:00', '20:00', 0], [3, '16:00', '20:00', 0], [6, '08:00', '12:00', 0],
      [2, '18:00', '21:00', 'online'], [4, '18:00', '21:00', 'online'],
    ],
  },
  {
    email: 'hery.rasolofo@demo.eduloc.mg',
    firstName: 'Hery',
    lastName: 'Rasolofo',
    phone: '+261 34 22 222 22',
    bio: 'Passionné de langues, je prépare aux examens de français et d’anglais avec des méthodes vivantes.',
    experience: 'Formateur en langues pour adultes et lycéens depuis 5 ans.',
    education: 'Licence en lettres modernes, certification TOEFL.',
    degree: 'LICENCE',
    gender: 'MALE',
    subjects: [
      { subject: 'Français', levels: ['6ème', '5ème', '4ème', '3ème', 'Seconde'], description: 'Grammaire, rédaction, lecture suivie.' },
      { subject: 'Anglais', levels: ['3ème', 'Seconde', 'Première', 'Terminale', 'Licence 1'], description: 'Conversation et compréhension écrite.' },
    ],
    offers: [
      { subject: 'Français', level: '3ème', title: 'Français — remise à niveau', description: 'Orthographe, conjugaison et rédaction.', format: 'BOTH', price: 18000 },
      { subject: 'Anglais', level: null, title: 'Anglais conversationnel', description: 'Gagner en aisance à l’oral, tous niveaux.', format: 'ONLINE', price: 20000 },
    ],
    places: [
      { label: 'Ankorondrano', address: 'Ankorondrano, Antananarivo', lat: -18.8856, lng: 47.5255, radius: 6000, type: 'BENEFICIARY_HOME', primary: true },
      { label: 'Chez moi — Ivandry', address: 'Ivandry, Antananarivo', lat: -18.8733, lng: 47.5311, radius: null, type: 'TUTOR_HOME', primary: false },
    ],
    availability: [
      [1, '14:00', '18:00', 0], [2, '14:00', '18:00', 1], [5, '14:00', '18:00', 0],
      [3, '19:00', '21:00', 'online'], [0, '09:00', '12:00', 'online'],
    ],
  },
  {
    email: 'nina.rabe@demo.eduloc.mg',
    firstName: 'Nina',
    lastName: 'Rabe',
    phone: '+261 34 33 333 33',
    bio: 'Ingénieure logiciel : j’aide débutants et étudiants à comprendre la programmation par la pratique.',
    experience: 'Développeuse web depuis 6 ans, mentor dans un bootcamp local.',
    education: 'Ingénieure en informatique, ISPM Antananarivo.',
    degree: 'MASTER',
    gender: 'FEMALE',
    subjects: [
      { subject: 'Programmation', levels: ['Terminale', 'Licence 1', 'Licence 2', 'Licence 3', 'Formation pro'], description: 'Python, JavaScript, SQL.' },
      { subject: 'Informatique', levels: ['Seconde', 'Première', 'Terminale', 'Licence 1'], description: 'Algorithmique et bureautique.' },
    ],
    offers: [
      { subject: 'Programmation', level: 'Licence 1', title: 'Initiation à la programmation Python', description: 'De zéro à vos premiers programmes, projets guidés.', format: 'BOTH', price: 30000 },
      { subject: 'Informatique', level: null, title: 'Algorithmique et logique', description: 'Comprendre les bases pour réussir en informatique.', format: 'ONLINE', price: 24000 },
    ],
    places: [
      { label: 'Médiathèque 67 Ha', address: '67 Ha, Antananarivo', lat: -18.9019, lng: 47.5145, radius: null, type: 'PUBLIC_PLACE', primary: true },
    ],
    availability: [
      [1, '17:00', '20:00', 'online'], [3, '17:00', '20:00', 0], [6, '09:00', '13:00', 'online'],
    ],
  },
];

async function seedDemo_() {
  const password = await argon2.hash('Demo12345!', { type: argon2.argon2id });
  const levels = new Map((await prisma.educationLevel.findMany()).map((l) => [l.name, l.id]));
  const subjects = new Map((await prisma.subject.findMany()).map((s) => [s.name, s.id]));
  const level = (name: string) => {
    const id = levels.get(name);
    if (!id) throw new Error(`Niveau inconnu : ${name}`);
    return id;
  };
  const subject = (name: string) => {
    const id = subjects.get(name);
    if (!id) throw new Error(`Matière inconnue : ${name}`);
    return id;
  };

  for (const t of DEMO_TUTORS) {
    const user = await prisma.user.upsert({
      where: { email: t.email },
      update: {},
      create: {
        email: t.email, password, firstName: t.firstName, lastName: t.lastName, phone: t.phone,
        status: 'ACTIVE', emailVerified: true,
      },
    });
    const existing = await prisma.tutorProfile.findUnique({ where: { userId: user.id } });
    if (existing) {
      // idempotent : on ne recrée pas les enfants, on complète seulement le diplôme (ajouté après coup).
      if (!existing.highestDegree || !existing.gender) await prisma.tutorProfile.update({ where: { id: existing.id }, data: { highestDegree: existing.highestDegree ?? t.degree, gender: existing.gender ?? t.gender } });
      continue;
    }

    const profile = await prisma.tutorProfile.create({
      data: {
        userId: user.id,
        displayName: `${t.firstName} ${t.lastName}`,
        bio: t.bio,
        experience: t.experience,
        educationBackground: t.education,
        highestDegree: t.degree,
        gender: t.gender,
        isVisible: true,
        rating: 0,
        reviewsCount: 0,
      },
    });
    await prisma.tutorApplication.create({
      data: { tutorProfileId: profile.id, status: 'APPROVED', submittedAt: new Date(), reviewedAt: new Date() },
    });
    for (const s of t.subjects) {
      for (const l of s.levels) {
        await prisma.tutorSubject.create({
          data: {
            tutorProfileId: profile.id, subjectId: subject(s.subject), educationLevelId: level(l),
            competenceDescription: s.description,
          },
        });
      }
    }
    for (const o of t.offers) {
      await prisma.offer.create({
        data: {
          tutorProfileId: profile.id, subjectId: subject(o.subject),
          educationLevelId: o.level ? level(o.level) : null,
          title: o.title, description: o.description, format: o.format, durationMinutes: 60, price: o.price,
        },
      });
    }
    const placeIds: string[] = [];
    for (const p of t.places) {
      const place = await prisma.place.create({
        data: {
          tutorProfileId: profile.id, label: p.label, address: p.address, latitude: p.lat, longitude: p.lng,
          radius: p.radius, type: p.type, isPrimary: p.primary,
        },
      });
      placeIds.push(place.id);
    }
    const online = await prisma.place.create({
      data: { tutorProfileId: profile.id, label: 'En ligne', type: 'ONLINE' },
    });
    for (const [dayOfWeek, startTime, endTime, where] of t.availability) {
      await prisma.availability.create({
        data: {
          tutorProfileId: profile.id, dayOfWeek, startTime, endTime,
          placeId: where === 'online' ? online.id : placeIds[where],
        },
      });
    }
    console.log(`Tuteur démo : ${t.email}`);
  }

  const requester = await prisma.user.upsert({
    where: { email: 'demo@eduloc.mg' },
    update: {},
    create: {
      email: 'demo@eduloc.mg', password, firstName: 'Mialy', lastName: 'Randria', phone: '+261 34 00 000 00',
      status: 'ACTIVE', emailVerified: true,
    },
  });
  if (!(await prisma.beneficiary.count({ where: { requesterId: requester.id } }))) {
    await prisma.beneficiary.create({
      data: {
        requesterId: requester.id, firstName: 'Mialy', lastName: 'Randria', relationship: 'SELF',
        educationLevelId: level('Licence 1'),
      },
    });
    await prisma.beneficiary.create({
      data: {
        requesterId: requester.id, firstName: 'Tiana', lastName: 'Randria', relationship: 'CHILD',
        educationLevelId: level('3ème'), objective: 'REMEDIAL', difficultyType: 'METHODOLOGICAL',
      },
    });
  }
  console.log('Demandeur démo : demo@eduloc.mg  (mot de passe des comptes démo : Demo12345!)');
}

async function main() {
  await seedCatalog();
  await seedAdmin();
  if (seedDemo) await seedDemo_();
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
