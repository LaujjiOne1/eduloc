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
import { MENTIONS, SERIES, SERIES_ECONOMIC, SERIES_LITERARY, SERIES_SCIENTIFIC } from '../src/modules/catalog/domain/academic-tracks';
import { CATALOG_LEVELS, academicRankOfLevel, requiredDegreeFor } from '../src/modules/catalog/domain/education-levels';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const isProduction = process.env.NODE_ENV === 'production';
const seedDemo = process.env.SEED_DEMO ? process.env.SEED_DEMO === 'true' : !isProduction;

const PRIMARY = ['Primaire'];
const MIDDLE = ['Collège'];
const HIGH = ['Lycée'];
const UNIVERSITY = ['Université'];

type SubjectSeed = {
  name: string;
  category: string;
  description: string;
  /** Vide = tous les niveaux. */
  levelCategories?: string[];
  /** Séries du lycée concernées (Première/Terminale) ; vide = toutes. */
  trackCodes?: string[];
  aliases?: string[];
};

/**
 * Catalogue par bloc d'études (étape 3 de l'entonnoir : seules les matières du bloc choisi sont proposées).
 * Au lycée, `trackCodes` restreint la matière aux séries concernées ; Seconde (tronc commun) les voit toutes.
 */
const SUBJECTS: SubjectSeed[] = [
  // Primaire
  { name: 'Mathématiques', category: 'Sciences', description: 'Calcul, numération, géométrie, algèbre, probabilités.', levelCategories: [...PRIMARY, ...MIDDLE, ...UNIVERSITY], aliases: ['Maths'] },
  { name: 'Français', category: 'Langues', description: 'Grammaire, expression écrite et orale, littérature.', levelCategories: [...PRIMARY, ...MIDDLE, ...HIGH, ...UNIVERSITY] },
  { name: 'Malagasy', category: 'Langues', description: 'Lecture, écriture, littérature malagasy.', levelCategories: [...PRIMARY, ...MIDDLE, ...HIGH] },
  { name: 'Anglais', category: 'Langues', description: 'Initiation, conversation, grammaire, préparation aux examens.', levelCategories: [...PRIMARY, ...MIDDLE, ...HIGH, ...UNIVERSITY] },
  { name: 'Éducation à la Citoyenneté', category: 'Lettres', description: 'Civisme, vivre ensemble, droits et devoirs.', levelCategories: PRIMARY },
  { name: 'Histoire-Géographie', category: 'Lettres', description: 'Histoire de Madagascar et du monde, géographie.', levelCategories: [...PRIMARY, ...MIDDLE, ...HIGH], aliases: ['Histoire', 'Géographie'] },
  { name: 'Technologie', category: 'Sciences', description: 'Objets techniques, initiation au numérique.', levelCategories: [...PRIMARY, ...MIDDLE] },
  { name: 'Arts visuels', category: 'Arts', description: 'Dessin, peinture, arts plastiques.', levelCategories: PRIMARY },
  { name: 'Musique', category: 'Arts', description: 'Chant, rythme, culture musicale.', levelCategories: PRIMARY },
  // Collège
  { name: 'Sciences Physiques et Chimiques', category: 'Sciences', description: 'Matière, énergie, électricité, réactions chimiques.', levelCategories: MIDDLE },
  { name: 'Sciences de la Vie et de la Terre (SVT)', category: 'Sciences', description: 'Biologie, géologie, écologie.', levelCategories: [...MIDDLE, ...HIGH], trackCodes: SERIES_SCIENTIFIC, aliases: ['SVT'] },
  { name: 'EPS', category: 'Sport', description: 'Éducation physique et sportive.', levelCategories: [...MIDDLE, ...HIGH] },
  // Lycée : commun à toutes les séries
  { name: 'Philosophie', category: 'Lettres', description: 'Dissertation, explication de texte, grands auteurs.', levelCategories: [...HIGH, ...UNIVERSITY] },
  // Lycée : séries scientifiques (C, D, S)
  { name: 'Mathématiques Avancées', category: 'Sciences', description: 'Analyse, algèbre, géométrie, probabilités du programme scientifique.', levelCategories: HIGH, trackCodes: SERIES_SCIENTIFIC },
  { name: 'Physique-Chimie', category: 'Sciences', description: 'Mécanique, électricité, chimie générale et organique.', levelCategories: HIGH, trackCodes: SERIES_SCIENTIFIC, aliases: ['Physique', 'Chimie', 'Sciences physiques'] },
  // Lycée : séries économiques (OSE)
  { name: 'Sciences Économiques et Sociales (SES)', category: 'Gestion', description: 'Économie, sociologie, organisation des sociétés.', levelCategories: HIGH, trackCodes: SERIES_ECONOMIC },
  { name: 'Mathématiques Appliquées', category: 'Sciences', description: 'Statistiques, calcul financier, mathématiques pour l’économie.', levelCategories: HIGH, trackCodes: SERIES_ECONOMIC },
  // Lycée : séries littéraires (A1, A2, L)
  { name: 'Littérature', category: 'Lettres', description: 'Étude des œuvres, commentaire, dissertation littéraire.', levelCategories: HIGH, trackCodes: SERIES_LITERARY },
  { name: 'Allemand', category: 'Langues', description: 'Langue allemande.', levelCategories: HIGH, trackCodes: SERIES_LITERARY },
  { name: 'Espagnol', category: 'Langues', description: 'Langue espagnole.', levelCategories: HIGH, trackCodes: SERIES_LITERARY },
  // Université : suggestions (la matière se saisit librement après le choix de la mention)
  { name: 'Informatique', category: 'Numérique', description: 'Algorithmique, systèmes, culture numérique.', levelCategories: UNIVERSITY },
  { name: 'Programmation', category: 'Numérique', description: 'Python, JavaScript, bases de données, web.', levelCategories: UNIVERSITY, aliases: ['Python', 'Développement web', 'JavaScript', 'Java'] },
  { name: 'Économie', category: 'Gestion', description: 'Microéconomie, macroéconomie, gestion.', levelCategories: UNIVERSITY },
  { name: 'Comptabilité', category: 'Gestion', description: 'Comptabilité générale, analytique, fiscalité.', levelCategories: UNIVERSITY },
  { name: 'Algèbre linéaire', category: 'Sciences', description: 'Espaces vectoriels, matrices, applications linéaires.', levelCategories: UNIVERSITY },
  { name: 'Algèbre abstraite', category: 'Sciences', description: 'Groupes, anneaux, corps.', levelCategories: UNIVERSITY },
  { name: 'Analyse réelle', category: 'Sciences', description: 'Suites, séries, intégration.', levelCategories: UNIVERSITY },
  { name: 'Probabilités et statistiques', category: 'Sciences', description: 'Variables aléatoires, estimation, tests.', levelCategories: UNIVERSITY },
  { name: 'Thermodynamique', category: 'Sciences', description: 'Principes, machines thermiques, entropie.', levelCategories: UNIVERSITY },
  { name: 'Chimie organique', category: 'Sciences', description: 'Mécanismes réactionnels, synthèse.', levelCategories: UNIVERSITY },
  { name: 'Bases de données', category: 'Numérique', description: 'SQL, modélisation, optimisation.', levelCategories: UNIVERSITY },
  { name: 'Algorithmique avancée', category: 'Numérique', description: 'Complexité, graphes, programmation dynamique.', levelCategories: UNIVERSITY, aliases: ['Algorithmique'] },
  { name: 'Droit des affaires', category: 'Gestion', description: 'Sociétés, contrats commerciaux.', levelCategories: UNIVERSITY },
  { name: 'Macroéconomie', category: 'Gestion', description: 'Croissance, monnaie, politiques publiques.', levelCategories: UNIVERSITY },
];

