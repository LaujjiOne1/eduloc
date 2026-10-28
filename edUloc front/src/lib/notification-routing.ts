import type { Href } from "expo-router";

import type { UserMode } from "@/store/auth.store";

export type NotificationTarget = {
  /** Type d'événement serveur (« call.incoming », « booking.requested »…) ou de notification (« booking_request »…). */
  type: string;
  bookingId?: string | null;
  callId?: string | null;
  recipientRole?: string | null;
};

/**
 * Écran à ouvrir quand on touche une notification (push, bandeau ou ligne de la liste).
 * Le mode actif (apprenti / tuteur) fixe l'espace ; un appel entrant impose celui de l'appelé.
 */
export function routeForNotification(target: NotificationTarget, mode: UserMode): Href | null {
  const kind = target.type.toLowerCase().replace(/_/g, ".");
  const bookingId = target.bookingId || null;

  if (kind === "call.incoming") {
    if (!bookingId || !target.callId) return null;
    const base =
      target.recipientRole === "TUTOR"
        ? `/tutor-dashboard/appointments/${bookingId}/call`
        : `/apprenti-dashboard/bookings/${bookingId}/call`;
    return `${base}?callId=${target.callId}` as Href;
  }

  const tutor = mode === "tutor";
  if (kind.startsWith("message") || kind.endsWith("message") || kind === "missed.call") {
    return (tutor ? "/tutor-dashboard/conversations" : "/apprenti-dashboard/conversations") as Href;
  }
  if (!bookingId) return null;
  if (tutor) {
    // Une demande en attente s'ouvre sur sa fiche d'acceptation, le reste sur le rendez-vous.
    return (kind === "booking.requested" || kind === "booking.request" || kind === "booking.conflict"
      ? `/tutor-dashboard/requests/${bookingId}`
      : `/tutor-dashboard/appointments/${bookingId}`) as Href;
  }
  return `/apprenti-dashboard/bookings/${bookingId}` as Href;
}
