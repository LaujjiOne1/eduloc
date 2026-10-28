import { t as translate } from "@/i18n";
/**
 * Contrat commun du moteur d'appel : `room.web.ts` (navigateur), `room.native.ts` (Android / iOS, build de développement
 * avec WebRTC natif) ; `room.ts` = repli sans WebRTC (Expo Go).
 */
export type CallPhase = "connecting" | "ringing" | "connected" | "ended" | "failed";

export interface CallRoomState {
  phase: CallPhase;
  muted: boolean;
  videoOn: boolean;
  remoteHasVideo: boolean;
  /** Piste vidéo distante / locale à afficher (application native : rendue par un composant, pas par un élément <video>). */
  remoteVideoTrack?: unknown;
  localVideoTrack?: unknown;
  error: string | null;
}

export interface CallRoomHandle {
  setMuted(muted: boolean): Promise<void>;
  setVideo(on: boolean): Promise<void>;
  /** Rattache la vidéo distante / locale à un élément (web uniquement). */
  attachRemoteVideo(el: unknown): void;
  attachLocalVideo(el: unknown): void;
  leave(): void;
}

export interface CallRoomOptions {
  url: string;
  token: string;
  video: boolean;
  onState: (patch: Partial<CallRoomState>) => void;
}

export const CALLS_SUPPORTED = false;

export async function joinCallRoom(_options: CallRoomOptions): Promise<CallRoomHandle> {
  throw new Error(translate("lib.call.requiresNativeOrWeb"));
}
