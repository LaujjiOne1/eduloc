import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPeriod, descriptionFromSource, groundedRatio, inferAudience, isOngoing, normalizeCv, normalizeDate } from '../../src/modules/cv-import/cv-normalizer';
import { looksGlued, pageText } from '../../src/modules/matching/indexing/pdf-text';
import { entriesToRaw, extractPeriod, parseEducationLine, parseExperienceLine, prepareCv, reconcileEntries, textForSkills, typeFromRole } from '../../src/modules/cv-import/cv-entries';
import { modelOutputSchema, rawCvSchema } from '../../src/modules/cv-import/cv-schema';
import { type MatchCandidate, matchLabel } from '../../src/modules/cv-import/subject-matcher.service';

const CV = `
Hery RAKOTO — Antananarivo — hery@mail.mg — 034 11 222 33
FORMATION
Master en Informatique, Université d'Antananarivo, 2019 - 2021
Licence en Informatique, Université d'Antananarivo, 2016 - 2019
EXPÉRIENCE
Répétiteur de mathématiques et physique — Centre de soutien Antsirabe, septembre 2021 - juin 2023
Collège et lycée. Aide aux devoirs et préparation du BEPC.
Développeur web — ACME Madagascar, 2023
COMPÉTENCES
Mathématiques, Physique, Python
`;

const subject = (name: string, aliases: string[] = []): MatchCandidate => ({
  key: name, label: name, aliases,
  payload: { id: name, name, category: null, description: null, levelCategories: [], isVerified: true },
});

