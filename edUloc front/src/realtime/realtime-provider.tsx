import { type ReactNode, useEffect } from "react";

import { IncomingCallBanner } from "@/components/call/incoming-call-banner";
import { LessonAlarmBanner } from "@/components/call/lesson-alarm-banner";
import { AuthService } from "@/services/auth.service";
import { useAuthStore } from "@/store/auth.store";
import { Realtime } from "./realtime-client";
import { RealtimeEffects } from "./realtime-effects";
import { useRealtimeEvent } from "./use-realtime-event";

/** Événements qui changent le rôle / la visibilité du tuteur : on relit /users/me pour mettre le store à jour. */
const ACCOUNT_EVENTS = ["tutor.application.", "tutor.suspended"] as const;

/**
 * Maintient la connexion temps réel tant qu'un utilisateur est connecté.
 * Les écrans s'abonnent eux-mêmes via useRealtimeReload / useRealtimeEvent.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const userId = useAuthStore((s) => s.user?.id ?? null);

  useEffect(() => {
    if (!userId) {
      Realtime.disconnect();
      return;
    }
    void Realtime.connect(userId);
    return () => Realtime.disconnect();
  }, [userId]);

  useRealtimeEvent(ACCOUNT_EVENTS, () => {
    // Approbation / rejet du dossier, suspension : le menu et les gardes en dépendent.
    void AuthService.getMe().catch(() => undefined);
  });

  return (
    <>
      {children}
      {userId ? <RealtimeEffects /> : null}
      {userId ? <IncomingCallBanner /> : null}
      {userId ? <LessonAlarmBanner /> : null}
    </>
  );
}
