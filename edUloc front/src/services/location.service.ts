import * as Location from "expo-location";

import { api } from "@/api/http";
import { ApiError } from "@/api/errors";
import type { GeoPlaceDto } from "@/api/contracts/dto";
import { t } from "@/i18n";

export { ApiError as LocationServiceError };

export interface ResolvedLocation {
  label: string;
  latitude: number;
  longitude: number;
}

/** Une position connue depuis moins de 10 min est réutilisée telle quelle. */
const LAST_KNOWN_MAX_AGE_MS = 10 * 60_000;
/** Au-delà, on renonce à la position et la recherche se limite aux cours en ligne. */
const POSITION_TIMEOUT_MS = 8_000;
/** Le libellé du quartier n'est qu'un confort : il ne doit pas retarder la recherche. */
const REVERSE_TIMEOUT_MS = 2_500;

/** Rejette si `promise` ne répond pas dans le délai (elle continue en arrière-plan, son résultat est ignoré). */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Position de l'appareil (GPS, expo-location : permission + coordonnées) et géocodage d'adresses.
 * Routes backend : GET /geo/geocode?q=…  (adresse → coordonnées, OpenStreetMap derrière un cache)
 *                  GET /geo/reverse?lat&lng (coordonnées → libellé de quartier)
 */
export const LocationService = {
  /**
   * « Utiliser ma position ». Erreurs : "permission_denied" (refus de l'utilisateur),
   * "position_unavailable" (GPS indisponible / délai dépassé).
   */
  async getCurrentPosition(): Promise<ResolvedLocation> {
    let permission: Location.LocationPermissionResponse;
    try {
      permission = await Location.requestForegroundPermissionsAsync();
    } catch {
      throw ApiError.local("position_unavailable", t("services.locationservice.locationIsNotAvailableOn"));
    }
    if (permission.status !== "granted") {
      throw ApiError.local("permission_denied", t("services.locationservice.allowLocationAccessToUse"));
    }

    // Une position récente suffit pour chercher des tuteurs : on évite d'attendre le GPS quand l'appareil en a déjà une.
    let position: Location.LocationObject | null = null;
    try {
      position = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
    } catch {
      position = null;
    }
    if (!position) {
      try {
        // Sans délai maximum, un GPS qui ne répond pas (intérieur, navigateur sans réponse) bloquerait la recherche.
        position = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), POSITION_TIMEOUT_MS);
      } catch {
        throw ApiError.local("position_unavailable", t("services.locationservice.unableToRetrieveYourPosition"));
      }
    }
    const { latitude, longitude } = position.coords;

    // Le libellé est un confort d'affichage : s'il échoue, les coordonnées restent valables.
    try {
      const place = await withTimeout(
        api.get<GeoPlaceDto>("/geo/reverse", { lat: latitude, lng: longitude }, { auth: false }),
        REVERSE_TIMEOUT_MS,
      );
      return { label: place.label, latitude, longitude };
    } catch {
      return { label: t("services.locationservice.myPosition"), latitude, longitude };
    }
  },

  /** Adresses / quartiers correspondant à la saisie (jusqu'à 5, limités à Madagascar). */
  async searchPlaces(query: string): Promise<ResolvedLocation[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    return api.get<GeoPlaceDto[]>("/geo/geocode", { q }, { auth: false });
  },

  /** Meilleur résultat pour une adresse saisie, ou null si rien ne correspond. */
  async geocode(query: string): Promise<ResolvedLocation | null> {
    return (await LocationService.searchPlaces(query))[0] ?? null;
  },
};
