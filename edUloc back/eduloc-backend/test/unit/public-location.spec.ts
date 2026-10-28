import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { approximateDistance, publicDistance, snapToGrid, toPublicPlace } from '../../src/modules/search/domain/public-location';

const place = (type: string, latitude: number | null, longitude: number | null) =>
  ({ id: 'p1', label: 'Anosy', type, latitude, longitude, radius: 3000 });

describe('positions publiques', () => {
  it('ramène un domicile au centre de sa maille de ~1 km', () => {
    const p = toPublicPlace(place('TUTOR_HOME', -18.91234, 47.52567));
    assert.equal(p.latitude, -18.915);
    assert.equal(p.longitude, 47.525);
    assert.equal(p.approximate, true);
    assert.equal(p.radiusMeters, 3000);
  });

  it('est déterministe et identique pour deux points de la même maille', () => {
    assert.equal(snapToGrid(47.5201), snapToGrid(47.5299));
    assert.notEqual(snapToGrid(47.5299), snapToGrid(47.5301));
  });

  it('laisse intacts un lieu public et un cours en ligne', () => {
    const pub = toPublicPlace(place('PUBLIC_PLACE', -18.91234, 47.52567));
    assert.deepEqual([pub.latitude, pub.longitude, pub.approximate], [-18.91234, 47.52567, false]);
    const online = toPublicPlace(place('ONLINE', null, null));
    assert.deepEqual([online.latitude, online.longitude, online.approximate], [null, null, false]);
  });

  it('arrondit la distance au 500 m supérieur seulement depuis un domicile', () => {
    assert.equal(approximateDistance(1234), 1500);
    assert.equal(publicDistance(1234, 'TUTOR_HOME'), 1500);
    assert.equal(publicDistance(1234, 'PUBLIC_PLACE'), 1234);
    assert.equal(publicDistance(null, 'TUTOR_HOME'), null);
  });
});
