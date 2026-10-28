import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { PauseIcon, PlayIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { ConversationService } from "@/services/conversation.service";
import type { VoiceMessage } from "@/types/message";
import { useTranslation } from "react-i18next";

const BARS = 28;

/** Un seul vocal joue à la fois : lancer le suivant arrête le précédent. */
let activePlayer: { player: AudioPlayer; stop: () => void } | null = null;

/** ~64 amplitudes (0..1) → 28 barres ; barres plates si le message n'a pas de forme d'onde. */
function barsFrom(waveform: number[]): number[] {
  if (!waveform.length) return Array.from({ length: BARS }, (_, i) => 0.25 + ((i * 37) % 50) / 100);
  return Array.from({ length: BARS }, (_, i) => {
    const from = Math.floor((i * waveform.length) / BARS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * waveform.length) / BARS));
    const slice = waveform.slice(from, to);
    return Math.max(0.12, Math.min(1, slice.reduce((a, b) => a + b, 0) / slice.length));
  });
}

type Props = {
  message: VoiceMessage;
  /** Bulle de l'utilisateur (fond coloré) ou de l'autre partie. */
  mine: boolean;
};

/**
 * Lecteur d'un message vocal : URL signée (1 h) demandée au premier appui, lecture en flux, barre de
 * progression sur la forme d'onde. Écouter le vocal de l'autre partie envoie l'accusé « écouté ».
 */
export function VoiceMessagePlayer({ message, mine }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);
  const urlRef = useRef<string | null>(null);
  const reportedListened = useRef(false);

  const bars = barsFrom(message.waveform);

  const release = () => {
    const player = playerRef.current;
    if (!player) return;
    try {
      player.remove();
    } catch {
      // déjà libéré
    }
    if (activePlayer?.player === player) activePlayer = null;
    playerRef.current = null;
    setPlaying(false);
  };

  // Libère le lecteur natif quand la bulle disparaît.
  useEffect(() => release, []);

  const toggle = async () => {
    if (loading) return;
    setFailed(false);

    if (playing && playerRef.current) {
      playerRef.current.pause();
      setPlaying(false);
      return;
    }
    if (playerRef.current) {
      activePlayer?.stop();
      playerRef.current.play();
      setPlaying(true);
      return;
    }

    setLoading(true);
    try {
      urlRef.current ??= await ConversationService.getAttachmentUrl(message.attachmentId);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => undefined);
      activePlayer?.stop();

      const player = createAudioPlayer({ uri: urlRef.current });
      // Une seule lecture : jamais de répétition automatique.
      player.loop = false;
      let finished = false;
      player.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) {
          if (finished) return; // l'événement peut être émis plusieurs fois
          finished = true;
          // Mettre en PAUSE avant de revenir au début : sinon le lecteur, toujours « en lecture » côté natif, repart
          // aussitôt depuis 0 et le vocal tourne en boucle.
          player.pause();
          setPlaying(false);
          setProgress(0);
          void player.seekTo(0).catch(() => undefined);
          return;
        }
        if (status.playing) finished = false; // nouvelle lecture après un appui sur lecture
        if (!finished && status.duration > 0) setProgress(Math.min(1, status.currentTime / status.duration));
      });
      playerRef.current = player;
      activePlayer = {
        player,
        stop: () => {
          player.pause();
          setPlaying(false);
        },
      };
      player.play();
      setPlaying(true);

      if (!mine && !message.listenedAt && !reportedListened.current) {
        reportedListened.current = true;
        void ConversationService.markListened(message.id).catch(() => {
          reportedListened.current = false;
        });
      }
    } catch {
      release();
      urlRef.current = null; // l'URL a peut-être expiré : on en redemandera une
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const playedBars = Math.round(progress * BARS);

  return (
    <View>
      <View className="flex-row items-center gap-[10px]">
        <PressableScale
          onPress={toggle}
          disabled={loading}
          accessibilityLabel={playing ? t("chat.voiceMessagePlayer.pauseTheVoiceMessage") : t("chat.voiceMessagePlayer.playTheVoiceMessage")}
        >
          <View
            className={["h-[30px] w-[30px] items-center justify-center rounded-full", mine ? "bg-white/20" : "bg-primary-tint"].join(" ")}
          >
            {loading ? (
              <ActivityIndicator size="small" color={mine ? "#fff" : "#332E86"} />
            ) : playing ? (
              <PauseIcon size={13} color={mine ? "#fff" : "#332E86"} />
            ) : (
              <PlayIcon size={13} color={mine ? "#fff" : "#332E86"} />
            )}
          </View>
        </PressableScale>

        <View className="h-[26px] flex-1 flex-row items-center justify-between gap-[2px]">
          {bars.map((level, index) => {
            const played = index < playedBars;
            return (
              <View
                key={index}
                style={{
                  width: 3,
                  height: Math.max(4, level * 24),
                  borderRadius: 2,
                  backgroundColor: mine ? (played ? "#FFFFFF" : "rgba(255,255,255,0.4)") : played ? "#332E86" : "#C9CBDB",
                }}
              />
            );
          })}
        </View>

        <Text className={["text-[11.5px] font-semibold", mine ? "text-white" : "text-ink"].join(" ")}>
          {message.durationLabel}
        </Text>
      </View>
      {failed ? (
        <Text className={["mt-1 text-[11px]", mine ? "text-white/80" : "text-error"].join(" ")}>
          {t("chat.voiceMessagePlayer.playbackFailedTapToTry")}</Text>
      ) : null}
      {!mine && !message.listenedAt && !playing ? (
        <Text className="mt-1 text-[10.5px] font-semibold text-primary">{t("chat.voiceMessagePlayer.new")}</Text>
      ) : null}
    </View>
  );
}
