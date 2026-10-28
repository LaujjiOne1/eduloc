import { type RemoteTrack, Room, RoomEvent, Track } from "livekit-client";

import type { CallRoomHandle, CallRoomOptions } from "./room";

export type { CallPhase, CallRoomHandle, CallRoomOptions, CallRoomState } from "./room";
export const CALLS_SUPPORTED = true;

export async function joinCallRoom({ url, token, video, onState }: CallRoomOptions): Promise<CallRoomHandle> {
  const room = new Room({ adaptiveStream: true, dynacast: true });
  let remoteVideoEl: HTMLVideoElement | null = null;
  let localVideoEl: HTMLVideoElement | null = null;

  const syncRemote = () => {
    const participant = [...room.remoteParticipants.values()][0];
    const camera = participant?.getTrackPublication(Track.Source.Camera)?.track;
    if (remoteVideoEl) {
      if (camera) camera.attach(remoteVideoEl);
    }
    onState({ remoteHasVideo: !!camera });
  };
  const syncLocal = () => {
    const camera = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
    if (camera && localVideoEl) camera.attach(localVideoEl);
  };

  room
    .on(RoomEvent.ParticipantConnected, () => onState({ phase: "connected" }))
    .on(RoomEvent.ParticipantDisconnected, () => onState({ phase: "ended" }))
    .on(RoomEvent.Disconnected, () => onState({ phase: "ended" }))
    .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        // L'élément audio doit être dans le DOM pour être lu.
        const el = track.attach();
        el.style.display = "none";
        document.body.appendChild(el);
      }
      syncRemote();
    })
    .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach().forEach((el) => el.remove());
      syncRemote();
    })
    .on(RoomEvent.LocalTrackPublished, syncLocal);

  await room.connect(url, token);
  await room.localParticipant.setMicrophoneEnabled(true);
  if (video) await room.localParticipant.setCameraEnabled(true);
  onState({
    phase: room.remoteParticipants.size > 0 ? "connected" : "ringing",
    videoOn: video,
  });
  syncRemote();
  syncLocal();

  return {
    async setMuted(muted) {
      await room.localParticipant.setMicrophoneEnabled(!muted);
      onState({ muted });
    },
    async setVideo(on) {
      await room.localParticipant.setCameraEnabled(on);
      onState({ videoOn: on });
      if (on) syncLocal();
    },
    attachRemoteVideo(el) {
      remoteVideoEl = el as HTMLVideoElement | null;
      syncRemote();
    },
    attachLocalVideo(el) {
      localVideoEl = el as HTMLVideoElement | null;
      syncLocal();
    },
    leave() {
      void room.disconnect();
    },
  };
}
