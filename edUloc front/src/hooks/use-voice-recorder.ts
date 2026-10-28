import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";

import { describeLocalFile } from "@/api/upload";
import { t } from "@/i18n";
import type { LocalFile } from "@/types/message";

/** Limite côté serveur : 5 minutes par vocal (RequestUploadDto.durationMs ≤ 300 000). */
export const MAX_VOICE_MS = 300_000;
const WAVEFORM_BARS = 64;
const METERING_INTERVAL_MS = 100;

export type RecorderPhase = "starting" | "recording" | "denied" | "error" | "stopped";

export interface RecordedVoice {
  file: LocalFile;
  durationMs: number;
  /** ~64 amplitudes normalisées 0..1 (affichage sans télécharger l'audio). */
  waveform: number[];
}

/** dBFS (≈ −60 … 0) → 0..1. */
const meterToLevel = (db: number | undefined) => (db === undefined ? 0 : Math.min(1, Math.max(0, (db + 60) / 60)));

/** Ramène N échantillons à `bars` barres (moyenne par paquet). */
function toWaveform(samples: number[], bars = WAVEFORM_BARS): number[] {
  if (samples.length === 0) return Array.from({ length: bars }, () => 0.1);
  const out: number[] = [];
  for (let i = 0; i < bars; i += 1) {
    const from = Math.floor((i * samples.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * samples.length) / bars));
    const slice = samples.slice(from, to);
    out.push(Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 100) / 100);
  }
  return out;
}

/**
 * Enregistrement d'un message vocal : démarre dès le montage (l'écran « Enregistrement en cours »),
 * mono basse consommation (~240 Ko / minute, adapté à la data mobile), niveau sonore échantillonné
 * pour la forme d'onde. `stop()` renvoie le fichier prêt à être envoyé ; `cancel()` jette tout.
 */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    numberOfChannels: 1,
    sampleRate: 22_050,
    bitRate: 32_000,
    isMeteringEnabled: true,
  });
  const state = useAudioRecorderState(recorder, METERING_INTERVAL_MS);
  const [phase, setPhase] = useState<RecorderPhase>("starting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const samples = useRef<number[]>([]);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (!permission.granted) {
          setPhase("denied");
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setPhase("recording");
      } catch (error) {
        setErrorMessage(t("hooks.useVoiceRecorder.unableToStart") + (__DEV__ && error instanceof Error ? ` (${error.message})` : ""));
        setPhase("error");
      }
    })();
  }, [recorder]);

  // Échantillonnage du niveau sonore pendant l'enregistrement.
  useEffect(() => {
    if (phase === "recording" && state.isRecording) samples.current.push(meterToLevel(state.metering));
  }, [phase, state.isRecording, state.metering, state.durationMillis]);

  const finish = useCallback(async (): Promise<RecordedVoice | null> => {
    try {
      const durationMs = Math.round(Math.max(state.durationMillis, recorder.currentTime * 1000));
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      setPhase("stopped");
      const uri = recorder.uri;
      if (!uri) return null;
      const { sizeBytes, mimeType } = await describeLocalFile(uri, "audio/mp4");
      return {
        file: { uri, mimeType, sizeBytes, fileName: `vocal-${Date.now()}` },
        durationMs: Math.min(durationMs, MAX_VOICE_MS),
        waveform: toWaveform(samples.current),
      };
    } catch (error) {
      setErrorMessage(t("hooks.useVoiceRecorder.unableToFinish") + (__DEV__ && error instanceof Error ? ` (${error.message})` : ""));
      setPhase("error");
      return null;
    }
  }, [recorder, state.durationMillis]);

  const cancel = useCallback(async () => {
    try {
      if (state.isRecording) await recorder.stop();
    } catch {
      // l'enregistrement est de toute façon abandonné
    }
    setPhase("stopped");
  }, [recorder, state.isRecording]);

  const durationMs = Math.round(state.durationMillis);
  const reachedLimit = phase === "recording" && durationMs >= MAX_VOICE_MS;

  return {
    phase,
    errorMessage,
    durationMs,
    seconds: Math.floor(durationMs / 1000),
    /** Niveau instantané 0..1 (animation de la forme d'onde). */
    level: meterToLevel(state.metering),
    reachedLimit,
    stop: finish,
    cancel,
  };
}
