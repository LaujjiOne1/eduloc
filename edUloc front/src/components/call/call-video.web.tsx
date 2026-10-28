import { createElement } from "react";

type CallVideoProps = {
  kind: "remote" | "local";
  attach: (el: unknown) => void;
  /** Natif seulement (ignoré sur le web). */
  track?: unknown;
};

export function CallVideo({ kind, attach }: CallVideoProps) {
  const remote = kind === "remote";
  return createElement("video", {
    ref: attach,
    autoPlay: true,
    playsInline: true,
    muted: !remote,
    style: remote
      ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }
      : {
          position: "absolute", right: 16, top: 16, width: 96, height: 128, objectFit: "cover",
          borderRadius: 12, transform: "scaleX(-1)", border: "1px solid rgba(255,255,255,0.3)",
        },
  });
}
