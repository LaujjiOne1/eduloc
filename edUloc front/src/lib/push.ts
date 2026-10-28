import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

import { api } from "@/api/http";
import { t } from "@/i18n";

type NotificationsModule = typeof import("expo-notifications");

/**
 * Notifications push natives (app fermée ou en arrière-plan), comme Messenger :
 *  - canal Android « calls » à priorité maximale pour les appels entrants (sonnerie, écran de verrouillage) ;
 *  - jeton Expo enregistré côté serveur (POST /devices), qui s'en sert pour les envois (voir ExpoPushProvider).
 *
 * Prérequis hors code : application compilée (EAS / dev build), `eas init` (projectId) et identifiants
 * FCM / APNs configurés dans EAS.
 *
 * Expo Go (Android, SDK 53+) : le module `expo-notifications` LÈVE UNE ERREUR dès son chargement. Il n'est donc
 * jamais importé statiquement : on le charge à la demande, uniquement hors Expo Go et hors web. Dans Expo Go, ce
 * fichier ne fait rien et l'app garde ses alertes en direct (temps réel, bandeau et sonnerie d'appel au premier plan).
 */
const isNative = Platform.OS === "ios" || Platform.OS === "android";
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let cached: NotificationsModule | null | undefined;

function notifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (!isNative || isExpoGo) {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("expo-notifications") as NotificationsModule;
  } catch {
    cached = null;
  }
  return cached;
}

let registeredToken: string | null = null;

/** Premier plan : un appel entrant est déjà signalé par le bandeau + la sonnerie de l'app — pas de doublon système. */
export function configureForegroundPresentation(): void {
  const Notifications = notifications();
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const isCall = notification.request.content.data?.type === "call.incoming";
      return {
        shouldShowBanner: !isCall,
        shouldShowList: !isCall,
        shouldPlaySound: !isCall,
        shouldSetBadge: false,
      };
    },
  });
}

async function ensureAndroidChannels(Notifications: NotificationsModule): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: t("common.notifications"),
    importance: Notifications.AndroidImportance.HIGH,
  });
  await Notifications.setNotificationChannelAsync("calls", {
    name: t("lib.push.incomingCalls"),
    importance: Notifications.AndroidImportance.MAX,
    sound: "ringtone.wav",
    vibrationPattern: [0, 800, 1200, 800, 1200],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableVibrate: true,
  });
}

/** Demande la permission, crée les canaux et enregistre le jeton de l'appareil. Ne lève jamais. */
export async function registerForPush(): Promise<void> {
  const Notifications = notifications();
  if (!Notifications) return;
  try {
    await ensureAndroidChannels(Notifications);
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.post("/devices", { token, platform: Platform.OS === "ios" ? "IOS" : "ANDROID" });
    registeredToken = token;
  } catch {
    // simulateur, hors ligne, identifiants push absents : pas de push, le reste fonctionne.
  }
}

/** À la déconnexion : cet appareil ne doit plus recevoir les notifications de ce compte. */
export async function unregisterPush(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  await api.post("/devices/unregister", { token }).catch(() => undefined);
}

/** Écoute le toucher d'une notification (app en arrière-plan ou fermée). */
export function onNotificationOpened(handler: (data: Record<string, unknown>) => void): () => void {
  const Notifications = notifications();
  if (!Notifications) return () => undefined;
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    handler(response.notification.request.content.data ?? {});
  });
  // Ouverture à froid : la notification qui a lancé l'app.
  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (response) handler(response.notification.request.content.data ?? {});
    })
    .catch(() => undefined);
  return () => subscription.remove();
}
