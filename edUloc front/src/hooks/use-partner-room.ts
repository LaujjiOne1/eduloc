import { useCallback, useState } from "react";

import { PartnerService } from "@/services/partner.service";
import type { PartnerRoomDetail, RoomBlock } from "@/types/partner";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type PartnerRoomState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; room: PartnerRoomDetail; blocks: RoomBlock[] };

/** Fiche d'une salle du Gestionnaire (adresse exacte comprise) et ses fermetures à venir. */
export function usePartnerRoom(roomId: string | undefined) {
  const [state, setState] = useState<PartnerRoomState>({ status: "loading" });

  /** `silent` : relit sans repasser par le chargement (les formulaires ouverts gardent leur saisie). */
  const load = useCallback(
    async (silent = false) => {
      if (!roomId) return;
      if (!silent) setState({ status: "loading" });
      try {
        const [room, blocks] = await Promise.all([PartnerService.getRoom(roomId), PartnerService.listBlocks(roomId)]);
        setState({ status: "ready", room, blocks });
      } catch {
        if (!silent) setState({ status: "error", message: t("hooks.usePartnerRoom.unableToLoadThisRoom") });
      }
    },
    [roomId],
  );

  useLoadEffect(load);

  /** Remplace la salle affichée par la réponse d'une action (soumission, publication…) sans tout recharger. */
  const apply = useCallback((room: PartnerRoomDetail) => {
    setState((current) => (current.status === "ready" ? { ...current, room } : current));
  }, []);

  const reload = useCallback(() => load(false), [load]);
  const refresh = useCallback(() => load(true), [load]);
  return { state, reload, refresh, apply };
}
