import { Platform } from "react-native";

/**
 * Notifications système du navigateur (onglet en arrière-plan ou fenêtre réduite) — l'équivalent web
 * du bandeau « Messenger ». Elles ne couvrent pas un navigateur fermé : cela demande un service worker
 * et des clés VAPID (web push), non fournis ici.
 */
const supported = () => Platform.OS === "web" && typeof window !== "undefined" && "Notification" in window;

export function webAlertsGranted(): boolean {
  return supported() && Notification.permission === "granted";
}

/** À appeler suite à un geste de l'utilisateur (les navigateurs refusent la demande sinon). */
export function requestWebAlertPermission(): void {
  if (supported() && Notification.permission === "default") void Notification.requestPermission().catch(() => undefined);
}

export function isPageHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

export type WebAlert = {
  title: string;
  body: string;
  /** Une alerte de même tag remplace la précédente (un appel ne s'empile pas). */
  tag: string;
  /** Reste affichée jusqu'à action (appel entrant). */
  persistent?: boolean;
  onClick?: () => void;
};

/** Affiche l'alerte si la page est masquée et la permission accordée. Retourne sa fermeture. */
export function showWebAlert({ title, body, tag, persistent, onClick }: WebAlert): () => void {
  if (!webAlertsGranted() || !isPageHidden()) return () => undefined;
  try {
    const notification = new Notification(title, { body, tag, requireInteraction: persistent });
    notification.onclick = () => {
      window.focus();
      notification.close();
      onClick?.();
    };
    return () => notification.close();
  } catch {
    return () => undefined;
  }
}