describe('import de CV — validation et garde-fou anti-hallucination', () => {
  it('groundedRatio : un intitulé présent dans le CV est « ancré », un intitulé inventé non', () => {
    assert.ok(groundedRatio('Répétiteur de mathématiques', CV) >= 0.9);
    assert.equal(groundedRatio('Directeur financier chez Google', CV), 0);
  });

  it('normalizeDate : AAAA-MM ou AAAA, jamais une année absente du CV', () => {
    assert.equal(normalizeDate('2021-09', CV), '2021-09');
    assert.equal(normalizeDate('2023', CV), '2023');
    assert.equal(normalizeDate('09/2021', CV), '2021-09');
    assert.equal(normalizeDate('2021-09-01', CV), '2021-09', 'date complète : on garde l’année et le mois');
    assert.equal(normalizeDate('2015-01', CV), null, '2015 ne figure pas dans le CV : date inventée');
    assert.equal(normalizeDate('hier', CV), null);
    assert.equal(buildPeriod('2021-09', '2023-06'), '2021-09 — 2023-06');
    assert.equal(buildPeriod(null, null), '');
  });

  it('une expérience dont ni l’intitulé ni la structure n’existent dans le CV est ignorée et signalée', () => {
    const raw = rawCvSchema.parse({
      experiences: [
        { type: 'SOUTIEN_SCOLAIRE', title: 'Répétiteur de mathématiques et physique', organization: 'Centre de soutien Antsirabe', start_date: '2021-09', end_date: '2023-06', levels: ['COLLEGE', 'LYCEE'], taught_subjects: ['Mathématiques', 'Physique'], confidence: 0.9 },
        { type: 'PROFESSIONNEL', title: 'Directeur financier', organization: 'Banque Mondiale', start_date: '2010', end_date: '2015', confidence: 0.8 },
      ],
    });
    const result = normalizeCv(raw, CV);
    assert.equal(result.experiences.length, 1);
    assert.equal(result.experiences[0].type, 'TEACHING');
    assert.equal(result.experiences[0].period, '2021-09 — 2023-06');
    assert.deepEqual(result.experiences[0].audience, ['Collège', 'Lycée']);
    assert.equal(result.experiences[0].subjectsTaught, 'Mathématiques, Physique');
    assert.deepEqual(result.experiences[0].warnings, []);
    assert.match(result.warnings.join(' '), /1 élément proposé par l’analyse n’a pas été retrouvé dans votre CV/);
  });

  it('champs manquants : période, structure, public — chacun donne un avertissement, jamais une valeur inventée', () => {
    const raw = rawCvSchema.parse({
      experiences: [{ type: null, title: 'Répétiteur de mathématiques', organization: null, start_date: '1999-01', end_date: null }],
    });
    const [x] = normalizeCv(raw, CV).experiences;
    assert.equal(x.type, 'TEACHING', 'type déduit du mot « répétiteur » quand le modèle n’a pas typé');
    assert.equal(x.period, '', 'une date absente du CV n’est jamais conservée');
    const warnings = x.warnings.join(' | ');
    assert.match(warnings, /Période manquante/);
    assert.match(warnings, /structure manquant/);
    // Le public est déduit des mots du CV (« Collège et lycée ») plutôt que laissé vide ou deviné.
    assert.deepEqual(x.audience, ['Collège', 'Lycée']);
    assert.doesNotMatch(warnings, /Public encadré non précisé/);
    assert.match(warnings, /Type d’expérience à confirmer/);
  });

  it('formation : niveau fin → diplôme, le plus élevé en premier, établissement vérifié', () => {
    const raw = rawCvSchema.parse({
      education: [
        { degree: 'Licence en Informatique', level: 'L3', field_or_mention: 'Informatique', institution: 'Université d’Antananarivo', start_date: '2016', end_date: '2019', status: 'OBTENU', confidence: 0.9 },
        { degree: 'Master en Informatique', level: 'M2', field_or_mention: 'Informatique', institution: 'Université d’Antananarivo', start_date: '2019', end_date: '2021', status: 'OBTENU', confidence: 0.9 },
        { degree: 'Diplôme', level: null, field_or_mention: null, institution: 'École imaginaire de Paris', confidence: 0.4 },
      ],
    });
    const { education } = normalizeCv(raw, CV);
    assert.deepEqual(education.map((e) => e.degreeId), ['master', 'licence', null]);
    assert.equal(education[0].period, '2019 — 2021');
    const unknown = education[2];
    assert.ok(unknown.warnings.some((w) => /Niveau d’études non identifié/.test(w)));
    assert.equal(unknown.institution, null, 'établissement introuvable dans le CV : retiré');
    assert.ok(unknown.warnings.some((w) => /Établissement manquant/.test(w)));
  });

  it('le libellé du diplôme prime sur le niveau proposé par le modèle (Licence ≠ BAC)', () => {
    const raw = rawCvSchema.parse({
      education: [{ degree: 'Licence en Informatique', level: 'BAC', field_or_mention: 'Informatique', institution: 'Université d’Antananarivo', start_date: '2016', end_date: '2019' }],
    });
    const [e] = normalizeCv(raw, CV).education;
    assert.equal(e.degreeId, 'licence');
    assert.equal(e.level, null, 'le niveau BAC incohérent n’est pas conservé');
  });

  it('public encadré et matières ne sont gardés que pour l’enseignement et l’encadrement', () => {
    const raw = rawCvSchema.parse({
      experiences: [{ type: 'PROFESSIONNEL', title: 'Développeur web', organization: 'ACME Madagascar', start_date: '2023', levels: ['PRIMAIRE', 'COLLEGE'], taught_subjects: ['Python'] }],
    });
    const [x] = normalizeCv(raw, CV).experiences;
    assert.deepEqual(x.audience, []);
    assert.equal(x.subjectsTaught, null);
    assert.ok(!x.warnings.some((w) => /Public encadré/.test(w)), 'pas d’avertissement « public » pour un poste non pédagogique');
  });

  it('profil : e-mail et téléphone invraisemblables sont rejetés', () => {
    const raw = rawCvSchema.parse({ profile: { full_name: 'Hery RAKOTO', email: 'pas-un-mail', phone: '12', city: 'Antananarivo' } });
    const { profile } = normalizeCv(raw, CV);
    assert.equal(profile.email, null);
    assert.equal(profile.phone, null);
    assert.equal(profile.fullName, 'Hery RAKOTO');
  });

  it('compétences : celles que le CV ne mentionne pas sont écartées', () => {
    const raw = rawCvSchema.parse({ skills: [{ label: 'Python', category: 'LANGAGE', confidence: 0.9 }, { label: 'Kubernetes', category: 'OUTIL', confidence: 0.7 }] });
    assert.deepEqual(normalizeCv(raw, CV).skills.map((s) => s.label), ['Python']);
  });

  it('la sortie du LLM est tolérée : types approximatifs, listes manquantes, confiance hors bornes', () => {
    const raw = rawCvSchema.parse({ experiences: [{ title: 42, taught_subjects: 'maths', levels: null, confidence: 7 }] });
    assert.equal(raw.experiences[0].title, '42');
    assert.deepEqual(raw.experiences[0].taught_subjects, []);
    assert.equal(raw.experiences[0].confidence, 1);
    assert.deepEqual(rawCvSchema.parse({}).education, []);
  });

  it('un CV sans rien d’exploitable donne des avertissements globaux plutôt qu’une erreur', () => {
    const result = normalizeCv(rawCvSchema.parse({}), CV);
    assert.equal(result.experiences.length, 0);
    assert.equal(result.warnings.length, 2);
  });
});

