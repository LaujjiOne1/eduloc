import { type Participant, type RemoteTrack, Room, RoomEvent, Track } from "livekit-client";

import type { CallRoomHandle, CallRoomOptions } from "./room";
import { t as translate } from "@/i18n";

export type { CallPhase, CallRoomHandle, CallRoomOptions, CallRoomState } from "./room";
export const CALLS_SUPPORTED = true;

type LiveKitNative = typeof import("@livekit/react-native");

let native: LiveKitNative | null = null;

/**
 * WebRTC natif de LiveKit, chargé À LA DEMANDE : dans Expo Go (où ce module natif n'existe pas) l'import lèverait une
 * erreur dès le démarrage de l'application. Ici, seul l'appel échoue, avec un message clair.
 */
function loadNative(): LiveKitNative {
  if (native) return native;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = require("@livekit/react-native") as LiveKitNative;
    lib.registerGlobals();
    native = lib;
    return lib;
  } catch {
    throw new Error(translate("lib.call.requiresDevBuild"));
  }
}

/** Référence de piste attendue par le composant VideoTrack de LiveKit. */
function cameraRef(participant: Participant | undefined) {
  const publication = participant?.getTrackPublication(Track.Source.Camera);
  return participant && publication?.track ? { participant, publication, source: Track.Source.Camera } : null;
}

export async function joinCallRoom({ url, token, video, onState }: CallRoomOptions): Promise<CallRoomHandle> {
  const { AudioSession } = loadNative();
  // Le micro / le haut-parleur du téléphone sont gérés par une session audio native, à démarrer avant de se connecter.
  await AudioSession.startAudioSession();

  const room = new Room({ adaptiveStream: true, dynacast: true });

  const syncVideo = () => {
    const remote = [...room.remoteParticipants.values()][0];
    const remoteRef = cameraRef(remote);
    const localRef = cameraRef(room.localParticipant);
    onState({ remoteHasVideo: !!remoteRef, remoteVideoTrack: remoteRef, localVideoTrack: localRef });
  };

  room
    .on(RoomEvent.ParticipantConnected, () => onState({ phase: "connected" }))
    .on(RoomEvent.ParticipantDisconnected, () => onState({ phase: "ended" }))
    .on(RoomEvent.Disconnected, () => onState({ phase: "ended" }))
    // Le son distant est lu nativement dès l'abonnement ; seule la vidéo demande un rendu côté écran.
    .on(RoomEvent.TrackSubscribed, (_track: RemoteTrack) => syncVideo())
    .on(RoomEvent.TrackUnsubscribed, () => syncVideo())
    .on(RoomEvent.LocalTrackPublished, syncVideo)
    .on(RoomEvent.LocalTrackUnpublished, syncVideo);

  try {
    await room.connect(url, token);
    await room.localParticipant.setMicrophoneEnabled(true);
    if (video) await room.localParticipant.setCameraEnabled(true);
  } catch (error) {
    void room.disconnect();
    await AudioSession.stopAudioSession();
    throw error;
  }

  onState({ phase: room.remoteParticipants.size > 0 ? "connected" : "ringing", videoOn: video });
  syncVideo();

  return {
    async setMuted(muted) {
      await room.localParticipant.setMicrophoneEnabled(!muted);
      onState({ muted });
    },
    async setVideo(on) {
      await room.localParticipant.setCameraEnabled(on);
      onState({ videoOn: on });
      syncVideo();
    },
    // Rendu natif par composant (voir CallVideo) : rien à rattacher.
    attachRemoteVideo() {},
    attachLocalVideo() {},
    leave() {
      void room.disconnect();
      void AudioSession.stopAudioSession();
    },
  };
}
