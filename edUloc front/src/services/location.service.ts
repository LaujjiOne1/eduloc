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

    let position: Location.LocationObject;
    try {
      position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    } catch {
      throw ApiError.local("position_unavailable", t("services.locationservice.unableToRetrieveYourPosition"));
    }
    const { latitude, longitude } = position.coords;

    // Le libellé est un confort d'affichage : s'il échoue, les coordonnées restent valables.
    try {
      const place = await api.get<GeoPlaceDto>("/geo/reverse", { lat: latitude, lng: longitude }, { auth: false });
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