describe('import de CV — rapprochement du catalogue (EmbeddingGemma après l’extraction)', () => {
  const catalog = [subject('Mathématiques', ['Maths']), subject('Programmation'), subject('Physique-Chimie')];

  it('égalité, synonyme, puis inclusion d’un mot entier', async () => {
    assert.equal((await matchLabel('mathématiques', catalog))?.by, 'exact');
    assert.equal((await matchLabel('maths', catalog))?.by, 'alias');
    assert.equal((await matchLabel('Programmation Python', catalog))?.by, 'contains');
    assert.equal(await matchLabel('Cuisine', catalog), null);
  });

  it('similarité sémantique : acceptée au-dessus du seuil, refusée en dessous', async () => {
    const vectors = [[1, 0], [0, 1], [0.6, 0.8]];
    const near = await matchLabel('Dév. web', catalog, { queryVector: async () => [0, 1], candidateVectors: async () => vectors });
    assert.equal(near?.by, 'embedding');
    assert.equal(near?.candidate.label, 'Programmation');
    const far = await matchLabel('Dév. web', catalog, { queryVector: async () => [0.7, -0.7], candidateVectors: async () => vectors });
    assert.equal(far, null);
  });
});

describe('lecture des PDF (texte par position, texte sans espaces)', () => {
  it('pageText : lignes reconstituées par position, espace ajouté quand l’écart le justifie', () => {
    const item = (str: string, x: number, y: number, width: number) => ({ str, transform: [12, 0, 0, 12, x, y], width });
    const text = pageText([
      item('Marie', 50, 700, 30),
      item('Curie', 90, 700, 30), // écart de 10 pt > 18 % de 12 pt : un espace
      item('Physicienne', 50, 680, 60),
      item('Master', 50, 660, 36),
      item('2', 86, 660, 6), // collé au mot précédent : pas d’espace
    ]);
    assert.equal(text, 'Marie Curie\nPhysicienne\nMaster2');
  });

  it('looksGlued : un texte français normal non, un texte sans espaces oui', () => {
    const normal = 'Étudiante en Master 2 Informatique, passionnée par la transmission des connaissances. '.repeat(8);
    assert.equal(looksGlued(normal), false);
    assert.equal(looksGlued(normal.replace(/ /g, '')), true);
    assert.equal(looksGlued('TIDARATSARANJANAHARY'), false, 'trop court pour conclure');
  });
});

