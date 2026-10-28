import { useCallback, useRef, useState } from "react";

import { isApiError } from "@/api/errors";
import type { RecordedVoice } from "@/hooks/use-voice-recorder";
import { ConversationService } from "@/services/conversation.service";
import type { ConversationMessage, LocalFile } from "@/types/message";
import { t } from "@/i18n";

export type SendMessageState = { status: "idle" } | { status: "sending" } | { status: "error"; message: string };

/**
 * Envoi d'un vocal (26_VoiceRecording) ou d'un document (27_DocumentExchange) dans la conversation
 * d'une réservation : ticket d'upload → PUT direct vers le stockage → confirmation. Le message
 * n'existe côté serveur que si le fichier existe réellement. Les erreurs métier (conversation en
 * lecture seule, quota de 3 vocaux avant réponse du tuteur…) sont affichées telles que le serveur les formule.
 */
export function useSendMessage() {
  const [state, setState] = useState<SendMessageState>({ status: "idle" });
  const inFlight = useRef(false);
  const conversationIds = useRef(new Map<string, string>());

  const conversationIdFor = useCallback(async (bookingId: string) => {
    const cached = conversationIds.current.get(bookingId);
    if (cached) return cached;
    const conversation = await ConversationService.getConversationForBooking(bookingId);
    conversationIds.current.set(bookingId, conversation.id);
    return conversation.id;
  }, []);

  const run = useCallback(
    async (fallback: string, action: () => Promise<ConversationMessage>): Promise<ConversationMessage | null> => {
      if (inFlight.current) return null; // pas de double envoi
      inFlight.current = true;
      setState({ status: "sending" });
      try {
        const message = await action();
        setState({ status: "idle" });
        return message;
      } catch (error) {
        // Erreur serveur / réseau : son message (déjà en français). Sinon texte générique + cause technique en développement.
        const detail = error instanceof Error ? error.message : String(error);
        setState({ status: "error", message: isApiError(error) ? error.message : __DEV__ ? `${fallback} (${detail})` : fallback });
        return null;
      } finally {
        inFlight.current = false;
      }
    },
    [],
  );

  const sendVoice = useCallback(
    (bookingId: string, voice: RecordedVoice) =>
      run(t("hooks.useSendMessage.unableToSendTheVoice"), async () =>
        ConversationService.sendVoiceMessage(await conversationIdFor(bookingId), voice),
      ),
    [conversationIdFor, run],
  );

  const sendDocument = useCallback(
    (bookingId: string, file: LocalFile) =>
      run(t("hooks.useSendMessage.unableToSendTheDocument"), async () =>
        ConversationService.sendDocument(await conversationIdFor(bookingId), file),
      ),
    [conversationIdFor, run],
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, sendVoice, sendDocument, reset };
}
