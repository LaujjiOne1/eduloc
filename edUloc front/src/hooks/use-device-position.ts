import { useCallback, useState } from "react";

import { LocationService } from "@/services/location.service";
import { t } from "@/i18n";

export type DevicePositionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; latitude: number; longitude: number }
  | { status: "unavailable"; message: string };

/** Dernière position obtenue : une seule demande d'autorisation par session, partagée entre les écrans. */
let lastKnown: { latitude: number; longitude: number } | null = null;

/** Arrondi à ~100 m : une position qui bouge à peine ne relance pas le calcul des distances. */
const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Position de l'appareil, à la demande (jamais au montage : l'autorisation est demandée par un geste ou par un choix
 * explicite de l'utilisateur). Sert à afficher la distance estimée des salles partenaires.
 */
export function useDevicePosition() {
  const [state, setState] = useState<DevicePositionState>(
    lastKnown ? { status: "ready", ...lastKnown } : { status: "idle" },
  );

  const request = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const position = await LocationService.getCurrentPosition();
      lastKnown = { latitude: round(position.latitude), longitude: round(position.longitude) };
      setState({ status: "ready", ...lastKnown });
    } catch (error) {
      setState({
        status: "unavailable",
        message: error instanceof Error ? error.message : t("hooks.useDevicePosition.positionUnavailable"),
      });
    }
  }, []);

  return { state, request };
}
