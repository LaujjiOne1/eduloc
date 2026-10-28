import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";

import { buildResultsMapHtml, type MapOrigin } from "@/components/map/results-map-html";
import type { Tutor } from "@/types/tutor";
import { useTranslation } from "react-i18next";

export type MapLibreResultsMapProps = {
  tutors: Tutor[];
  selectedTutorId: string | null;
  onSelectTutor: (tutor: Tutor) => void;
  searchLocationQuery?: string;
  /** Position du demandeur (point « Vous » + cadrage selon la distance). */
  origin?: MapOrigin | null;
};

/**
 * Web : même page de carte (MapLibre GL JS) dans un iframe ; la sélection circule par postMessage.
 * La page est servie par une URL blob et non par `srcDoc` : MapLibre n'y finit jamais de charger son style
 * (le chargement reste bloqué), alors qu'il charge normalement depuis une URL blob de même origine.
 */
export function MapLibreResultsMap({ tutors, selectedTutorId, onSelectTutor, origin = null }: MapLibreResultsMapProps) {
  const { t: tr } = useTranslation();
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [initialSelection] = useState(selectedTutorId);
  const pageUrl = useMemo(
    () => URL.createObjectURL(new Blob([buildResultsMapHtml(tutors, initialSelection, origin)], { type: "text/html" })),
    [tutors, initialSelection, origin],
  );
  useEffect(() => () => URL.revokeObjectURL(pageUrl), [pageUrl]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data as { type?: string; id?: string } | null;
      if (data?.type === "select" && data.id) {
        const tutor = tutors.find((t) => t.id === data.id);
        if (tutor) onSelectTutor(tutor);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [tutors, onSelectTutor]);

  useEffect(() => {
    if (!selectedTutorId) return;
    // La page expose window.__select ; l'iframe (srcDoc) partage l'origine de l'application.
    const win = frame.current?.contentWindow as (Window & { __select?: (id: string) => void }) | null | undefined;
    try {
      win?.__select?.(selectedTutorId);
    } catch {
      // page pas encore prête : la sélection initiale est déjà dans le HTML
    }
  }, [selectedTutorId]);

  return (
    <View style={{ flex: 1 }}>
      {createElement("iframe", {
        ref: frame,
        src: pageUrl,
        title: tr("map.maplibreResultsMap.tutorsMap"),
        style: { border: 0, width: "100%", height: "100%" },
      })}
    </View>
  );
}
