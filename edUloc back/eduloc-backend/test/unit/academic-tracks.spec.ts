import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MENTIONS, MENTION_DOMAINS, SERIES, SERIES_ECONOMIC, SERIES_LITERARY, SERIES_SCIENTIFIC, mentionCode } from '../../src/modules/catalog/domain/academic-tracks';
import { CATALOG_LEVELS, trackKindOfLevel } from '../../src/modules/catalog/domain/education-levels';

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

describe('mentions universitaires (nomenclature SISE)', () => {
  it('4 domaines mères et 34 mentions', () => {
    assert.equal(MENTION_DOMAINS.length, 4);
    assert.equal(MENTIONS.length, 34);
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