async function seedCatalog() {
  let order = 0;
  for (const { category, names } of CATALOG_LEVELS) {
    for (const name of names) {
      order += 1;
      const academicRank = academicRankOfLevel(category, name);
      await prisma.educationLevel.upsert({
        where: { name_category: { name, category } },
        update: { displayOrder: order, isActive: true, requiredDegree: requiredDegreeFor(category, name), academicRank },
        create: { name, category, displayOrder: order, requiredDegree: requiredDegreeFor(category, name), academicRank },
      });
    }
  }
  for (const subject of SUBJECTS) {
    const data = {
      category: subject.category,
      description: subject.description,
      isActive: true,
      isVerified: true,
      levelCategories: subject.levelCategories ?? [],
      trackCodes: subject.trackCodes ?? [],
      aliases: subject.aliases ?? [],
    };
    await prisma.subject.upsert({
      where: { name: subject.name },
      update: data,
      create: { name: subject.name, ...data },
    });
  }
  const tracks = [
    ...SERIES.map((t, i) => ({ kind: 'SERIE' as const, code: t.code, name: t.name, domain: null, programme: t.programme, levelName: t.levelName, displayOrder: i + 1 })),
    ...MENTIONS.map((t, i) => ({ kind: 'MENTION' as const, code: t.code, name: t.name, domain: t.domain, programme: null, levelName: null, displayOrder: i + 1 })),
  ];
  for (const track of tracks) {
    await prisma.academicTrack.upsert({
      where: { kind_code: { kind: track.kind, code: track.code } },
      update: { name: track.name, domain: track.domain, programme: track.programme, levelName: track.levelName, displayOrder: track.displayOrder, isActive: true },
      create: track,
    });
  }
  console.log(`Catalogue : ${SUBJECTS.length} matières, ${order} niveaux, ${SERIES.length} séries, ${MENTIONS.length} mentions.`);
}

