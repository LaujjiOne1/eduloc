import "../global.css";
import "@/i18n";
import "@/store/language.store";

import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { toAuthenticatedUser } from "@/api/mappers";
import { Session } from "@/api/session";
import { asyncStorageSession } from "@/api/session-storage";
import { RealtimeProvider } from "@/realtime/realtime-provider";
import { AuthService } from "@/services/auth.service";
import { useAuthStore } from "@/store/auth.store";
import { Fragment, type ReactNode } from "react";
import { useLanguage } from "@/hooks/use-language";

// Démarré à l'import (avant le premier rendu d'un écran) : les requêtes authentifiées attendent
// Session.whenReady(). Le rendu serveur d'Expo Router (export web) n'a pas de `window` : on s'abstient.
if (typeof window !== "undefined") {
  Session.setStorage(asyncStorageSession);
  void AuthService.restoreSession()
    .then((user) => {
      if (user) useAuthStore.getState().setUser(user);
    })
    .catch(() => undefined); // hors ligne : on garde l'utilisateur persisté
}

/** Session → store : un profil rafraîchi met le store à jour ; une session perdue déconnecte l'UI. */
Session.subscribe((me) => {
  const store = useAuthStore.getState();
  if (me) store.setUser(toAuthenticatedUser(me));
  else store.sessionLost();
});

/**
 * Remonte le contenu des écrans quand la langue change : les libellés calculés à la volée (dates, distances, états) sont
 * recalculés et les données rechargées dans la nouvelle langue. La pile de navigation, elle, n'est pas touchée.
 */
function LanguageBoundary({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  return <Fragment key={language}>{children}</Fragment>;
}

// L'écran de départ est toujours l'accueil (« / »), quelle que soit la façon dont les écrans sont déclarés plus bas.
export const unstable_settings = { initialRouteName: "index" };

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RealtimeProvider>
          {/* freezeOnBlur : un écran recouvert ne se re-rend plus tant qu'il n'est pas revenu au premier plan. */}
          <Stack
            screenOptions={{ headerShown: false, freezeOnBlur: true }}
            screenLayout={({ children }) => <LanguageBoundary>{children}</LanguageBoundary>}
          >
            {/* « index » d'abord : le premier écran déclaré est celui où l'application démarre. */}
            <Stack.Screen name="index" />
            {/* La recherche monte du bas comme une feuille (façon Airbnb) au lieu de glisser de côté. */}
            <Stack.Screen name="search/index" options={{ animation: "slide_from_bottom" }} />
          </Stack>
        </RealtimeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
