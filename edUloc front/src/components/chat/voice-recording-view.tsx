import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MicIcon, SendIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { formatDuration } from "@/hooks/use-elapsed-seconds";
import { useSendMessage } from "@/hooks/use-send-message";
import { type RecordedVoice, MAX_VOICE_MS, useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { useTranslation } from "react-i18next";

const BAR_COUNT = 10;
/** En dessous, le serveur refuse le vocal (durationMs ≥ 500). */
const MIN_VOICE_MS = 800;

/**
 * 26_VoiceRecording — enregistre un vrai message vocal (micro de l'appareil) puis l'envoie dans la
 * conversation de la réservation `bookingId`. Partagé par les espaces demandeur et tuteur.
 */
export function VoiceRecordingView({ bookingId }: { bookingId: string | undefined }) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const recorder = useVoiceRecorder();
  const { state, sendVoice, reset } = useSendMessage();
  const isSending = state.status === "sending";
  const [localError, setLocalError] = useState<string | null>(null);
  // Si l'envoi échoue (réseau…), le vocal reste prêt : « Envoyer » le renvoie sans réenregistrer.
  const [pendingVoice, setPendingVoice] = useState<RecordedVoice | null>(null);
  const sentOnLimit = useRef(false);

  // Rolling buffer des derniers niveaux sonores (animation de la forme d'onde).
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: BAR_COUNT }, () => 0.15));
  const levelTick = `${recorder.phase}|${recorder.level}|${recorder.durationMs}`;
  const [lastLevelTick, setLastLevelTick] = useState(levelTick);
  if (levelTick !== lastLevelTick) {
    setLastLevelTick(levelTick);
    if (recorder.phase === "recording") setLevels((previous) => [...previous.slice(1), Math.max(0.12, recorder.level)]);
  }

  const handleCancel = async () => {
    await recorder.cancel();
    router.back();
  };

  const handleSend = async () => {
    if (!bookingId || isSending) return;
    setLocalError(null);
    reset();
    const voice = pendingVoice ?? (await recorder.stop());
    if (!voice) return;
    if (voice.durationMs < MIN_VOICE_MS) {
      setLocalError(t("chat.voiceRecordingView.messageTooShortHoldThe"));
      return;
    }
    setPendingVoice(voice);
    const message = await sendVoice(bookingId, voice);
    if (message) {
      setPendingVoice(null);
      router.back();
    }
  };

  // Limite de 5 minutes atteinte : l'enregistrement s'arrête et le vocal part tel quel.
  useEffect(() => {
    if (recorder.reachedLimit && !sentOnLimit.current) {
      sentOnLimit.current = true;
      void handleSend();
    }
    // handleSend change à chaque rendu ; seul le franchissement de la limite doit déclencher l'envoi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.reachedLimit]);

  const unavailable = recorder.phase === "denied" || recorder.phase === "error";
  const canSend = recorder.phase === "recording" || pendingVoice !== null;

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-3 px-5 pb-[14px] pt-[18px]">
        <Text className="text-[21px] font-bold text-ink">
          Edu<Text className="text-primary">Loc</Text>
        </Text>
      </View>

      <View className="flex-1 items-center justify-center gap-[26px] px-5">
        {unavailable ? (
          <>
            <View className="h-[88px] w-[88px] items-center justify-center rounded-full bg-error-tint">
              <MicIcon size={34} color="#E04F5F" />
            </View>
            <Text className="text-center text-[15px] font-semibold text-ink">
              {recorder.phase === "denied" ? t("chat.voiceRecordingView.microphoneAccessDenied") : t("chat.voiceRecordingView.recordingUnavailable")}
            </Text>
            <Text className="text-center text-[13.5px] text-ink-soft">
              {recorder.phase === "denied"
                ? t("chat.voiceRecordingView.allowTheMicrophoneInYour")
                : recorder.errorMessage}
            </Text>
          </>
        ) : (
          <>
            <Text className="text-[13px] font-semibold text-ink-soft">
              {recorder.phase === "starting" ? t("chat.voiceRecordingView.preparingTheMicrophone") : t("chat.voiceRecordingView.recordingInProgress")}
            </Text>

            <View className="items-center justify-center">
              {recorder.phase === "recording" ? <PulseRing /> : null}
              <View className="h-[120px] w-[120px] items-center justify-center rounded-full bg-error-tint">
                <View className="h-[74px] w-[74px] items-center justify-center rounded-full bg-error">
                  <MicIcon size={30} color="#fff" />
                </View>
              </View>
            </View>

            <Text className="text-[26px] font-bold text-ink">{formatDuration(recorder.seconds)}</Text>
            <Text className="-mt-4 text-[11.5px] text-ink-faint">{t("chat.voiceRecordingView.maximumDurationMin", { round: Math.round(MAX_VOICE_MS / 60000) })}</Text>

            <View className="flex-row items-end gap-1" style={{ height: 30 }}>
              {levels.map((level, index) => (
                <View key={index} style={{ width: 3, height: Math.max(4, level * 30), borderRadius: 2, backgroundColor: "#332E86" }} />
              ))}
            </View>

            <Text className="text-[13px] text-ink-faint">{t("chat.voiceRecordingView.tapSendToFinish")}</Text>
          </>
        )}
        {localError ? <FormError message={localError} /> : null}
        {state.status === "error" ? <FormError message={state.message} /> : null}
      </View>

      <View className="flex-shrink-0 border-t border-line-soft bg-surface px-5 pt-4" style={{ paddingBottom: Math.max(insets.bottom, 22) }}>
        <View className="flex-row gap-[10px]">
          <Button label={unavailable ? t("common.back") : t("common.cancel")} variant="ghost" fullWidth disabled={isSending} onPress={handleCancel} />
          {unavailable ? null : (
            <Button
              label={t("common.send")}
              fullWidth
              disabled={isSending || !canSend}
              loading={isSending}
              loadingLabel={t("common.sending")}
              icon={<SendIcon size={17} color="#fff" />}
              onPress={handleSend}
            />
          )}
        </View>
      </View>
    </View>
  );
}

/** Anneau pulsé derrière le micro — signale « enregistre » sans reposer sur la seule couleur. */
function PulseRing() {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900 }), -1, false);
  }, [pulse]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.9 - pulse.value * 0.9,
    transform: [{ scale: 1 + pulse.value * 0.35 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", width: 140, height: 140, borderRadius: 70, borderWidth: 2, borderColor: "#F6E9E6" }, style]}
    />
  );
}
