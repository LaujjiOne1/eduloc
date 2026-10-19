import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACADEMIC_RANK, ACADEMIC_STEPS, LEVEL_LABEL_TO_STEP, MIN_TUTOR_ACADEMIC_RANK,
  academicLevelNoteRequired, academicRankOfLevel,
} from '../../src/modules/catalog/domain/academic-scale';
import { CATALOG_LEVELS, requiredDegreeFor } from '../../src/modules/catalog/domain/education-levels';

const EXPECTED_ORDER = ['PRIMAIRE', 'COLLEGE', 'LYCEE_BAC', 'L1', 'L2', 'L3', 'M1', 'M2', 'DOCTORAT'];

describe('échelle académique (E2)', () => {
  it('est complète : Primaire < Collège < Lycée/Bac < L1 < L2 < L3 < M1 < M2 < Doctorat', () => {
    assert.deepEqual([...ACADEMIC_STEPS], EXPECTED_ORDER);
    assert.deepEqual(Object.keys(ACADEMIC_RANK).sort(), [...EXPECTED_ORDER].sort());
  });

  it('est strictement croissante, sans trou ni doublon (rangs 1 à 9)', () => {
    const ranks = ACADEMIC_STEPS.map((step) => ACADEMIC_RANK[step]);
    assert.deepEqual(ranks, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (let i = 1; i < ranks.length; i += 1) assert.ok(ranks[i] > ranks[i - 1], `${ACADEMIC_STEPS[i]} > ${ACADEMIC_STEPS[i - 1]}`);
  });

  it('chaque marche est portée par au moins un niveau du catalogue', () => {
    const covered = new Set(
      CATALOG_LEVELS.flatMap(({ category, names }) => names.map((name) => academicRankOfLevel(category, name))),
    );
    for (const step of ACADEMIC_STEPS) assert.ok(covered.has(ACADEMIC_RANK[step]), `aucun niveau pour ${step}`);
  });

  it('suit l’ordre du catalogue sans jamais redescendre (le rang ne dépend pas de displayOrder)', () => {
    const ranked = CATALOG_LEVELS.flatMap(({ category, names }) =>
      names.map((name) => ({ name, rank: academicRankOfLevel(category, name) })),
    ).filter((l): l is { name: string; rank: number } => l.rank !== null);
    for (let i = 1; i < ranked.length; i += 1) {
      assert.ok(ranked[i].rank >= ranked[i - 1].rank, `${ranked[i].name} ne doit pas passer sous ${ranked[i - 1].name}`);
    }
  });

  it('rattache chaque libellé réel du catalogue à la bonne marche', () => {
    const expected: Record<string, number> = {
      '11ème': 1, '10ème': 1, '9ème': 1, '8ème': 1, '7ème': 1,
      '6ème': 2, '5ème': 2, '4ème': 2, '3ème': 2,
      Seconde: 3, Première: 3, Terminale: 3,
      'Licence 1': 4, 'Licence 2': 5, 'Licence 3': 6, 'Master 1': 7, 'Master 2': 8, 'Doctorat 1': 9, 'Doctorat 2': 9, 'Doctorat 3': 9,
    };
    for (const { category, names } of CATALOG_LEVELS) {
      for (const name of names) {
        if (name === 'Formation pro') continue;
        assert.equal(academicRankOfLevel(category, name), expected[name], name);
      }
    }
  });

  it('laisse « Formation pro » et les niveaux inconnus hors échelle', () => {
    assert.equal(academicRankOfLevel('Université', 'Formation pro'), null);
    assert.equal(academicRankOfLevel('Université', 'Licence 4'), null);
    assert.equal(academicRankOfLevel('Autre', 'Terminale'), null);
  });

  it('assimile l’ancien niveau « Master » à M1', () => {
    assert.equal(academicRankOfLevel('Université', 'Master'), ACADEMIC_RANK.M1);
  });

  it('ne référence que des marches existantes', () => {
    for (const entry of LEVEL_LABEL_TO_STEP) assert.ok(ACADEMIC_STEPS.includes(entry.step));
  });

  it('exige au moins le Lycée/Bac pour un tuteur', () => {
    assert.equal(MIN_TUTOR_ACADEMIC_RANK, ACADEMIC_RANK.LYCEE_BAC);
  });
});

describe('justification du niveau Doctorat (E6)', () => {
  it('est obligatoire pour un Doctorat validé sans doctorat (expert professionnel)', () => {
    for (const degree of ['MASTER', 'LICENCE', 'BAC', 'OTHER', null, undefined]) {
      assert.equal(academicLevelNoteRequired(ACADEMIC_RANK.DOCTORAT, degree), true, String(degree));
    }
  });

  it('ne l’est pas pour un docteur ni pour un niveau inférieur', () => {
    assert.equal(academicLevelNoteRequired(ACADEMIC_RANK.DOCTORAT, 'DOCTORAT'), false);
    for (const step of ACADEMIC_STEPS.filter((s) => s !== 'DOCTORAT')) {
      assert.equal(academicLevelNoteRequired(ACADEMIC_RANK[step], 'MASTER'), false, step);
    }
  });
});

describe('diplôme requis des flux existants (inchangé hors nouveaux niveaux)', () => {
  it('garde les valeurs actuelles et couvre Master 1/2 et Doctorat', () => {
    assert.equal(requiredDegreeFor('Lycée', 'Terminale'), 'BAC');
    assert.equal(requiredDegreeFor('Université', 'Licence 2'), 'LICENCE');
    assert.equal(requiredDegreeFor('Université', 'Formation pro'), 'LICENCE');
    assert.equal(requiredDegreeFor('Université', 'Master'), 'MASTER');
    assert.equal(requiredDegreeFor('Université', 'Master 2'), 'MASTER');
    assert.equal(requiredDegreeFor('Université', 'Doctorat'), 'DOCTORAT');
  });
});
