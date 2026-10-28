import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { PressableScale } from "@/components/motion/pressable-scale";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { buildResultsMapHtml, type MapOrigin } from "@/components/map/results-map-html";
import type { Tutor } from "@/types/tutor";
import { useTranslation } from "react-i18next";

type WebViewResultsMapProps = {
  tutors: Tutor[];
  selectedTutorId: string | null;
  onSelectTutor: (tutor: Tutor) => void;
  origin?: MapOrigin | null;
};

/**
 * Carte des résultats dans une WebView (MapLibre GL JS) : fonctionne dans Expo Go, où le module natif
 * MapLibre n'est pas disponible. Mêmes marqueurs (silhouettes) et même sélection que la carte native.
 */
export function WebViewResultsMap({ tutors, selectedTutorId, onSelectTutor, origin = null }: WebViewResultsMapProps) {
  const { t: tr } = useTranslation();
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // Relance manuelle (connexion lente ou coupée) : on remonte la WebView.
  const [attempt, setAttempt] = useState(0);

  // La page n'est reconstruite que si la liste de tuteurs change (pas à chaque sélection : on la pilote par script).
  const [initialSelection] = useState(selectedTutorId);
  const html = useMemo(() => buildResultsMapHtml(tutors, initialSelection, origin), [tutors, initialSelection, origin]);

  // Pas de carte au bout de 25 s : on propose de réessayer plutôt que de laisser un chargement infini.
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setFailed(true), 25_000);
    return () => clearTimeout(timer);
  }, [ready, attempt]);

  useEffect(() => {
    if (!ready || !selectedTutorId) return;
    webRef.current?.injectJavaScript(`window.__select && window.__select(${JSON.stringify(selectedTutorId)}); true;`);
  }, [ready, selectedTutorId]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type: string; id?: string };
      if (message.type === "ready") setReady(true);
      else if (message.type === "error") setFailed(true);
      else if (message.type === "select" && message.id) {
        const tutor = tutors.find((t) => t.id === message.id);
        if (tutor) onSelectTutor(tutor);
      }
    } catch {
      // message étranger : ignoré
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        key={attempt}
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://eduloc.local/" }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        // La carte gère ses gestes (glisser, pincer) : pas de défilement de la page autour.
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        style={styles.map}
        onError={() => setFailed(true)}
      />
      {!ready && !failed ? (
        <View style={StyleSheet.absoluteFill} className="items-center justify-center bg-paper-alt/80" pointerEvents="none">
          <ActivityIndicator size="small" color="#332E86" />
          <Text className="mt-2 text-[13px] text-ink-soft">{tr("common.loadingTheMap")}</Text>
        </View>
      ) : null}
      {failed ? (
        <View style={StyleSheet.absoluteFill} className="items-center justify-center bg-paper-alt px-8" pointerEvents="none">
          <Text className="text-center text-[13.5px] text-ink-soft">
            {tr("map.webviewResultsMap.unableToLoadTheMap")}</Text>
        </View>
      ) : null}
      {failed ? (
        <View style={[StyleSheet.absoluteFill, { top: "58%" }]} className="items-center px-8">
          <PressableScale
            onPress={() => {
              setFailed(false);
              setReady(false);
              setAttempt((n) => n + 1);
            }}
            accessibilityLabel={tr("map.webviewResultsMap.tryLoadingTheMapAgain")}
          >
            <View className="rounded-full bg-primary px-5 py-2.5">
              <Text className="text-[13.5px] font-bold text-white">{tr("common.tryAgain")}</Text>
            </View>
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  map: { flex: 1, backgroundColor: "transparent" },
});
