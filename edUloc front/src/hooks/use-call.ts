import { useCallback, useEffect, useRef, useState } from "react";

import { type CallRoomHandle, type CallRoomState, joinCallRoom } from "@/lib/call/room";
import { type CallJoin, CallService } from "@/services/call.service";
import { t } from "@/i18n";

const INITIAL: CallRoomState = { phase: "connecting", muted: false, videoOn: false, remoteHasVideo: false, error: null };

type UseCallParams = {
  /** Appel sortant : conversation de la paire demandeur/tuteur. */
  conversationId: string | null;
  /** Appel entrant : identifiant reçu par l'événement `call.incoming`. */
  callId?: string;
  /** Appel sortant uniquement. */
  type?: "AUDIO" | "VIDEO";
};

/**
 * Cycle de vie d'un appel : création (ou récupération du jeton) côté serveur → connexion à la room LiveKit
 * → états `connecting → ringing → connected → ended`. Le serveur est l'autorité sur le droit d'appeler
 * (CALL_NOT_ALLOWED hors séance confirmée / en cours).
 */
export function useCall({ conversationId, callId, type = "AUDIO" }: UseCallParams) {
  const [state, setState] = useState<CallRoomState>(INITIAL);
  const handle = useRef<CallRoomHandle | null>(null);
  const joinRequest = useRef<Promise<CallJoin> | null>(null);

  useEffect(() => {
    if (!callId && !conversationId) return;
    let cancelled = false;
    // Une seule création côté serveur, même si l'effet est rejoué (StrictMode / remontage).
    joinRequest.current ??= callId ? CallService.join(callId) : CallService.start(conversationId as string, type);

    joinRequest.current
      .then((join) =>
        joinCallRoom({
          url: join.livekitUrl,
          token: join.token,
          video: join.type === "VIDEO",
          onState: (patch) => {
            if (!cancelled) setState((current) => ({ ...current, ...patch }));
          },
        }),
      )
      .then((room) => {
        if (cancelled) room.leave();
        else handle.current = room;
      })
      .catch((error: unknown) => {
        if (!cancelled) setState((current) => ({ ...current, phase: "failed", error: error instanceof Error ? error.message : t("hooks.useCall.unableToStartTheCall") }));
      });

    return () => {
      cancelled = true;
      handle.current?.leave();
      handle.current = null;
    };
  }, [callId, conversationId, type]);

  const toggleMute = useCallback(() => {
    void handle.current?.setMuted(!state.muted);
  }, [state.muted]);
  const toggleVideo = useCallback(() => {
    void handle.current?.setVideo(!state.videoOn);
  }, [state.videoOn]);
  const hangUp = useCallback(() => {
    handle.current?.leave();
    handle.current = null;
    setState((current) => ({ ...current, phase: "ended" }));
  }, []);
  const attachRemoteVideo = useCallback((el: unknown) => handle.current?.attachRemoteVideo(el), []);
  const attachLocalVideo = useCallback((el: unknown) => handle.current?.attachLocalVideo(el), []);

  return { state, toggleMute, toggleVideo, hangUp, attachRemoteVideo, attachLocalVideo };
}
