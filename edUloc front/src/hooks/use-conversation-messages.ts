import { useCallback, useState } from "react";

import { isApiError } from "@/api/errors";
import { useRealtimeReload } from "@/realtime/use-realtime-event";
import { ConversationService } from "@/services/conversation.service";
import type { ConversationMessage, ConversationSummary } from "@/types/message";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type ConversationMessagesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; messages: ConversationMessage[]; conversation: ConversationSummary };

/**
 * Fil de la conversation d'une réservation — 25_Conversation et 27_DocumentExchange (filtré sur les
 * documents). Résout la conversation (une par paire demandeur/tuteur), la marque lue, et se met à jour
 * en direct quand un vocal / un document / un appel arrive (temps réel).
 */
export function useConversationMessages(bookingId: string | undefined) {
  const [state, setState] = useState<ConversationMessagesState>({ status: "loading" });

  const load = useCallback(
    async (silent = false) => {
      if (!bookingId) {
        setState({ status: "error", message: t("hooks.useConversationMessages.thisConversationCouldNotBe") });
        return;
      }
      if (!silent) setState({ status: "loading" });
      try {
        const conversation = await ConversationService.getConversationForBooking(bookingId);
        const { items } = await ConversationService.getConversationMessages(conversation.id, { bookingId });
        setState({ status: "success", messages: items, conversation });
        // Ouvrir le fil = tout lire : le compteur de non-lus de l'autre écran retombe à zéro.
        void ConversationService.markRead(conversation.id).catch(() => undefined);
      } catch (error) {
        if (silent) return;
        setState({
          status: "error",
          message: isApiError(error) ? error.message : t("hooks.useConversationMessages.unableToLoadTheConversation"),
        });
      }
    },
    [bookingId],
  );

  useLoadEffect(load);

  useRealtimeReload(() => void load(true), ["message.", "call.", "session.", "booking."]);

  // Identité stable (utilisée dans useFocusEffect) ; au retour sur l'écran on relit sans clignotement.
  const reload = useCallback(() => load(true), [load]);

  return { state, reload };
}
