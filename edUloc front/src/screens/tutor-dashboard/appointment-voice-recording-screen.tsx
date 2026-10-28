import { useLocalSearchParams } from "expo-router";

import { VoiceRecordingView } from "@/components/chat/voice-recording-view";

/** 26_VoiceRecording (espace tuteur) — l’enregistrement et l’envoi sont dans VoiceRecordingView. */
export function TutorVoiceRecordingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VoiceRecordingView bookingId={id} />;
}
