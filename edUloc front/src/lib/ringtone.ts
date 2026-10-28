import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { Platform, Vibration } from "react-native";

const RINGTONE = require("../../assets/sounds/ringtone.wav") as number;

/** Rythme de vibration d'un appel entrant : 0,8 s de vibration, 1,2 s de pause, en boucle. */
const VIBRATION_PATTERN = [0, 800, 1200];

export type RingtoneOptions = {
  /** 1 = sonnerie d'appel entrant ; plus bas pour la tonalité d'attente côté appelant. */
  volume?: number;
  vibrate?: boolean;
};

/**
 * Joue la sonnerie en boucle jusqu'à l'appel de la fonction retournée. N'échoue jamais : un navigateur
 * qui bloque la lecture automatique (aucune interaction préalable) ou un appareil muet ne doit pas casser l'appel.
 */
export function startRingtone({ volume = 1, vibrate = false }: RingtoneOptions = {}): () => void {
  let player: AudioPlayer | null = null;
  let stopped = false;

  void (async () => {
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      if (stopped) return;
      player = createAudioPlayer(RINGTONE);
      player.loop = true;
      player.volume = volume;
      player.play();
    } catch {
      // lecture impossible : l'appel reste signalé visuellement
    }
  })();

  if (vibrate && Platform.OS !== "web") Vibration.vibrate(VIBRATION_PATTERN, true);

  return () => {
    stopped = true;
    if (vibrate && Platform.OS !== "web") Vibration.cancel();
    try {
      player?.pause();
      player?.remove();
    } catch {
      // déjà libéré
    }
    player = null;
  };
}
