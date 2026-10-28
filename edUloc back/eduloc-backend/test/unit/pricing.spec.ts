import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { MAX_TRAVEL_FEE, computePriceBreakdown, travelFeeForDistance } from '../../src/modules/bookings/domain/pricing';

describe('forfait de déplacement par tranche', () => {
  it('applique la grille commune, bornes incluses à droite', () => {
    assert.equal(travelFeeForDistance(0), 0);
    assert.equal(travelFeeForDistance(3_000), 0);
    assert.equal(travelFeeForDistance(3_001), 5_000);
    assert.equal(travelFeeForDistance(7_000), 5_000);
    assert.equal(travelFeeForDistance(7_001), 8_000);
    assert.equal(travelFeeForDistance(12_000), 8_000);
    assert.equal(travelFeeForDistance(12_001), 10_000);
    assert.equal(travelFeeForDistance(80_000), 10_000);
    assert.equal(MAX_TRAVEL_FEE, 10_000);
  });
});

describe('total à payer', () => {
  it('exemple de la décision : 25 000 Ar de cours, 10 % de frais de service', () => {
    const b = computePriceBreakdown({ tutorFee: 25_000, commissionRate: 0.1 });
    assert.equal(b.serviceFee, 2_500);
    assert.equal(b.total, 27_500);
    assert.deepEqual(b.split, { tutor: 25_000, partner: 0, platform: 2_500 });
  });

  it('la commission ne porte ni sur le déplacement ni sur la salle', () => {
    const b = computePriceBreakdown({ tutorFee: 25_000, travelFee: 5_000, roomFee: 4_000, commissionRate: 0.1 });
    assert.equal(b.serviceFee, 2_500);
    assert.equal(b.total, 25_000 + 5_000 + 4_000 + 2_500);
    assert.deepEqual(b.split, { tutor: 30_000, partner: 4_000, platform: 2_500 });
    assert.equal(b.split.tutor + b.split.partner + b.split.platform, b.total);
  });

  it('arrondit au centime et refuse un taux hors [0, 1]', () => {
    assert.equal(computePriceBreakdown({ tutorFee: 33.33, commissionRate: 0.1 }).serviceFee, 3.33);
    assert.throws(() => computePriceBreakdown({ tutorFee: 1, commissionRate: 1.5 }), RangeError);
    assert.throws(() => computePriceBreakdown({ tutorFee: 1, commissionRate: -0.1 }), RangeError);
  });
});
