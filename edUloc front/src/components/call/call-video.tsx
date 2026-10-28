import { View } from "react-native";

type CallVideoProps = {
  kind: "remote" | "local";
  /** Web : rattache la piste à un élément <video>. Sans effet en natif. */
  attach: (el: unknown) => void;
  /** Natif : référence de piste fournie par le moteur d'appel (room.native.ts). */
  track?: unknown;
};

type VideoTrackComponent = (props: { trackRef: unknown; style?: object; objectFit?: "cover" | "contain"; mirror?: boolean }) => React.JSX.Element;

/**
 * Vidéo d'un appel sur Android / iOS : composant natif de LiveKit, chargé à la demande (il n'existe pas dans Expo Go,
 * où aucune piste vidéo n'arrive de toute façon). Sans piste, rien n'est affiché.
 */
export function CallVideo({ kind, track }: CallVideoProps) {
  if (!track) return <View />;
  let VideoTrack: VideoTrackComponent;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    VideoTrack = (require("@livekit/react-native") as { VideoTrack: VideoTrackComponent }).VideoTrack;
  } catch {
    return <View />;
  }
  return kind === "remote" ? (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      <VideoTrack trackRef={track} objectFit="cover" style={{ flex: 1 }} />
    </View>
  ) : (
    <View
      style={{
        position: "absolute", right: 16, top: 16, width: 96, height: 128, borderRadius: 12, overflow: "hidden",
        borderWidth: 1, borderColor: "rgba(255,255,255,0.3)",
      }}
    >
      <VideoTrack trackRef={track} objectFit="cover" mirror style={{ flex: 1 }} />
    </View>
  );
}
