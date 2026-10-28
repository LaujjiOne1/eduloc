import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";

import { MAP_BEARING, MAP_PITCH, MAP_ZOOM, type MapOrigin } from "@/components/map/results-map-html";
import { WebViewResultsMap } from "@/components/map/webview-results-map";
import type { Tutor } from "@/types/tutor";
import type { CameraRef } from "@maplibre/maplibre-react-native";
import { useTranslation } from "react-i18next";

export type MapLibreResultsMapProps = {
  tutors: Tutor[];
  selectedTutorId: string | null;
  onSelectTutor: (tutor: Tutor) => void;
  searchLocationQuery?: string;
  origin?: MapOrigin | null;
};

const DEFAULT_CENTER: [number, number] = [47.525, -18.895];
const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

type MapLibreModule = typeof import("@maplibre/maplibre-react-native");

function loadMapLibre(): MapLibreModule | null {
  if (Constants.appOwnership === "expo" || Constants.executionEnvironment === "storeClient") {
    return null;
  }

  try {
    return require("@maplibre/maplibre-react-native") as MapLibreModule;
  } catch {
    return null;
  }
}

function getCoordinatesForTutor(tutor: Tutor, index: number): [number, number] {
  if (tutor.location.longitude != null && tutor.location.latitude != null) {
    return [tutor.location.longitude, tutor.location.latitude];
  }

  const angle = (index * 2 * Math.PI) / 3;
  const radius = 0.012;
  return [DEFAULT_CENTER[0] + radius * Math.cos(angle), DEFAULT_CENTER[1] + radius * Math.sin(angle)];
}

export function MapLibreResultsMap({ tutors, selectedTutorId, onSelectTutor, origin = null }: MapLibreResultsMapProps) {
  const { t } = useTranslation();
  const cameraRef = useRef<CameraRef>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const selectedTutor = tutors.find((tutor) => tutor.id === selectedTutorId) ?? null;
  const mapLibre = loadMapLibre();

  useEffect(() => {
    if (!mapLoaded || !selectedTutor) return;

    cameraRef.current?.flyTo({
      center: getCoordinatesForTutor(selectedTutor, tutors.indexOf(selectedTutor)),
      zoom: Math.max(MAP_ZOOM, 14),
      duration: 700,
    });
  }, [mapLoaded, selectedTutor, tutors]);

  // Expo Go : le module natif MapLibre n'existe pas (il demande un development build) → carte dans une WebView.
  if (!mapLibre) {
    return <WebViewResultsMap tutors={tutors} selectedTutorId={selectedTutorId} onSelectTutor={onSelectTutor} origin={origin} />;
  }

  const { Camera, Map, Marker } = mapLibre;

  return (
    <View style={styles.container}>
      <Map
        style={styles.map}
        mapStyle={MAP_STYLE_URL}
        attribution={false}
        logo={false}
        onDidFinishLoadingMap={() => setMapLoaded(true)}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: tutors.length > 0 ? getCoordinatesForTutor(tutors[0], 0) : DEFAULT_CENTER,
            zoom: MAP_ZOOM,
            pitch: MAP_PITCH,
            bearing: MAP_BEARING,
          }}
        />
        {origin ? (
          <Marker id="me" lngLat={[origin.longitude, origin.latitude]} anchor="center">
            <View style={styles.me} />
          </Marker>
        ) : null}
        {tutors.map((tutor, index) => {
          const isSelected = tutor.id === selectedTutorId;
          return (
            <Marker
              key={tutor.id}
              id={tutor.id}
              lngLat={getCoordinatesForTutor(tutor, index)}
              anchor="bottom"
              onPress={() => onSelectTutor(tutor)}
            >
              <View style={[styles.marker, isSelected && styles.selectedMarker]}>
                <Text style={[styles.markerLabel, isSelected && styles.selectedMarkerLabel]}>
                  {tutor.firstName[0]}
                </Text>
              </View>
            </Marker>
          );
        })}
      </Map>

      {!mapLoaded ? (
        <View className="absolute inset-0 items-center justify-center bg-paper-alt/80">
          <ActivityIndicator size="small" color="#332E86" />
          <Text className="mt-2 text-[13px] text-ink-soft">{t("common.loadingTheMap")}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  map: { flex: 1 },
  marker: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#332E86",
    borderRadius: 18,
    borderWidth: 2,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  selectedMarker: { backgroundColor: "#332E86", transform: [{ scale: 1.15 }] },
  me: { backgroundColor: "#1d7cf2", borderColor: "#ffffff", borderRadius: 10, borderWidth: 3, height: 20, width: 20 },
  markerLabel: { color: "#332E86", fontSize: 15, fontWeight: "700" },
  selectedMarkerLabel: { color: "#ffffff" },
});
