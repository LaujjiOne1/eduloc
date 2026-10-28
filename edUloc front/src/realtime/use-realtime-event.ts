import { useEffect, useRef } from "react";

import { type RealtimeEvent, Realtime } from "./realtime-client";

/**
 * Appelle `handler` pour chaque événement temps réel dont le type commence par l'un des `prefixes`
 * (« booking. », « message. », « session.started »…). « realtime.resync » (reconnexion sans
 * historique) est toujours transmis : l'écran doit alors tout relire.
 */
export function useRealtimeEvent(prefixes: readonly string[], handler: (event: RealtimeEvent) => void): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  const key = prefixes.join("|");
  useEffect(() => {
    const list = key.split("|");
    return Realtime.subscribe((event) => {
      if (event.type === "realtime.resync" || list.some((prefix) => event.type.startsWith(prefix))) {
        handlerRef.current(event);
      }
    });
  }, [key]);
}

/** Recharge silencieusement une liste / un détail quand un événement concerné arrive. */
export function useRealtimeReload(reload: () => void, prefixes: readonly string[]): void {
  useRealtimeEvent(prefixes, () => reload());
}
