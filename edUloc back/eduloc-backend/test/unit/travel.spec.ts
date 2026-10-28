import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { distanceMeters, resolveTravel, roomWithinTutorZone } from '../../src/modules/bookings/domain/travel';

const REF = { lat: -18.9, lng: 47.5 };
/** ≈ 1 km de latitude = 0,009°. */
const north = (km: number) => ({ lat: REF.lat + km * 0.009, lng: REF.lng });
const zone = (radius: number | null) => ({ type: 'BENEFICIARY_HOME', latitude: REF.lat, longitude: REF.lng, radius });

describe('distance et zone de déplacement', () => {
  it('haversine : ≈ 1 km pour 0,009° de latitude, 0 pour le même point', () => {
    assert.equal(Math.round(distanceMeters(REF, REF)), 0);
    const d = distanceMeters(REF, north(1));
    assert.ok(d > 990 && d < 1_010, String(d));
  });

  it('retient la zone la plus proche qui couvre l’adresse ; hors de toutes les zones → hors zone', () => {
    const ok = resolveTravel([zone(15_000)], north(5));
    assert.equal(ok.kind, 'OK');
    assert.ok(ok.kind === 'OK' && ok.distanceM > 4_900 && ok.distanceM < 5_100);
    assert.equal(resolveTravel([zone(15_000)], north(30)).kind, 'OUT_OF_ZONE');
    // Deux zones : seule la seconde couvre l'adresse.
    const far = { type: 'BENEFICIARY_HOME', latitude: REF.lat + 0.27, longitude: REF.lng, radius: 5_000 };
    const picked = resolveTravel([zone(5_000), far], north(30));
    assert.equal(picked.kind, 'OK');
  });

  it('sans zone localisée, le domicile sert de repère sans limite ; sans aucun repère, rien n’est contrôlé', () => {
    const home = { type: 'TUTOR_HOME', latitude: REF.lat, longitude: REF.lng, radius: null };
    const r = resolveTravel([home], north(40));
    assert.equal(r.kind, 'OK');
    assert.deepEqual(resolveTravel([], north(5)), { kind: 'NO_REFERENCE' });
    assert.deepEqual(resolveTravel([{ type: 'ONLINE', latitude: null, longitude: null, radius: null }], north(5)), { kind: 'NO_REFERENCE' });
  });

  it('salle dans la zone du tuteur : sans rayon, sans repère ou sans coordonnées, aucun contrôle', () => {
    const refs = [{ type: 'TUTOR_HOME', latitude: REF.lat, longitude: REF.lng }];
    const room = (km: number) => ({ latitude: north(km).lat, longitude: north(km).lng });
    assert.equal(roomWithinTutorZone(refs, room(3), 5_000), true);
    assert.equal(roomWithinTutorZone(refs, room(8), 5_000), false);
    assert.equal(roomWithinTutorZone(refs, room(80), null), true, 'rayon non défini');
    assert.equal(roomWithinTutorZone([], room(80), 5_000), true, 'aucun repère');
    assert.equal(roomWithinTutorZone(refs, { latitude: null, longitude: null }, 5_000), true, 'salle sans coordonnées');
    assert.equal(roomWithinTutorZone([{ type: 'PUBLIC_PLACE', latitude: REF.lat, longitude: REF.lng }], room(80), 5_000), true, 'un lieu public n’est pas un repère');
  });
});
