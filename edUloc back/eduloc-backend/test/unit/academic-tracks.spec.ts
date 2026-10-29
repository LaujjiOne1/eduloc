import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HIGH_SCHOOL_SUBJECT_TRACKS, MENTIONS, MENTION_DOMAINS, SERIES, SERIES_ECONOMIC, SERIES_LITERARY, SERIES_SCIENTIFIC, UNIVERSITY_SUBJECT_MENTIONS, UNIVERSITY_SUBJECT_TRACKS, mentionCode } from '../../src/modules/catalog/domain/academic-tracks';
import { CATALOG_LEVELS, PRIMARY_FIRST_CYCLE_LEVELS, trackKindOfLevel } from '../../src/modules/catalog/domain/education-levels';

describe('filière à choisir selon le niveau (étape 2 de l’entonnoir)', () => {
  it('Primaire, Collège et Seconde passent directement à la matière', () => {
    for (const name of ['11ème', '10ème', '9ème', '8ème', '7ème']) assert.equal(trackKindOfLevel('Primaire', name), null, name);
    for (const name of ['6ème', '5ème', '4ème', '3ème']) assert.equal(trackKindOfLevel('Collège', name), null, name);
    assert.equal(trackKindOfLevel('Lycée', 'Seconde'), null);
  });

  it('Première et Terminale demandent une série', () => {
    assert.equal(trackKindOfLevel('Lycée', 'Première'), 'SERIE');
    assert.equal(trackKindOfLevel('Lycée', 'Terminale'), 'SERIE');
  });

  it('tout niveau universitaire sur l’échelle demande une mention ; « Formation pro » non', () => {
    for (const name of ['Licence 1', 'Licence 2', 'Licence 3', 'Master 1', 'Master 2', 'Doctorat 1', 'Doctorat 2', 'Doctorat 3']) {
      assert.equal(trackKindOfLevel('Université', name), 'MENTION', name);
    }
    assert.equal(trackKindOfLevel('Université', 'Formation pro'), null);
  });

  it('le catalogue propose bien 5 niveaux au primaire (11ème → 7ème) et 3 années de doctorat', () => {
    const names = (category: string) => CATALOG_LEVELS.find((l) => l.category === category)?.names ?? [];
    assert.deepEqual(names('Primaire'), ['11ème', '10ème', '9ème', '8ème', '7ème']);
    assert.deepEqual(names('Université').filter((n) => n.startsWith('Doctorat')), ['Doctorat 1', 'Doctorat 2', 'Doctorat 3']);
  });
});

describe('séries du lycée', () => {
  const codes = (levelName: string, programme: string) =>
    SERIES.filter((s) => s.levelName === levelName && s.programme === programme).map((s) => s.code);

  it('Première et Terminale ont leurs séries en parallèle : PS ↔ TS, POSE ↔ TOSE, PL ↔ TL', () => {
    assert.deepEqual(codes('Première', 'NOUVEAU'), ['POSE', 'PS', 'PL']);
    assert.deepEqual(codes('Terminale', 'NOUVEAU'), ['TOSE', 'TS', 'TL']);
    assert.deepEqual(codes('Première', 'ANCIEN'), ['PA1', 'PA2', 'PC', 'PD']);
    assert.deepEqual(codes('Terminale', 'ANCIEN'), ['TA1', 'TA2', 'TC', 'TD']);
  });

  it('chaque série de Première a son parallèle en Terminale', () => {
    const premiere = SERIES.filter((s) => s.levelName === 'Première').map((s) => s.code.slice(1));
    const terminale = SERIES.filter((s) => s.levelName === 'Terminale').map((s) => s.code.slice(1));
    assert.deepEqual(premiere, terminale);
  });

  it('les familles de séries couvrent chaque série exactement une fois', () => {
    const all = [...SERIES_SCIENTIFIC, ...SERIES_ECONOMIC, ...SERIES_LITERARY].sort();
    assert.deepEqual(all, SERIES.map((s) => s.code).sort());
  });
});

describe('primaire : deux sous-cycles', () => {
  it('Niveau I = T1 à T3 (11ème, 10ème, 9ème), tous présents dans le catalogue du primaire', () => {
    const primary = CATALOG_LEVELS.find((l) => l.category === 'Primaire')?.names ?? [];
    assert.deepEqual(PRIMARY_FIRST_CYCLE_LEVELS, primary.slice(0, 3));
    assert.deepEqual(primary.slice(3), ['8ème', '7ème']);
  });
});

