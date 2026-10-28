import type { ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MicIcon, PhoneIcon, VideoIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { ScaleIn } from "@/components/motion/scale-in";
import { Button } from "@/components/ui/button";
import { formatDuration, useElapsedSeconds } from "@/hooks/use-elapsed-seconds";
import { useRingtone } from "@/hooks/use-ringtone";
import type { useCall } from "@/hooks/use-call";

import { CallVideo } from "./call-video";
import { useTranslation } from "react-i18next";
import { t as tr } from "@/i18n";

type CallViewProps = {
  initial: string;
  /** Avatar à la place de l'initiale (silhouette du tuteur). */
  avatar?: ReactNode;
  name: string;
  call: ReturnType<typeof useCall>;
  onClose: () => void;
};

function ConnectedTimer() {
  const seconds = useElapsedSeconds();
  return <Text className="text-[13px] text-white/60">{formatDuration(seconds)}</Text>;
}

const STATUS_LABEL = {
  get connecting() { return tr("call.callView.connecting"); },
  get ringing() { return tr("call.callView.callInProgress"); },
  get ended() { return tr("call.callView.callEnded"); },
} as const;

/** Écran d'appel commun demandeur / tuteur (design 26_Call) : avatar, durée, micro, caméra, raccrocher. */
export function CallView({ initial, avatar, name, call, onClose }: CallViewProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { state, toggleMute, toggleVideo, hangUp, attachRemoteVideo, attachLocalVideo } = call;
  const finished = state.phase === "ended" || state.phase === "failed";
  // Tonalité d'attente (discrète) tant que l'interlocuteur n'a pas décroché.
  useRingtone(state.phase === "ringing", { volume: 0.35 });

  return (
    <View className="flex-1 bg-ink" style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 24) }}>
      {state.remoteHasVideo ? <CallVideoLayer attachRemote={attachRemoteVideo} track={state.remoteVideoTrack} /> : null}
      {state.videoOn ? <CallVideoLayer attachLocal={attachLocalVideo} track={state.localVideoTrack} /> : null}

      <View className="flex-1 items-center justify-center gap-4">
        {state.remoteHasVideo ? null : (
          <ScaleIn delay={20}>
            {avatar ?? (
              <View className="h-24 w-24 items-center justify-center rounded-full bg-white/10">
                <Text className="text-[30px] font-bold text-white">{initial}</Text>
              </View>
            )}
          </ScaleIn>
        )}
        <Text className="text-[19px] font-bold text-white">{name}</Text>
        {state.phase === "connected" ? (
          <ConnectedTimer />
        ) : state.phase === "failed" ? (
          <Text className="max-w-[300px] text-center text-[13px] text-white/80">{state.error}</Text>
        ) : (
          <View className="flex-row items-center gap-2">
            {state.phase === "connecting" || state.phase === "ringing" ? <ActivityIndicator size="small" color="#fff" /> : null}
            <Text className="text-[13px] text-white/60">{STATUS_LABEL[state.phase as keyof typeof STATUS_LABEL]}</Text>
          </View>
        )}
      </View>

      {finished ? (
        <View className="items-center px-6">
          <Button label={t("common.back")} variant="secondary" onPress={onClose} />
        </View>
      ) : (
        <View className="flex-row justify-center gap-4 px-6">
          <PressableScale onPress={toggleMute} accessibilityLabel={state.muted ? t("common.unmuteMicrophone") : t("common.muteMicrophone")}>
            <View className={["h-[54px] w-[54px] items-center justify-center rounded-full", state.muted ? "bg-error" : "bg-white/12"].join(" ")}>
              <MicIcon size={22} color="#fff" />
            </View>
          </PressableScale>
          <PressableScale onPress={toggleVideo} accessibilityLabel={state.videoOn ? t("common.turnCameraOff") : t("common.turnCameraOn")}>
            <View className={["h-[54px] w-[54px] items-center justify-center rounded-full", state.videoOn ? "bg-primary" : "bg-white/12"].join(" ")}>
              <VideoIcon size={22} color="#fff" />
            </View>
          </PressableScale>
          <PressableScale
            onPress={() => {
              hangUp();
              onClose();
            }}
            accessibilityLabel={t("call.callView.hangUp")}
          >
            <View className="h-[54px] w-[54px] items-center justify-center rounded-full bg-error">
              <PhoneIcon size={22} color="#fff" />
            </View>
          </PressableScale>
        </View>
      )}
    </View>
  );
}

function CallVideoLayer({
  attachRemote,
  attachLocal,
  track,
}: {
  attachRemote?: (el: unknown) => void;
  attachLocal?: (el: unknown) => void;
  track?: unknown;
}) {
  return attachRemote ? (
    <CallVideo kind="remote" attach={attachRemote} track={track} />
  ) : attachLocal ? (
    <CallVideo kind="local" attach={attachLocal} track={track} />
  ) : null;
}
