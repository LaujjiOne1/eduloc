import { useEffect, useState } from "react";

import { ConversationService } from "@/services/conversation.service";

/**
 * Droit d'appeler jugé sur la PAIRE demandeur / tuteur (conversation.canCall) et non sur la seule réservation ouverte :
 * une demande refusée ou en attente ne doit pas empêcher d'appeler tant qu'une autre séance est confirmée ou en cours.
 * `null` pendant la lecture ; le serveur reste l'autorité (CALL_NOT_ALLOWED).
 */
export function useConversationCanCall(conversationId: string | null | undefined): boolean | null {
  const [result, setResult] = useState<{ id: string; canCall: boolean } | null>(null);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    ConversationService.getConversation(conversationId)
      .then((conversation) => {
        if (!cancelled) setResult({ id: conversationId, canCall: conversation.canCall });
      })
      .catch(() => {
        if (!cancelled) setResult({ id: conversationId, canCall: false });
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  if (!conversationId) return false;
  return result?.id === conversationId ? result.canCall : null;
}