describe('lecture par numéros de ligne (rapidité sur CPU)', () => {
  const FORMATION_CV = [
    'Awa Diallo', 'Profil', 'Étudiante passionnée par la transmission.', 'Formation',
    'Master 2 Génie Logiciel — Université Cheikh Anta Diop de Dakar — 2024 à 2026 (en cours)',
    'Licence Informatique — Université Cheikh Anta Diop de Dakar — 2021 à 2024',
    'Expériences',
    'Tutrice en mathématiques et physique — Centre Éducatif Horizon — Septembre 2023 à aujourd’hui',
    'Accompagnement d’élèves de Terminale C et D. Suivi individualisé.',
    'Projet académique : Plateforme de gestion de bibliothèque — Université Cheikh Anta Diop — 2024',
    'Conception d’une application web avec Python.',
    'Compétences', 'Python, Django',
  ].join('\n');

  it('prepareCv : le modèle ne lit que les rubriques Formation et Expériences, lignes numérotées', () => {
    const cv = prepareCv(FORMATION_CV);
    assert.ok(cv.prompt.startsWith('3| Formation'));
    assert.ok(!cv.prompt.includes('Profil'));
    assert.ok(!cv.prompt.includes('Python, Django'));
    assert.deepEqual(cv.guess.education.map((e) => e.n), [4, 5]);
    assert.deepEqual(cv.guess.experiences.map((e) => e.n), [7, 9]);
  });

  it('extractPeriod : mois en toutes lettres, « aujourd’hui », années, MM/AAAA', () => {
    const range = extractPeriod('Poste — Structure — Septembre 2023 à aujourd’hui');
    assert.deepEqual([range.start, range.end, range.rest.trim()], ['Septembre 2023', 'aujourd’hui', 'Poste — Structure —']);
    assert.equal(extractPeriod('Master — 2024 à 2026 (en cours)').end, '2026');
    assert.equal(extractPeriod('Licence 2021-2024').start, '2021');
    assert.equal(extractPeriod('Stage 09/2022').start, '09/2022');
    assert.equal(extractPeriod('Aucune date ici').start, null);
  });

  it('parseExperienceLine / parseEducationLine : intitulé, structure, période, domaine déduit du diplôme', () => {
    const exp = parseExperienceLine(FORMATION_CV.split('\n'), 7);
    assert.equal(exp.title, 'Tutrice en mathématiques et physique');
    assert.equal(exp.organization, 'Centre Éducatif Horizon');
    assert.equal(exp.start, 'Septembre 2023');
    const edu = parseEducationLine(FORMATION_CV.split('\n'), 4);
    assert.equal(edu.title, 'Master 2 Génie Logiciel');
    assert.equal(edu.field, 'Génie Logiciel');
    assert.equal(edu.organization, 'Université Cheikh Anta Diop de Dakar');
    // Structure sur la ligne suivante quand l'intitulé est seul sur sa ligne
    const multi = parseExperienceLine(['Développeur web', 'ACME Madagascar', '2022 - 2023', 'Création de sites.'], 0);
    assert.deepEqual([multi.title, multi.organization, multi.start, multi.end], ['Développeur web', 'ACME Madagascar', '2022', '2023']);
  });

  it('reconcileEntries : un numéro faux est recalé, une rubrique n’est pas une entrée, les en-têtes oubliés sont ajoutés', () => {
    const cv = prepareCv(FORMATION_CV);
    const reconciled = reconcileEntries(
      {
        education: [{ n: 3 }], // « Formation » : une rubrique, pas un diplôme
        experiences: [{ n: 8, ty: 'ENSEIGNEMENT' }, { n: 5, ty: 'ENSEIGNEMENT' }], // description → recalée sur l'intitulé (7) ; n° 5 est une formation
      },
      cv,
    );
    assert.deepEqual(reconciled.education.map((e) => e.n), [4, 5], 'les diplômes oubliés par le modèle sont ajoutés');
    assert.deepEqual(reconciled.experiences.map((e) => e.n), [7, 9]);
    assert.equal(reconciled.experiences[0].ty, 'ENSEIGNEMENT');
  });

  const OCR_CV = [
    'TIDA RATSARANJANAHARY', 'PROFIL PROFESSIONNEL', 'Etudiant en Master 2 Genie Logiciel.',
    'FORMATION',
    'Master 2 en Genie Logiciel (Developpement logiciel) (En cours)',
    "Ecole Nationale d'Informatique - ENI",
    'Licence en Genie Logiciel (Developpement logiciel)',
    "Ecole Nationale d'Informatique - ENI",
    'EXPERIENCES PROFESSIONNELLES',
    "Ministere du Developpement et de I'Amenagement du Territoire (MDAT) I 2024 - 2025",
    'Stagiaire Developpeur SI / Analyste fonctionnel junior',
    '- Analyse des besoins fonctionnels des utilisateurs institutionnels',
    'PROJETS ACADEMIQUES SIGNIFICATIFS',
    "Application de gestion d'etudiants",
    "ReactJs, ExpressJs, MariaDB I 2023-2024 - Principes d'ergonomie IHM",
    'COMPETENCES TECHNIQUES', 'Python (Django REST), Java',
    'LANGUES', 'Malgache Francais Anglais',
  ];

  it('mise en page réelle (OCR) : structure + période puis poste, titre de projet avant les technologies, diplôme puis école', () => {
    const edu = parseEducationLine(OCR_CV, 5); // le modèle a désigné la ligne de l'école
    assert.equal(edu.title, 'Master 2 en Genie Logiciel (Developpement logiciel)');
    assert.equal(edu.organization, "Ecole Nationale d'Informatique");
    assert.equal(edu.field, 'Genie Logiciel (Developpement logiciel)');

    const job = parseExperienceLine(OCR_CV, 9);
    assert.equal(job.title, 'Stagiaire Developpeur SI / Analyste fonctionnel junior');
    assert.match(job.organization ?? '', /^Ministere du Developpement et de I'Amenagement du Territoire \(MDAT\)$/);
    assert.deepEqual([job.start, job.end], ['2024', '2025']);

    const project = parseExperienceLine(OCR_CV, 14);
    assert.equal(project.title, "Application de gestion d'etudiants");
    assert.equal(project.start, '2023');
  });

  it('prepareCv sur cette mise en page : formations sans période repérées par leur mot de début, Langues exclues des compétences', () => {
    const cv = prepareCv(OCR_CV.join('\n'));
    assert.deepEqual(cv.guess.education.map((e) => e.n), [4, 6]);
    assert.deepEqual(cv.guess.experiences.map((e) => e.n), [9, 14]);
    const skillsText = textForSkills(cv);
    assert.ok(skillsText.includes('Python'));
    assert.ok(!skillsText.includes('Malgache'), 'la rubrique Langues est exclue');
  });

  it('entriesToRaw : un projet est un projet, quoi qu’en dise le modèle', () => {
    const cv = prepareCv(FORMATION_CV);
    const raw = entriesToRaw({ education: [], experiences: [{ n: 9, ty: 'ENSEIGNEMENT' }] }, cv.lines);
    assert.equal(raw.experiences[0].type, 'PROJET');
    assert.equal(raw.experiences[0].title, 'Plateforme de gestion de bibliothèque');
  });

  it('dates en toutes lettres, « aujourd’hui » et public déduit du texte', () => {
    assert.equal(normalizeDate('Septembre 2021', CV), '2021-09');
    assert.equal(normalizeDate('sept. 2021', CV), '2021-09');
    assert.equal(normalizeDate('janvier 2022', 'Janvier 2022 à Août 2023'), '2022-01');
    assert.equal(isOngoing('aujourd’hui'), true);
    assert.equal(isOngoing('Août 2023'), false);
    assert.deepEqual(inferAudience('Accompagnement d’élèves de Terminale C et D'), ['Lycée']);
    assert.deepEqual(inferAudience('étudiants de L1 et L2, collège'), ['Collège', 'Université']);
  });

  it('période en cours : « septembre 2023 à aujourd’hui » → « 2023-09 — en cours », sans avertissement de date', () => {
    const text = 'Tutrice en mathématiques — Centre Horizon — Septembre 2023 à aujourd’hui';
    const raw = rawCvSchema.parse({ experiences: [{ type: 'ENSEIGNEMENT', title: 'Tutrice en mathématiques', organization: 'Centre Horizon', start_date: 'Septembre 2023', end_date: 'aujourd’hui' }] });
    const [x] = normalizeCv(raw, text).experiences;
    assert.equal(x.period, '2023-09 — en cours');
    assert.ok(!x.warnings.some((w) => /date/i.test(w)), x.warnings.join(' | '));
  });

  it('la description est reprise du CV, jamais écrite par le modèle', () => {
    const description = descriptionFromSource('Répétiteur de mathématiques et physique', CV);
    assert.equal(description, 'Collège et lycée. Aide aux devoirs et préparation du BEPC.');
    assert.equal(descriptionFromSource('Directeur financier', CV), null);
  });

  it('un texte sans espaces reste vérifiable (l’intitulé est retrouvé comme sous-chaîne)', () => {
    const glued = 'StagiaireITAnalysteFonctionnelJuniorDeveloppeurLogiciel Madagascar 2023';
    assert.ok(groundedRatio('Stagiaire IT Analyste Fonctionnel Junior', glued) >= 0.9);
  });

  it('prepareCv : les puces de description sortent de ce que lit le modèle, pas du CV', () => {
    const lines = [
      'Expériences',
      'Répétiteur de maths — Centre X — 2020 à 2022',
      '- Cours aux élèves de 3ème',
      '- Préparation du BEPC',
      '- Stage chez ACME — 2023',
    ];
    const cv = prepareCv(lines.join('\n'));
    assert.ok(!cv.prompt.includes('Cours aux élèves'), 'une puce sous un intitulé est une description');
    assert.ok(cv.prompt.includes('Stage chez ACME'), 'une puce datée peut être une entrée');
    assert.equal(cv.lines.length, 5, 'le texte du CV reste entier pour la description et le public');

    const listed = prepareCv(['Expériences', '- Professeur de maths au lycée Y', '- Répétiteur à domicile'].join('\n'));
    assert.ok(listed.prompt.includes('Professeur de maths') && listed.prompt.includes('Répétiteur à domicile'), 'entrées en liste à puces : toutes gardées');
  });

  it('sortie du modèle : deux listes d’entiers, rien d’autre à générer', () => {
    assert.deepEqual(modelOutputSchema.parse(JSON.parse('{"e":[9,10],"x":[12,"18"]}')), {
      education: [{ n: 9 }, { n: 10 }],
      experiences: [{ n: 12 }, { n: 18 }],
    });
    assert.deepEqual(modelOutputSchema.parse({}), { education: [], experiences: [] });
  });

  it('typeFromRole : le type vient de l’intitulé, pas du modèle', () => {
    assert.equal(typeFromRole('Répétitrice en informatique'), 'SOUTIEN_SCOLAIRE');
    assert.equal(typeFromRole('Tutrice en mathématiques et physique'), 'ACADEMIQUE');
    assert.equal(typeFromRole('Professeur de physique-chimie'), 'ENSEIGNEMENT');
    assert.equal(typeFromRole('Bénévole à la Croix-Rouge'), 'BENEVOLAT');
    assert.equal(typeFromRole('Stagiaire Développeur SI / Analyste fonctionnel junior'), null);
    const cv = prepareCv(FORMATION_CV);
    const raw = entriesToRaw({ education: [], experiences: [{ n: 7 }] }, cv.lines, cv.headings);
    assert.equal(raw.experiences[0].type, 'ACADEMIQUE');
  });

  it('formation écrite « Diplôme, Établissement, période » : la virgule sépare le diplôme de l’école', () => {
    const p = parseEducationLine(["Master en Informatique, Université d'Antananarivo, 2019 - 2021"], 0);
    assert.equal(p.title, 'Master en Informatique');
    assert.equal(p.organization, "Université d'Antananarivo");
    assert.deepEqual([p.start, p.end], ['2019', '2021']);
  });

  it('reconcileEntries : la ligne de nom et de contact avant les rubriques n’est jamais une formation', () => {
    const cv = prepareCv(CV);
    const reconciled = reconcileEntries({ education: [{ n: 0 }], experiences: [{ n: 0 }] }, cv);
    assert.ok(!reconciled.education.some((e) => e.n === 0));
    assert.ok(!reconciled.experiences.some((e) => e.n === 0));
    assert.equal(reconciled.education.length, 2);
  });
});