/**
 * Offre commerciale de départ des lieux partenaires. Prix, durée et renouvellement ne sont pas arrêtés (spec 8.4) :
 * ce plan PILOTE est gratuit (activation immédiate) ; les offres payantes se créent ensuite via
 * POST /admin/partners/plans, sans toucher au code.
 */
async function seedPartnerPlans() {
  await prisma.partnerPlan.upsert({
    where: { code: 'PILOT' },
    update: {},
    create: {
      code: 'PILOT',
      name: 'Pilote',
      description: 'Offre gratuite de lancement pour les premières structures partenaires.',
      priceAmount: 0,
      currency: 'MGA',
      durationDays: 365,
    },
  });
  console.log('Lieux partenaires : plan PILOT disponible.');
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
  offers: { subject: string; level: string | null; /** Code de série (Première/Terminale) ou de mention. */ track?: string; title: string; description: string; format: 'ONLINE' | 'IN_PERSON' | 'BOTH'; price: number }[];
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
      { subject: 'Mathématiques', levels: ['3ème'], description: 'Algèbre et géométrie, préparation BEPC.' },
      { subject: 'Mathématiques Avancées', levels: ['Seconde', 'Première', 'Terminale'], description: 'Algèbre et analyse, préparation BAC.' },
      { subject: 'Physique-Chimie', levels: ['Seconde', 'Première', 'Terminale'], description: 'Mécanique et électricité.' },
    ],
    offers: [
      { subject: 'Mathématiques Avancées', level: 'Terminale', track: 'TS', title: 'Préparation au BAC — Mathématiques', description: 'Révision du programme, annales corrigées, méthode de rédaction.', format: 'BOTH', price: 25000 },
      { subject: 'Mathématiques', level: '3ème', title: 'Préparation au BEPC — Mathématiques', description: 'Reprendre les bases et réussir l’examen.', format: 'IN_PERSON', price: 20000 },
      { subject: 'Physique-Chimie', level: 'Terminale', track: 'TS', title: 'Physique-Chimie — Terminale', description: 'Cours et exercices types BAC.', format: 'ONLINE', price: 22000 },
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
      { subject: 'Programmation', levels: ['Licence 1', 'Licence 2', 'Licence 3', 'Formation pro'], description: 'Python, JavaScript, SQL.' },
      { subject: 'Informatique', levels: ['Licence 1'], description: 'Algorithmique et bureautique.' },
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
  const tracks = new Map((await prisma.academicTrack.findMany()).map((t) => [t.code, t.id]));
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
          trackId: o.track ? tracks.get(o.track) ?? null : null,
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

/**
 * Salle partenaire de démonstration, déjà validée, publiée et sous souscription active, acceptée par les tuteurs démo.
 * Sans elle le mode « salle partenaire » n'apparaît jamais à la réservation (aucune salle réservable à proposer).
 */
async function seedDemoRoom() {
  const manager = await prisma.user.upsert({
    where: { email: 'salle@demo.eduloc.mg' },
    update: {},
    create: {
      email: 'salle@demo.eduloc.mg', password: await argon2.hash('Demo12345!', { type: argon2.argon2id }),
      firstName: 'Voahangy', lastName: 'Rakotomalala', phone: '+261 34 44 444 44', status: 'ACTIVE', emailVerified: true,
    },
  });
  const now = new Date();
  const venue = await prisma.partnerVenue.upsert({
    where: { managerId: manager.id },
    update: {},
    create: {
      managerId: manager.id, name: 'Espace Savoir Analakely', type: 'COWORKING',
      description: 'Espace de travail calme pour les séances de tutorat.', contactPhone: '+261 34 44 444 44',
      status: 'APPROVED', submittedAt: now, reviewedAt: now,
    },
  });
  const plan = await prisma.partnerPlan.findUniqueOrThrow({ where: { code: 'PILOT' } });
  if (!(await prisma.venueSubscription.count({ where: { venueId: venue.id, status: 'ACTIVE' } }))) {
    await prisma.venueSubscription.create({
      data: { venueId: venue.id, planId: plan.id, status: 'ACTIVE', startsAt: now, endsAt: new Date(now.getTime() + 365 * 86_400_000) },
    });
  }
  let room = await prisma.room.findFirst({ where: { venueId: venue.id, name: 'Salle Tana 1' } });
  if (!room) {
    room = await prisma.room.create({
      data: {
        venueId: venue.id, name: 'Salle Tana 1', description: 'Salle de 6 places avec tableau blanc et wifi.',
        addressLine: 'Rue Ratsimilaho, Analakely', city: 'Antananarivo', latitude: -18.9085, longitude: 47.5249,
        zoneLabel: 'Analakely', capacity: 6, equipment: ['Tableau blanc', 'Wifi'], pricePerHour: 5000,
        rules: 'Respect du calme et du matériel. Séances de tutorat uniquement.',
        status: 'APPROVED', publication: 'PUBLISHED', publishedAt: now, submittedAt: now, reviewedAt: now,
        availabilities: {
          create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: '08:00', endTime: '20:00' })),
        },
      },
    });
  }
  for (const t of DEMO_TUTORS) {
    const user = await prisma.user.findUnique({ where: { email: t.email }, include: { tutorProfile: true } });
    if (!user?.tutorProfile) continue;
    await prisma.tutorRoom.upsert({
      where: { tutorProfileId_roomId: { tutorProfileId: user.tutorProfile.id, roomId: room.id } },
      create: { tutorProfileId: user.tutorProfile.id, roomId: room.id },
      update: { isActive: true },
    });
  }
  console.log('Salle démo : salle@demo.eduloc.mg  (Espace Savoir Analakely — Salle Tana 1)');
}

async function main() {
  await seedCatalog();
  await seedPartnerPlans();
  await seedAdmin();
  if (seedDemo) {
    await seedDemo_();
    await seedDemoRoom();
  }
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
