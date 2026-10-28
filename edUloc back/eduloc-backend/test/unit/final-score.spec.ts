import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  DEFAULT_FINAL_WEIGHTS, FinalScoreInput, FinalScoreOptions, proximityScore, rankByFinalScore,
} from '../../src/modules/matching/search/final-score';

const opts: FinalScoreOptions = { maxSlots: 3, windowHours: 14 * 24, ratingPriorMean: 3.5, ratingPriorWeight: 5 };
const base = (id: string, over: Partial<FinalScoreInput> = {}): FinalScoreInput => ({
  tutorProfileId: id, semanticScore: 0.8, slotsCount: 3, firstSlotInHours: 24, proximity: null, rating: 4, reviewsCount: 10, price: 20_000, ...over,
});
const order = (inputs: FinalScoreInput[], o = opts) => rankByFinalScore(inputs, o).map((r) => r.tutorProfileId);

describe('classement final (60 / 20 / 10 / 10)', () => {
  it('les poids par défaut sont ceux de la décision produit et totalisent 1', () => {
    assert.deepEqual(DEFAULT_FINAL_WEIGHTS, { pedagogy: 0.6, availability: 0.2, proximity: 0.1, quality: 0.1 });
    assert.equal(Object.values(DEFAULT_FINAL_WEIGHTS).reduce((a, b) => a + b, 0), 1);
  });

  it('la pédagogie domine : un tuteur nettement plus pertinent passe devant un tuteur plus disponible', () => {
    const result = order([
      base('A', { semanticScore: 0.9, slotsCount: 0, firstSlotInHours: null }),
      base('B', { semanticScore: 0.7, slotsCount: 3, firstSlotInHours: 1 }),
    ]);
    assert.deepEqual(result, ['A', 'B']);
  });

  it('à pertinence égale, la disponibilité puis la qualité départagent', () => {
    assert.deepEqual(order([
      base('libre', { slotsCount: 3, firstSlotInHours: 12 }),
      base('occupé', { slotsCount: 0, firstSlotInHours: null }),
    ]), ['libre', 'occupé']);
    assert.deepEqual(order([
      base('noté', { rating: 5, reviewsCount: 40 }),
      base('moyen', { rating: 3, reviewsCount: 40 }),
    ]), ['noté', 'moyen']);
    assert.deepEqual(order([
      base('abordable', { price: 15_000 }),
      base('cher', { price: 45_000 }),
      base('médian', { price: 20_000 }),
    ])[0], 'abordable');
  });

  it('la proximité, évaluée à part, ne compte que si le demandeur a donné sa position', () => {
    const near = base('proche', { proximity: 1 });
    const far = base('loin', { proximity: 0 });
    assert.deepEqual(order([far, near]), ['proche', 'loin']);
    // Sans position : proximité inconnue pour tous, poids redistribués, l'ordre ne dépend plus d'elle.
    const none = rankByFinalScore([base('A'), base('B', { semanticScore: 0.85 })], opts);
    assert.deepEqual(none.map((r) => r.tutorProfileId), ['B', 'A']);
    assert.ok(none.every((r) => r.parts.proximity === null));
    assert.ok(none[0].final <= 1 && none[0].final >= 0);
  });

  it('un seul tuteur, ou des scores sémantiques identiques : pas de division par zéro', () => {
    const [only] = rankByFinalScore([base('A')], opts);
    assert.equal(only.parts.pedagogy, 1);
    assert.ok(Number.isFinite(only.final));
    assert.deepEqual(rankByFinalScore([], opts), []);
  });

  it('égalité parfaite : ordre stable par identifiant', () => {
    assert.deepEqual(order([base('b'), base('a')]), ['a', 'b']);
  });

  it('proximityScore : 1 sur place, 0 au-delà du rayon', () => {
    assert.equal(proximityScore(0, 10_000), 1);
    assert.equal(proximityScore(5_000, 10_000), 0.5);
    assert.equal(proximityScore(25_000, 10_000), 0);
  });
});
