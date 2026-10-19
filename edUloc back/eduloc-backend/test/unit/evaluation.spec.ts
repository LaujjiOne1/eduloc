import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { QUERIES, REQUEST_RANK, TUTORS, TUTOR_RANK, declaredLevels } from '../../eval/dataset';
import { mean, ndcgAtK, quantile, recallAtK } from '../../eval/metrics';
import { isTutorEligible } from '../../src/modules/matching/search/level-eligibility';

describe('métriques d’évaluation', () => {
  it('recall@K : part des pertinents retrouvés dans le top K', () => {
    assert.equal(recallAtK(['a', 'b', 'c'], { a: 2, c: 1, z: 1 }, 10), 2 / 3);
    assert.equal(recallAtK(['a', 'b', 'c'], { z: 1 }, 10), 0);
    assert.equal(recallAtK(['x', 'a'], { a: 1 }, 1), 0, 'au-delà de K ne compte pas');
    assert.equal(recallAtK(['a'], {}, 10), 1);
  });

  it('nDCG@K : 1 pour l’ordre idéal, moins si un très pertinent est plus bas', () => {
    const rel = { a: 2, b: 1 };
    assert.equal(ndcgAtK(['a', 'b'], rel, 10), 1);
    const swapped = ndcgAtK(['b', 'a'], rel, 10);
    assert.ok(swapped < 1 && swapped > 0);
    // Valeur de référence : DCG = 1/log2(2) + 3/log2(3) ; IDCG = 3/log2(2) + 1/log2(3).
    assert.ok(Math.abs(swapped - (1 + 3 / Math.log2(3)) / (3 + 1 / Math.log2(3))) < 1e-12);
    assert.equal(ndcgAtK(['x', 'y'], rel, 10), 0);
    assert.equal(ndcgAtK(['a'], {}, 10), 1);
  });

  it('nDCG@K ignore ce qui dépasse K', () => {
    assert.equal(ndcgAtK(['x', 'a'], { a: 1 }, 1), 0);
  });

  it('moyenne et quantiles', () => {
    assert.equal(mean([1, 2, 3]), 2);
    assert.equal(mean([]), 0);
    assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
    assert.equal(quantile([0, 10], 0.25), 2.5);
  });
});

describe('jeu d’évaluation (spec §10 : 30 à 50 demandes annotées)', () => {
  it('compte 30 à 50 demandes aux identifiants uniques', () => {
    assert.ok(QUERIES.length >= 30 && QUERIES.length <= 50, String(QUERIES.length));
    assert.equal(new Set(QUERIES.map((q) => q.id)).size, QUERIES.length);
  });

  it('chaque demande a au moins un tuteur pertinent, qui existe', () => {
    const keys = new Set(TUTORS.map((t) => t.key));
    assert.equal(keys.size, TUTORS.length);
    for (const q of QUERIES) {
      const ids = Object.keys(q.relevant);
      assert.ok(ids.length >= 1, q.id);
      for (const id of ids) {
        assert.ok(keys.has(id), `${q.id} : tuteur inconnu ${id}`);
        assert.ok([1, 2].includes(q.relevant[id]), `${q.id} : pertinence invalide`);
      }
      assert.ok(Object.values(q.relevant).includes(2) || ids.length >= 2, `${q.id} : annotation sans tuteur très pertinent`);
    }
  });

  it('les annotations ne portent que sur des tuteurs ÉLIGIBLES par le niveau (l’éligibilité ne vient jamais de la similarité)', () => {
    const byKey = new Map(TUTORS.map((t) => [t.key, t]));
    for (const q of QUERIES) {
      for (const key of Object.keys(q.relevant)) {
        const tutor = byKey.get(key)!;
        assert.ok(
          isTutorEligible(REQUEST_RANK[q.level], { rank: TUTOR_RANK[tutor.level], category: 'Université' }),
          `${q.id} (${q.level}) : ${key} (${tutor.level}) n’est pas éligible`,
        );
      }
    }
  });

  it('chaque tuteur annoté déclare le niveau demandé (R4) et chaque matière du catalogue demandée existe', () => {
    const byKey = new Map(TUTORS.map((t) => [t.key, t]));
    const subjectNames = new Set(TUTORS.flatMap((t) => t.subjects.map((s) => s.name)));
    for (const q of QUERIES) {
      if ('catalog' in q.subject) assert.ok(subjectNames.has(q.subject.catalog), `${q.id} : matière ${q.subject.catalog}`);
      for (const key of Object.keys(q.relevant)) assert.ok(declaredLevels(byKey.get(key)!.level).includes(q.level), `${q.id} : ${key} ne déclare pas ${q.level}`);
    }
  });

  it('couvre les cas sémantiques sans mots communs (E11) et les cinq niveaux de demande', () => {
    const text = (id: string) => QUERIES.find((q) => q.id === id)!;
    assert.match(text('Q04').need, /transformées de Fourier/i);
    assert.ok(text('Q04').relevant.T04 === 2, 'Fourier ⇒ Traitement du signal');
    assert.match(text('Q21').need, /MIAGE/);
    assert.match(text('Q22').need, /ingénieur logiciel/i);
    assert.match(text('Q23').need, /Master Informatique/);
    assert.ok(TUTORS.some((t) => /MIAGE/.test(t.degreeTitle)) && TUTORS.some((t) => /ingénieur logiciel/i.test(t.degreeTitle)));
    assert.deepEqual([...new Set(QUERIES.map((q) => q.level))].sort(), ['Licence 1', 'Licence 2', 'Licence 3', 'Master 1', 'Master 2']);
  });

  it('inclut un expert professionnel (E6) et un étudiant en cours de L3', () => {
    assert.ok(TUTORS.some((t) => t.expert && t.level === 'DOCTORAT' && t.highestDegree !== 'DOCTORAT'));
    assert.ok(TUTORS.some((t) => t.level === 'L3'));
  });
});
