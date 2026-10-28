import { useCallback, useState } from "react";

import { RoomService, RoomServiceError } from "@/services/room.service";
import type { AcceptedRoom, PartnerRoom } from "@/types/room";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type TutorRoomsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; accepted: AcceptedRoom[]; available: PartnerRoom[] };

/**
 * Salles où le tuteur accepte d'intervenir, et salles publiées qu'il peut encore accepter.
 * Accepter ne réserve rien : seul un accord, revérifié à chaque demande et à chaque acceptation.
 */
export function useTutorRooms() {
  const [state, setState] = useState<TutorRoomsState>({ status: "loading" });
  const [busyRoomId, setBusyRoomId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [accepted, all] = await Promise.all([RoomService.getMyRooms(), RoomService.listRooms()]);
      const acceptedIds = new Set(accepted.map((r) => r.id));
      setState({ status: "ready", accepted, available: all.filter((r) => !acceptedIds.has(r.id)) });
    } catch {
      setState({ status: "error", message: t("hooks.useTutorRooms.unableToLoadThePartner") });
    }
  }, []);

  useLoadEffect(load);

  const change = useCallback(
    async (roomId: string, action: () => Promise<unknown>) => {
      if (busyRoomId) return;
      setBusyRoomId(roomId);
      setActionError(null);
      try {
        await action();
        await load();
      } catch (error) {
        setActionError(error instanceof RoomServiceError ? error.message : t("hooks.useTutorRooms.actionUnavailablePleaseTryAgain"));
      } finally {
        setBusyRoomId(null);
      }
    },
    [busyRoomId, load],
  );

  return {
    state,
    busyRoomId,
    actionError,
    retry: load,
    accept: (roomId: string) => change(roomId, () => RoomService.acceptRoom(roomId)),
    withdraw: (roomId: string) => change(roomId, () => RoomService.withdrawRoom(roomId)),
  };
}
