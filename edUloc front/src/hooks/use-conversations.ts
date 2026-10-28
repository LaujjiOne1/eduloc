import { useCallback, useState } from "react";

import { isApiError } from "@/api/errors";
import { useRealtimeReload } from "@/realtime/use-realtime-event";
import { ConversationService } from "@/services/conversation.service";
import type { ConversationSummary } from "@/types/message";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type ConversationsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "success"; conversations: ConversationSummary[] };

/**
 * Liste des conversations du compte (une par paire demandeur/tuteur) : aperçu du dernier message,
 * nombre de non-lus. Se met à jour en direct à l'arrivée d'un vocal / document / d'une demande.
 */
export function useConversations() {
  const [state, setState] = useState<ConversationsState>({ status: "loading" });

  const load = useCallback(async (silent = false) => {
    if (!silent) setState({ status: "loading" });
    try {
      const conversations = await ConversationService.getConversations();
      setState(conversations.length ? { status: "success", conversations } : { status: "empty" });
    } catch (error) {
      if (silent) return;
      setState({ status: "error", message: isApiError(error) ? error.message : t("hooks.useConversations.unableToLoadYourConversations") });
    }
  }, []);

  useLoadEffect(load);

  useRealtimeReload(() => void load(true), ["message.", "booking."]);

  const retry = useCallback(() => load(), [load]);
  const reload = useCallback(() => load(true), [load]);

  return { state, retry, reload };
}