describe('matières propres à chaque série du lycée', () => {
  const subjectsOf = (code: string) =>
    Object.entries(HIGH_SCHOOL_SUBJECT_TRACKS).filter(([, codes]) => codes.includes(code)).map(([name]) => name).sort();

  it('les codes cités existent tous parmi les séries', () => {
    const known = new Set(SERIES.map((s) => s.code));
    for (const [name, codes] of Object.entries(HIGH_SCHOOL_SUBJECT_TRACKS)) {
      for (const code of codes) assert.ok(known.has(code), `${name} → ${code}`);
    }
  });

  it('Terminale OSE : SES, SP, SVT et Philosophie, sans EAC ni TICE', () => {
    assert.deepEqual(subjectsOf('TOSE'), [
      'Philosophie', 'Sciences Physiques (SP)', 'Sciences de la Vie et de la Terre (SVT)', 'Sciences Économiques et Sociales (SES)',
    ].sort());
  });

  it('les LV2 (Allemand, Espagnol, Russe) ne sont liées à aucune série : proposées partout au lycée', () => {
    for (const name of ['Allemand', 'Espagnol', 'Russe']) assert.equal(HIGH_SCHOOL_SUBJECT_TRACKS[name], undefined, name);
  });

  it('EAC et TICE : Première du nouveau programme uniquement', () => {
    for (const name of ['Éducation à la Citoyenneté', 'Technologie de l’Information et de la Communication en Éducation (TICE)']) {
      assert.deepEqual([...HIGH_SCHOOL_SUBJECT_TRACKS[name]].sort(), ['PL', 'POSE', 'PS']);
    }
  });

  it('Philosophie : dès la Première en nouveau programme, en Terminale seulement dans l’ancien', () => {
    const philosophie = HIGH_SCHOOL_SUBJECT_TRACKS.Philosophie;
    assert.ok(philosophie.includes('PS') && philosophie.includes('TS'));
    assert.ok(!philosophie.includes('PC') && !philosophie.includes('PA1') && philosophie.includes('TC') && philosophie.includes('TA1'));
  });

  it('séries C et D : pas de SES ; séries A1 et A2 : ni SP, ni SVT, ni SES', () => {
    assert.deepEqual(subjectsOf('TC'), ['Philosophie', 'Sciences Physiques (SP)', 'Sciences de la Vie et de la Terre (SVT)'].sort());
    assert.deepEqual(subjectsOf('TA1'), ['Philosophie']);
    assert.deepEqual(subjectsOf('PA2'), []);
  });
});

describe('matières par mention universitaire', () => {
  const mentionCodes = new Set(MENTIONS.map((m) => m.code));

  it('chaque matière est rattachée à au moins une mention qui existe', () => {
    for (const [subject, mentions] of Object.entries(UNIVERSITY_SUBJECT_MENTIONS)) {
      assert.ok(mentions.length > 0, subject);
      for (const mention of mentions) assert.ok(MENTIONS.some((m) => m.name === mention), `${subject} → ${mention}`);
    }
  });

  it('les codes de mention donnés au catalogue sont ceux des mentions (et sans doublon)', () => {
    for (const [subject, codes] of Object.entries(UNIVERSITY_SUBJECT_TRACKS)) {
      assert.equal(new Set(codes).size, codes.length, `${subject} : doublon`);
      for (const code of codes) assert.ok(mentionCodes.has(code), `${subject} → ${code}`);
    }
  });

  it('aucun nom de matière n’est commun au lycée et à l’université (un seul rattachement par matière)', () => {
    for (const subject of Object.keys(UNIVERSITY_SUBJECT_TRACKS)) assert.equal(HIGH_SCHOOL_SUBJECT_TRACKS[subject], undefined, subject);
  });

  it('l’informatique du CNTEMAD : Génie logiciel pour la mention Informatique, pas pour le Droit', () => {
    assert.ok(UNIVERSITY_SUBJECT_TRACKS['Génie logiciel'].includes('INFORMATIQUE'));
    assert.ok(!UNIVERSITY_SUBJECT_TRACKS['Génie logiciel'].includes(mentionCode('Droit (Droit Public / Droit Privé)')));
  });
});

describe('mentions universitaires (nomenclature SISE)', () => {
  it('4 domaines mères ; 34 mentions de la nomenclature + 17 ajoutées d’après le recensement des universités', () => {
    assert.equal(MENTION_DOMAINS.length, 4);
    assert.equal(MENTIONS.length, 51);
  });

  it('les mentions ajoutées figurent dans le bon domaine', () => {
    const domainOf = (name: string) => MENTIONS.find((m) => m.name === name)?.domain;
    assert.equal(domainOf('Génie Industriel et Mécanique'), 'Sciences, Technologies et Santé');
    assert.equal(domainOf('Médecine Vétérinaire'), 'Sciences, Technologies et Santé');
    assert.equal(domainOf('Tourisme et Hôtellerie'), 'Droit, Économie et Gestion');
    assert.equal(domainOf('Développement Social et Local'), 'Sciences Humaines et Sociales');
  });

  it('chaque mention retrouve son Domaine mère', () => {
    assert.equal(MENTIONS.find((m) => m.name === 'Informatique')?.domain, 'Sciences, Technologies et Santé');
    assert.equal(MENTIONS.find((m) => m.name === 'Science Politique')?.domain, 'Droit, Économie et Gestion');
    assert.equal(MENTIONS.find((m) => m.name === 'Philosophie')?.domain, 'Sciences Humaines et Sociales');
    assert.equal(MENTIONS.find((m) => m.name === 'Design')?.domain, 'Arts, Lettres et Langues');
  });

  it('les codes sont uniques et stables (sans accents ni ponctuation)', () => {
    assert.equal(new Set(MENTIONS.map((m) => m.code)).size, MENTIONS.length);
    assert.equal(mentionCode('Comptabilité, Contrôle, Audit (CCA)'), 'COMPTABILITE_CONTROLE_AUDIT_CCA');
    assert.equal(mentionCode("Sciences de l'Éducation"), 'SCIENCES_DE_L_EDUCATION');
  });
});
