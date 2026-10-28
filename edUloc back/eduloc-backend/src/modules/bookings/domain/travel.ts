/**
 * Déplacement du Tuteur chez le Bénéficiaire : distance de référence et zone. Fonctions pures.
 *
 * Position de référence = centre de la zone de déplacement du Tuteur (lieu BENEFICIARY_HOME, `radius` = rayon maximal) ;
 * à défaut, son domicile (TUTOR_HOME, sans rayon). La distance est mesurée jusqu'à l'adresse APPROXIMATIVE du Demandeur.
 */
export interface LatLng { lat: number; lng: number }

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Distance à vol d'oiseau (haversine), en mètres. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Une position de référence du Tuteur (domicile ou centre de sa zone de déplacement). */
export interface ReferencePlace { type: string; latitude: number | null; longitude: number | null }

/**
 * La salle est-elle dans la zone d'intervention du Tuteur ? Sans rayon défini, sans position de référence ou sans
 * coordonnées de salle, rien n'est contrôlé (comportement historique : le Tuteur choisit ses salles à la main).
 */
export function roomWithinTutorZone(
  references: readonly ReferencePlace[], room: { latitude: number | null; longitude: number | null }, radiusM: number | null,
): boolean {
  if (radiusM === null || room.latitude === null || room.longitude === null) return true;
  const located = references.filter((p) => (p.type === 'TUTOR_HOME' || p.type === 'BENEFICIARY_HOME') && p.latitude !== null && p.longitude !== null);
  if (located.length === 0) return true;
  const target = { lat: room.latitude, lng: room.longitude };
  return located.some((p) => distanceMeters({ lat: p.latitude!, lng: p.longitude! }, target) <= radiusM);
}

export interface TravelPlace {
  type: string;
  latitude: number | null;
  longitude: number | null;
  /** Rayon maximal de déplacement (mètres) ; null = non borné. */
  radius: number | null;
}

export type TravelResolution =
  /** Le Tuteur n'a aucune position de référence : ni frais ni contrôle de zone (comportement historique). */
  | { kind: 'NO_REFERENCE' }
  | { kind: 'OUT_OF_ZONE' }
  | { kind: 'OK'; distanceM: number };

/**
 * Choisit la position de référence la plus proche parmi les zones de déplacement qui couvrent l'adresse ;
 * aucune ne la couvre → hors zone. Sans zone localisée, le domicile du Tuteur sert de repère, sans limite.
 */
export function resolveTravel(places: readonly TravelPlace[], target: LatLng): TravelResolution {
  const located = (p: TravelPlace): p is TravelPlace & { latitude: number; longitude: number } =>
    p.latitude !== null && p.longitude !== null;
  const zones = places.filter((p) => p.type === 'BENEFICIARY_HOME').filter(located);
  const home = places.filter((p) => p.type === 'TUTOR_HOME').filter(located);
  const candidates = zones.length > 0 ? zones : home;
  if (candidates.length === 0) return { kind: 'NO_REFERENCE' };
  const reachable = candidates
    .map((p) => ({ p, d: distanceMeters({ lat: p.latitude, lng: p.longitude }, target) }))
    .filter(({ p, d }) => p.radius === null || p.radius === 0 || d <= p.radius)
    .sort((x, y) => x.d - y.d);
  return reachable.length > 0 ? { kind: 'OK', distanceM: Math.round(reachable[0].d) } : { kind: 'OUT_OF_ZONE' };
}
