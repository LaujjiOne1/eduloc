import { Centrifuge, type PublicationContext } from "centrifuge";

import { rebaseLocalhost } from "@/api/config";
import { api } from "@/api/http";

/**
 * Temps réel : UN abonnement durable au canal personnel de l'utilisateur (`personal:#<userId>`).
 * Tous les événements métier y transitent (booking.*, session.*, message.*, call.*, tutor.*…).
 * Le serveur publie après COMMIT (outbox) et Centrifugo rejoue l'historique manqué à la reconnexion.
 *
 * Dégradation : si Centrifugo est injoignable l'app reste pleinement utilisable (rechargement
 * manuel / à l'ouverture des écrans) — le temps réel n'est jamais une dépendance bloquante.
 */
export interface RealtimeEvent {
  eventId: string;
  /** « booking.confirmed », « message.voice.created », « realtime.resync »… */
  type: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

interface ConnectionTokenDto {
  token: string;
  url: string;
  channel: string;
  expiresIn: number;
}

type Listener = (event: RealtimeEvent) => void;

const listeners = new Set<Listener>();
/** Dédoublonnage : un événement peut arriver en direct ET via la récupération de l'historique. */
const seen = new Set<string>();
const MAX_SEEN = 200;

let client: Centrifuge | null = null;
let connectedUserId: string | null = null;
let connecting: Promise<void> | null = null;

function emit(event: RealtimeEvent): void {
  if (event.eventId) {
    if (seen.has(event.eventId)) return;
    seen.add(event.eventId);
    if (seen.size > MAX_SEEN) seen.delete(seen.values().next().value as string);
  }
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // un abonné défaillant ne doit pas priver les autres de l'événement
    }
  });
}

function toEvent(data: unknown): RealtimeEvent | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Partial<RealtimeEvent>;
  if (typeof raw.type !== "string") return null;
  return {
    eventId: typeof raw.eventId === "string" ? raw.eventId : "",
    type: raw.type,
    aggregateId: typeof raw.aggregateId === "string" ? raw.aggregateId : "",
    payload: (raw.payload && typeof raw.payload === "object" ? raw.payload : {}) as Record<string, unknown>,
  };
}

export const Realtime = {
  /** Ouvre (ou conserve) la connexion de cet utilisateur. N'échoue jamais : retourne quand c'est tenté. */
  async connect(userId: string): Promise<void> {
    if (client && connectedUserId === userId) return;
    Realtime.disconnect();
    connectedUserId = userId;

    connecting = (async () => {
      try {
        const connection = await api.get<ConnectionTokenDto>("/realtime/connection-token");
        // L'utilisateur a pu changer / se déconnecter pendant l'appel réseau.
        if (connectedUserId !== userId) return;

        const centrifuge = new Centrifuge(rebaseLocalhost(connection.url), {
          token: connection.token,
          // Jeton de 15 min : renouvelé automatiquement par la bibliothèque.
          getToken: async () => (await api.get<ConnectionTokenDto>("/realtime/connection-token")).token,
        });
        const subscription = centrifuge.newSubscription(connection.channel);
        subscription.on("publication", (ctx: PublicationContext) => {
          const event = toEvent(ctx.data);
          if (event) emit(event);
        });
        subscription.on("subscribed", (ctx) => {
          // Historique irrécupérable après une longue coupure : les écrans doivent tout relire.
          if (ctx.wasRecovering && !ctx.recovered) {
            emit({ eventId: "", type: "realtime.resync", aggregateId: "", payload: {} });
          }
        });
        subscription.subscribe();
        centrifuge.connect();
        client = centrifuge;
      } catch {
        // Hors ligne / Centrifugo arrêté : on réessaiera à la prochaine ouverture de session.
        if (connectedUserId === userId) connectedUserId = null;
      }
    })();
    await connecting;
  },

  disconnect(): void {
    connectedUserId = null;
    connecting = null;
    if (client) {
      client.disconnect();
      client = null;
    }
    seen.clear();
  },

  /**
   * Événement local : le serveur ne renvoie pas un événement à celui qui l'a provoqué (le tuteur qui accepte
   * ne reçoit pas « booking.confirmed »). Les écrans déjà ouverts se relisent donc grâce à ce signal.
   */
  emitLocal(type: string, aggregateId = ""): void {
    emit({ eventId: "", type, aggregateId, payload: {} });
  },

  /** Écoute tous les événements du canal personnel. Retourne la fonction de désabonnement. */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
