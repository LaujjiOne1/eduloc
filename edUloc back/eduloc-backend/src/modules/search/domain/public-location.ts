/**
 * Positions exposées par les API PUBLIQUES (recherche, fiche tuteur, détail d'offre) : jamais l'adresse exacte
 * d'un domicile. Les lieux publics (bibliothèque, campus) et la zone de déplacement restent utilisables tels quels
 * sur une carte ; les domiciles sont ramenés au centre d'une maille d'environ 1 km. La position précise n'est
 * transmise qu'une fois la séance acceptée (cf. BookingsService, `hideExact`).
 */

/** Types de lieux dont la position exacte est privée (domicile du tuteur, centre de sa zone de déplacement). */
const PRIVATE_PLACE_TYPES: ReadonlySet<string> = new Set(['TUTOR_HOME', 'BENEFICIARY_HOME']);

/** Pas de la maille en degrés : 0,01° ≈ 1,1 km en latitude (un peu moins en longitude, à Madagascar). */
const GRID_DEGREES = 0.01;

export const isPrivatePlaceType = (type: string): boolean => PRIVATE_PLACE_TYPES.has(type);

/** Centre de la maille contenant la coordonnée : déterministe, donc plusieurs requêtes ne permettent pas de moyenner. */
export const snapToGrid = (degrees: number): number =>
  Math.round((Math.floor(degrees / GRID_DEGREES) * GRID_DEGREES + GRID_DEGREES / 2) * 1e5) / 1e5;

/** Distance arrondie au 500 m supérieur : assez pour comparer deux tuteurs, trop grossière pour localiser un domicile. */
export const approximateDistance = (meters: number): number => Math.max(500, Math.ceil(meters / 500) * 500);

export interface PlaceLike {
  id: string;
  label: string;
  type: string;
  latitude: number | null;
  longitude: number | null;
  radius: number | null;
}

export interface PublicPlace {
  id: string;
  label: string;
  type: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  /** true : la position est celle du centre d'une maille d'environ 1 km, pas l'adresse. */
  approximate: boolean;
}

export function toPublicPlace(place: PlaceLike): PublicPlace {
  const approximate = isPrivatePlaceType(place.type) && place.latitude !== null && place.longitude !== null;
  return {
    id: place.id,
    label: place.label,
    type: place.type,
    latitude: approximate ? snapToGrid(place.latitude!) : place.latitude,
    longitude: approximate ? snapToGrid(place.longitude!) : place.longitude,
    radiusMeters: place.radius,
    approximate,
  };
}

/** Distance publiée : arrondie quand elle part d'un domicile, exacte pour un lieu public. */
export function publicDistance(meters: number | null, placeType: string | null): number | null {
  if (meters === null) return null;
  return placeType !== null && isPrivatePlaceType(placeType) ? approximateDistance(meters) : meters;
}
